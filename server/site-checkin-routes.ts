/**
 * Phase QR-1 — Site QR + GPS check-in HTTP routes.
 *
 * Worker-facing:      POST /api/checkin/attempt
 * Admin-facing:       /api/admin/site-checkin/* (requireAdmin guard)
 *
 * The worker endpoint never trusts a client "GPS passed" value: it re-resolves
 * the QR token server-side, recomputes the haversine distance, and makes the
 * final accept/reject decision. Every attempt (accepted or rejected) is written
 * to the append-only audit table.
 */

import express, { type NextFunction, type Request, type RequestHandler, type Response, type Router } from "express";
import QRCode from "qrcode";
import type { ReviewRouteSession } from "./integration-review-route.ts";
import { requireAdmin } from "./integration-review-route.ts";
import {
  evaluateCheckIn,
  generateQrToken,
  hashQrToken,
  parseCoordinates,
  toIsoTimestamp,
  type CheckInDecision,
  type CheckInSubmission,
  type CheckInIdentity,
} from "./site-checkin.ts";
import {
  buildAttemptRow,
  buildWorkSessionDraft,
} from "./site-checkin.ts";
import {
  type SiteCheckinStore,
  type UpsertSiteCheckinConfigInput,
} from "./site-checkin-repository.ts";

export const CHECKIN_ATTEMPT_ROUTE = "/api/checkin/attempt";
export const SITE_CHECKIN_ADMIN_PREFIX = "/api/admin/site-checkin";
export const CHECKOUT_ROUTE = "/api/checkin/checkout";
export const CURRENT_SESSION_ROUTE = "/api/checkin/current-session";

const GPS_ACCURACY_MAX = 10_000; // reject absurd accuracy values in metres
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_FAILURES = 8;

type CheckInRequest = Request & { session?: ReviewRouteSession & { fullName?: string } };

/** Session guard: a check-in requires an authenticated user (normal app auth). */
function requireCheckInSession(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const session = (request as CheckInRequest).session;
  if (
    session === undefined ||
    typeof session.username !== "string" ||
    session.username.trim().length === 0 ||
    typeof session.userId === "undefined"
  ) {
    response.status(401).json({ error: "Unauthorized", code: "AUTH_REQUIRED" });
    return;
  }

  if ((session as any).mustChangePassword === true) {
    response.status(403).json({
      error: "Password change required before accessing check-in functionality",
      code: "PASSWORD_CHANGE_REQUIRED",
    });
    return;
  }
  next();
}

class FailureRateLimiter {
  private readonly failures = new Map<string, number[]>();

  allow(key: string, nowMs: number): boolean {
    const cutoff = nowMs - RATE_LIMIT_WINDOW_MS;
    const times = (this.failures.get(key) ?? []).filter((t) => t > cutoff);
    this.failures.set(key, times);
    return times.length < RATE_LIMIT_MAX_FAILURES;
  }

  record(key: string, nowMs: number): void {
    const times = this.failures.get(key) ?? [];
    times.push(nowMs);
    this.failures.set(key, times);
  }
}

function identityFromSession(session: CheckInRequest["session"]): CheckInIdentity {
  const label = (session?.fullName || session?.username || "").trim() || "unknown-user";
  return { label };
}

function isValidRadius(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 100_000;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export interface SiteCheckinRouteOptions {
  readonly store: SiteCheckinStore;
  readonly now?: () => string;
  readonly checkInAppBaseUrl?: (request: Request) => string;
}

function defaultAppBaseUrl(request: Request): string {
  const host = request.get("host") ?? "localhost";
  return `http://${host}`;
}

const requireAdminHandler = requireAdmin as unknown as RequestHandler;

export function createSiteCheckinRouter(options: SiteCheckinRouteOptions): Router {
  const router = express.Router();
  const rateLimiter = new FailureRateLimiter();
  const nowIso = options.now ?? (() => new Date().toISOString());

  router.post(
    CHECKIN_ATTEMPT_ROUTE,
    requireCheckInSession,
    async (request: Request, response: Response) => {
      try {
        const session = (request as CheckInRequest).session;
        const identity = identityFromSession(session);
        const rateKey = `${session!.username}:${request.ip ?? "unknown"}`;
        const nowMs = Date.now();

        const body = (request.body ?? {}) as {
          qrToken?: unknown;
          latitude?: unknown;
          longitude?: unknown;
          gpsAccuracy?: unknown;
        };

        if (typeof body.qrToken !== "string" || body.qrToken.trim() === "") {
          return response.status(400).json({ error: "qrToken is required" });
        }

        const submission: CheckInSubmission = {
          qrToken: body.qrToken.trim(),
          latitude: body.latitude,
          longitude: body.longitude,
          gpsAccuracy: toOptionalNumber(body.gpsAccuracy),
        };

        const gpsAccuracy = submission.gpsAccuracy;
        if (typeof gpsAccuracy === "number" && gpsAccuracy > GPS_ACCURACY_MAX) {
          return response.status(400).json({
            error: "gpsAccuracy is implausible",
            code: "INVALID_ACCURACY",
          });
        }

        const tokenHash = hashQrToken(submission.qrToken);
        const config = await options.store.findConfigByTokenHash(tokenHash);

        // Job authorisation: the authenticated worker/contractor must be assigned
        // to the job via the contractorId relationship. jobs.contractorId references
        // contractors.id; workers.contractorId also references contractors.id.
        // If the config has a job and the identity has a contractorId, they must match.
        const workerContractorId = identity.contractorId;
        let authorised = true;
        if (config?.jobId && workerContractorId) {
          const jobConfig = await options.store.findConfigByJobId(config.jobId);
          if (jobConfig && jobConfig.contractorId !== workerContractorId) {
            authorised = false;
          }
        }

        // Build the full decision, incorporating authorisation.
        const baseDecision = evaluateCheckIn({
          config,
          qrToken: submission.qrToken,
          latitude: submission.latitude,
          longitude: submission.longitude,
          gpsAccuracy,
          contractorId: identity.contractorId ?? null,
        });

        const decision: CheckInDecision = {
          qrValid: baseDecision.qrValid,
          gpsValid: baseDecision.gpsValid,
          accepted: baseDecision.accepted && authorised,
          rejectionReason: authorised ? null : "UNAUTHORISED_WORKER",
          siteName: baseDecision.siteName,
          siteCheckinConfigId: baseDecision.siteCheckinConfigId,
          jobId: baseDecision.jobId,
          distanceMetres: baseDecision.distanceMetres,
          permittedRadiusMetres: baseDecision.permittedRadiusMetres,
          submission: baseDecision.submission,
        };

        if (!decision.accepted) {
          if (!rateLimiter.allow(rateKey, nowMs)) {
            const attemptRow = buildAttemptRow(decision, identity, nowIso());
            await options.store.applyCheckInAttempt(attemptRow, null, identity);
            return response.status(429).json({
              error: "Too many failed check-in attempts. Please try again later.",
              code: "TOO_MANY_ATTEMPTS",
            });
          }
          rateLimiter.record(rateKey, nowMs);
        }

        const attemptRow = buildAttemptRow(decision, identity, nowIso());
        const workSessionDraft = buildWorkSessionDraft(decision, identity);
        const { attemptId, workSessionId, duplicate } = await options.store.applyCheckInAttempt(
          attemptRow,
          workSessionDraft,
          identity,
        );

        const responseBody = {
          accepted: decision.accepted,
          qrValid: decision.qrValid,
          gpsValid: decision.gpsValid,
          rejectionReason: decision.rejectionReason,
          siteName: decision.siteName,
          attemptId,
          workSessionId,
          duplicate,
        };

        return response.status(200).json(responseBody);
      } catch (error) {
        console.error("Error processing site check-in:", error);
        return response.status(500).json({ error: "Internal server error" });
      }
    },
  );

  router.get(
    CURRENT_SESSION_ROUTE,
    requireCheckInSession,
    async (request: Request, response: Response) => {
      try {
        const identity = identityFromSession((request as CheckInRequest).session);
        const qrToken = typeof request.query.qrToken === "string" ? request.query.qrToken.trim() : "";
        if (qrToken === "") {
          return response.status(400).json({ error: "qrToken is required" });
        }

        const tokenHash = hashQrToken(qrToken);
        const config = await options.store.findConfigByTokenHash(tokenHash);
        if (!config) {
          return response.status(200).json({ checkedIn: false, active: false, siteName: null });
        }

        const activeSession = await options.store.findActiveSession(config.jobId, identity.label);
        if (!activeSession) {
          return response.status(200).json({
            checkedIn: false,
            active: false,
            siteName: config.siteName,
            jobId: config.jobId,
          });
        }

        return response.status(200).json({
          checkedIn: true,
          active: true,
          siteName: config.siteName,
          jobId: config.jobId,
          workSessionId: activeSession.id,
          checkedInAt: toIsoTimestamp(activeSession.startTime),
        });
      } catch (error) {
        console.error("Error checking worker current session:", error);
        return response.status(500).json({ error: "Internal server error" });
      }
    },
  );

  router.post(
    CHECKOUT_ROUTE,
    requireCheckInSession,
    async (request: Request, response: Response) => {
      try {
        const session = (request as CheckInRequest).session;
        const identity = identityFromSession(session);
        const rateKey = `${session!.username}:${request.ip ?? "unknown"}`;
        const nowMs = Date.now();

        const body = (request.body ?? {}) as {
          qrToken?: unknown;
          latitude?: unknown;
          longitude?: unknown;
          gpsAccuracy?: unknown;
        };

        if (typeof body.qrToken !== "string" || body.qrToken.trim() === "") {
          return response.status(400).json({ error: "qrToken is required" });
        }

        const submission: CheckInSubmission = {
          qrToken: body.qrToken.trim(),
          latitude: body.latitude,
          longitude: body.longitude,
          gpsAccuracy: toOptionalNumber(body.gpsAccuracy),
        };

        const gpsAccuracy = submission.gpsAccuracy;
        if (typeof gpsAccuracy === "number" && gpsAccuracy > GPS_ACCURACY_MAX) {
          return response.status(400).json({
            error: "gpsAccuracy is implausible",
            code: "INVALID_ACCURACY",
          });
        }

        const tokenHash = hashQrToken(submission.qrToken);
        const config = await options.store.findConfigByTokenHash(tokenHash);

        // Build the full decision using existing evaluateCheckIn logic
        // for QR validation, GPS verification, and contractor authorisation.
        const baseDecision = evaluateCheckIn({
          config,
          qrToken: submission.qrToken,
          latitude: submission.latitude,
          longitude: submission.longitude,
          gpsAccuracy,
          contractorId: identity.contractorId ?? null,
        });

        const decision: CheckInDecision = {
          qrValid: baseDecision.qrValid,
          gpsValid: baseDecision.gpsValid,
          accepted: baseDecision.accepted,
          rejectionReason: baseDecision.rejectionReason,
          siteName: baseDecision.siteName,
          siteCheckinConfigId: baseDecision.siteCheckinConfigId,
          jobId: baseDecision.jobId,
          distanceMetres: baseDecision.distanceMetres,
          permittedRadiusMetres: baseDecision.permittedRadiusMetres,
          submission: baseDecision.submission,
        };

        // Apply check-out through the repository layer.
        // The repository will:
        //   - verify an active work session exists for this worker/contractor/job
        //   - close the session on success
        //   - reject with appropriate reason if no active session / invalid QR / failed GPS
        const attemptRow = buildAttemptRow(decision, identity, nowIso());
        const { attemptId, workSessionId, closed } = await options.store.applyCheckOutAttempt(
          attemptRow,
          identity,
        );

        const responseBody = {
          accepted: decision.accepted,
          qrValid: decision.qrValid,
          gpsValid: decision.gpsValid,
          rejectionReason: decision.rejectionReason,
          siteName: decision.siteName,
          attemptId,
          workSessionId,
          closed,
        };

        return response.status(200).json(responseBody);
      } catch (error) {
        console.error("Error processing site check-out:", error);
        return response.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // ---- Admin: QR / config management (requireAdmin; never public) ----

  router.get(`${SITE_CHECKIN_ADMIN_PREFIX}/configs`, requireAdminHandler, async (_req, res) => {
    const configs = await options.store.listConfigs();
    res.json({ configs });
  });

  router.post(
    `${SITE_CHECKIN_ADMIN_PREFIX}/configs`,
    requireAdminHandler,
    async (request: Request, response: Response) => {
      try {
        const body = request.body ?? {};
        const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
        const siteName = typeof body.siteName === "string" ? body.siteName.trim() : null;
        const siteLatitude = typeof body.siteLatitude === "string" ? body.siteLatitude.trim() : "";
        const siteLongitude = typeof body.siteLongitude === "string" ? body.siteLongitude.trim() : "";
        const radius = toOptionalNumber(body.allowedRadiusMetres);
        const qrEnabled = body.qrEnabled !== false;
        const gpsEnabled = body.gpsEnabled !== false;
        const keepExistingToken = body.keepExistingToken === true;

        if (!jobId || !siteLatitude || !siteLongitude) {
          return response
            .status(400)
            .json({ error: "jobId, siteLatitude and siteLongitude are required" });
        }
        const coords = parseCoordinates(siteLatitude, siteLongitude);
        if (!coords) {
          return response.status(400).json({ error: "Invalid site coordinates" });
        }
        if (!isValidRadius(radius)) {
          return response.status(400).json({ error: "allowedRadiusMetres must be a positive number" });
        }
        if (!siteName) {
          return response.status(400).json({ error: "siteName is required" });
        }

        const existing = await options.store.findConfigByJobId(jobId);
        const createdBy = ((request as CheckInRequest).session?.username ?? "admin").trim();

        let input: UpsertSiteCheckinConfigInput;
        if (keepExistingToken && existing) {
          input = {
            jobId,
            siteName,
            siteLatitude,
            siteLongitude,
            allowedRadiusMetres: radius,
            qrEnabled,
            gpsEnabled,
            qrToken: existing.qrToken,
            qrTokenHash: hashQrToken(existing.qrToken),
            qrTokenExpiresAt: existing.qrTokenExpiresAt ? new Date(existing.qrTokenExpiresAt) : null,
            createdBy,
          };
        } else {
          const qrToken = generateQrToken();
          input = {
            jobId,
            siteName,
            siteLatitude,
            siteLongitude,
            allowedRadiusMetres: radius,
            qrEnabled,
            gpsEnabled,
            qrToken,
            qrTokenHash: hashQrToken(qrToken),
            qrTokenExpiresAt: null,
            createdBy,
          };
        }

        const saved = await options.store.createOrUpdateConfig(input);
        return response.status(200).json({
          config: {
            id: saved.id,
            jobId: saved.jobId,
            siteName: saved.siteName,
            siteLatitude: saved.siteLatitude,
            siteLongitude: saved.siteLongitude,
            allowedRadiusMetres: saved.allowedRadiusMetres,
            qrEnabled: saved.qrEnabled,
            gpsEnabled: saved.gpsEnabled,
            qrToken: saved.qrToken,
          },
        });
      } catch (error: any) {
        console.error("❌ Error saving site check-in policy:", error);
        return response.status(500).json({
          error: error?.message || "Failed to save site check-in policy",
        });
      }
    },
  );

  router.post(
    `${SITE_CHECKIN_ADMIN_PREFIX}/configs/:configId/rotate-token`,
    requireAdminHandler,
    async (request, response) => {
      const configId = request.params.configId;
      const existing = (await options.store.listConfigs()).find((c) => c.id === configId);
      if (!existing) {
        return response.status(404).json({ error: "Site check-in config not found" });
      }
      const qrToken = generateQrToken();
      await options.store.rotateConfigToken(
        configId,
        qrToken,
        hashQrToken(qrToken),
        null,
        ((request as CheckInRequest).session?.username ?? "admin").trim(),
      );
      return response.status(200).json({ configId, qrToken });
    },
  );

  router.get(
    `${SITE_CHECKIN_ADMIN_PREFIX}/configs/:configId/qr`,
    requireAdminHandler,
    async (request, response) => {
      const configId = request.params.configId;
      const existing = (await options.store.listConfigs()).find((c) => c.id === configId);
      if (!existing) {
        return response.status(404).json({ error: "Site check-in config not found" });
      }
      const baseUrl = options.checkInAppBaseUrl
        ? options.checkInAppBaseUrl(request)
        : defaultAppBaseUrl(request);
      const payload = `${baseUrl}/checkin?t=${encodeURIComponent(existing.qrToken)}`;
      const dataUrl = await QRCode.toDataURL(payload, { width: 512, margin: 2 });
      return response.status(200).json({
        configId,
        siteName: existing.siteName,
        payload,
        dataUrl,
      });
    },
  );

  // Keep TS happy about the unused NextFunction import surface.
  void (0 as unknown as NextFunction);

  return router;
}
