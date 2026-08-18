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
  haversineDistanceMetres,
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
  type SiteCheckinConfigRecord,
  type UpsertSiteCheckinConfigInput,
} from "./site-checkin-repository.ts";
import { buildAttendanceTimeline } from "./attendance-timeline.ts";

export const CHECKIN_ATTEMPT_ROUTE = "/api/checkin/attempt";
export const START_BREAK_ROUTE = "/api/checkin/start-break";
export const END_BREAK_ROUTE = "/api/checkin/end-break";
export const GPS_SIGNAL_ROUTE = "/api/checkin/gps-signal";
export const SITE_CHECKIN_ADMIN_PREFIX = "/api/admin/site-checkin";
export const CHECKOUT_ROUTE = "/api/checkin/checkout";
export const CURRENT_SESSION_ROUTE = "/api/checkin/current-session";
export const TODAY_TIMELINE_ROUTE = "/api/checkin/today-timeline";
export const SITE_CONFIG_WORKER_ROUTE = "/api/checkin/site-config";

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

        // Enforce: A worker can have only one active work session at a time.
        const existingActive = await options.store.findActiveSessionForWorker(identity.label);
        if (existingActive) {
          return response.status(409).json({
            accepted: false,
            qrValid: true,
            gpsValid: true,
            rejectionReason: "ALREADY_CHECKED_IN",
            siteName: existingActive.jobSiteLocation,
            workSessionId: existingActive.id,
            error: "You already have an active work session. Please clock out before checking in again.",
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
          rejectionReason: authorised ? baseDecision.rejectionReason : "UNAUTHORISED_WORKER",
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
      } catch (error: any) {
        console.error("❌ Error processing site check-in:", error);
        return response.status(500).json({ error: error?.message || "Internal server error" });
      }
    },
  );

  router.get(
    CURRENT_SESSION_ROUTE,
    requireCheckInSession,
    async (request: Request, response: Response) => {
      try {
        const session = (request as CheckInRequest).session;
        const identity = identityFromSession(session);
        const qrToken = typeof request.query.qrToken === "string" ? request.query.qrToken.trim() : "";

        // Check if worker has ANY active or on-break session
        const workerActive = await options.store.findActiveSessionForWorker(identity.label);
        const workerSessions = await options.store.getWorkerWorkSessions(identity.label);
        const timeline = buildAttendanceTimeline(workerSessions, identity.label);

        if (workerActive) {
          const currentTimelineSess = timeline.sessions.find((s) => s.id === workerActive.id) || timeline.sessions[timeline.sessions.length - 1];
          const isBreak = workerActive.status === "on_break";
          const displayStatus = isBreak ? "ON BREAK" : "ON SITE";

          return response.status(200).json({
            checkedIn: true,
            active: true,
            status: workerActive.status,
            displayStatus,
            siteName: workerActive.jobSiteLocation ?? "Active Site",
            jobId: workerActive.jobId,
            workSessionId: workerActive.id,
            checkedInAt: toIsoTimestamp(workerActive.startTime),
            clockInTime: toIsoTimestamp(workerActive.startTime),
            breakStartTime: currentTimelineSess?.breakStartTime ?? null,
            breakEndTime: currentTimelineSess?.breakEndTime ?? null,
            clockOutTime: null,
            breaks: currentTimelineSess?.breaks ?? [],
            workedDurationSeconds: currentTimelineSess?.workedDurationSeconds ?? 0,
            breakDurationSeconds: currentTimelineSess?.breakDurationSeconds ?? 0,
            totalWorkedSeconds: timeline.totalWorkedSeconds,
            totalBreakSeconds: timeline.totalBreakSeconds,
            attendanceFlag: timeline.attendanceFlag,
            locationSignalLost: currentTimelineSess?.locationSignalLost ?? false,
          });
        }

        // When not currently clocked in
        const latestTodaySession = timeline.sessions.length > 0 ? timeline.sessions[timeline.sessions.length - 1] : null;

        return response.status(200).json({
          checkedIn: false,
          active: false,
          status: "completed",
          displayStatus: "CLOCKED OUT",
          siteName: latestTodaySession?.siteName ?? null,
          workSessionId: latestTodaySession?.id ?? null,
          checkedInAt: latestTodaySession?.clockInTime ?? null,
          clockInTime: latestTodaySession?.clockInTime ?? null,
          breakStartTime: latestTodaySession?.breakStartTime ?? null,
          breakEndTime: latestTodaySession?.breakEndTime ?? null,
          clockOutTime: latestTodaySession?.clockOutTime ?? null,
          breaks: latestTodaySession?.breaks ?? [],
          workedDurationSeconds: latestTodaySession?.workedDurationSeconds ?? 0,
          breakDurationSeconds: latestTodaySession?.breakDurationSeconds ?? 0,
          totalWorkedSeconds: timeline.totalWorkedSeconds,
          totalBreakSeconds: timeline.totalBreakSeconds,
          attendanceFlag: timeline.attendanceFlag,
          locationSignalLost: false,
        });
      } catch (error) {
        console.error("Error checking worker current session:", error);
        return response.status(500).json({ error: "Internal server error" });
      }
    },
  );

  router.get(
    TODAY_TIMELINE_ROUTE,
    requireCheckInSession,
    async (request: Request, response: Response) => {
      try {
        const session = (request as CheckInRequest).session;
        const identity = identityFromSession(session);
        const workerSessions = await options.store.getWorkerWorkSessions(identity.label);
        const timeline = buildAttendanceTimeline(workerSessions, identity.label);
        return response.status(200).json(timeline);
      } catch (error) {
        console.error("Error fetching worker attendance timeline:", error);
        return response.status(500).json({ error: "Internal server error" });
      }
    },
  );

  router.post(
    START_BREAK_ROUTE,
    requireCheckInSession,
    async (request: Request, response: Response) => {
      try {
        const session = (request as CheckInRequest).session;
        const identity = identityFromSession(session);
        const body = (request.body ?? {}) as {
          workSessionId?: unknown;
          latitude?: unknown;
          longitude?: unknown;
          gpsAccuracy?: unknown;
        };

        const activeSession = await options.store.findActiveSessionForWorker(identity.label);
        if (!activeSession) {
          return response.status(400).json({
            accepted: false,
            error: "No active work session found.",
            rejectionReason: "NO_ACTIVE_SESSION",
          });
        }

        if (activeSession.status === "on_break") {
          return response.status(400).json({
            accepted: false,
            error: "Worker is already on break.",
            rejectionReason: "ALREADY_ON_BREAK",
          });
        }

        // GPS validation is required for Start Break
        const parsedCoords = parseCoordinates(body.latitude, body.longitude);
        if (!parsedCoords) {
          return response.status(400).json({
            accepted: false,
            error: "GPS location is required to start break.",
            rejectionReason: "GPS_REQUIRED",
          });
        }

        const now = nowIso();
        const result = await options.store.startBreak(
          activeSession.id,
          now,
          {
            latitude: String(parsedCoords.latitude),
            longitude: String(parsedCoords.longitude),
            gpsAccuracy: toOptionalNumber(body.gpsAccuracy),
            siteName: activeSession.jobSiteLocation,
            jobId: activeSession.jobId,
          },
          identity.label,
        );

        if (!result.accepted) {
          return response.status(400).json({
            accepted: false,
            error: "Could not start break. Work session is not active.",
          });
        }

        return response.status(200).json({
          accepted: true,
          status: "on_break",
          displayStatus: "ON BREAK",
          breakStartedAt: now,
          workSessionId: activeSession.id,
          siteName: activeSession.jobSiteLocation,
          message: "Break started successfully.",
        });
      } catch (error: any) {
        console.error("Error processing start break:", error);
        return response.status(500).json({ error: error?.message || "Internal server error" });
      }
    },
  );

  router.post(
    END_BREAK_ROUTE,
    requireCheckInSession,
    async (request: Request, response: Response) => {
      try {
        const session = (request as CheckInRequest).session;
        const identity = identityFromSession(session);
        const body = (request.body ?? {}) as {
          workSessionId?: unknown;
          latitude?: unknown;
          longitude?: unknown;
          gpsAccuracy?: unknown;
        };

        const activeSession = await options.store.findActiveSessionForWorker(identity.label);
        if (!activeSession) {
          return response.status(400).json({
            accepted: false,
            error: "No active work session found.",
            rejectionReason: "NO_ACTIVE_SESSION",
          });
        }

        if (activeSession.status !== "on_break") {
          return response.status(400).json({
            accepted: false,
            error: "Worker is not currently on break.",
            rejectionReason: "NOT_ON_BREAK",
          });
        }

        // GPS validation is required for End Break - confirms worker is back at the site
        const parsedCoords = parseCoordinates(body.latitude, body.longitude);
        if (!parsedCoords) {
          return response.status(400).json({
            accepted: false,
            error: "GPS location is required to end break.",
            rejectionReason: "GPS_REQUIRED",
          });
        }

        // Verify worker is back within allowed site geofence
        let config: SiteCheckinConfigRecord | null = null;
        if (activeSession.jobId) {
          config = await options.store.findConfigByJobId(activeSession.jobId);
        }
        if (!config) {
          const allConfigs = await options.store.listConfigs();
          if (activeSession.jobSiteLocation) {
            config = allConfigs.find((c) => c.siteName === activeSession!.jobSiteLocation) ?? null;
          }
          if (!config && allConfigs.length > 0) {
            config = allConfigs[0];
          }
        }

        if (config && config.siteLatitude && config.siteLongitude) {
          const siteLat = parseFloat(config.siteLatitude);
          const siteLng = parseFloat(config.siteLongitude);
          if (!Number.isNaN(siteLat) && !Number.isNaN(siteLng)) {
            const distance = haversineDistanceMetres(
              parsedCoords.latitude,
              parsedCoords.longitude,
              siteLat,
              siteLng,
            );
            const permittedRadius = config.allowedRadiusMetres ?? 100;
            if (distance > permittedRadius) {
              return response.status(400).json({
                accepted: false,
                rejectionReason: "GPS_OUTSIDE_RADIUS",
                distanceMetres: distance,
                permittedRadiusMetres: permittedRadius,
                siteName: activeSession.jobSiteLocation ?? config.siteName,
                error: "You must be back at the site to end your break.",
              });
            }
          }
        }

        const now = nowIso();
        const result = await options.store.endBreak(
          activeSession.id,
          now,
          {
            latitude: String(parsedCoords.latitude),
            longitude: String(parsedCoords.longitude),
            gpsAccuracy: toOptionalNumber(body.gpsAccuracy),
            siteName: activeSession.jobSiteLocation,
            jobId: activeSession.jobId,
          },
          identity.label,
        );

        if (!result.accepted) {
          return response.status(400).json({
            accepted: false,
            error: "Could not end break. Session was not on break.",
          });
        }

        return response.status(200).json({
          accepted: true,
          status: "active",
          displayStatus: "ON SITE",
          breakEndedAt: now,
          workSessionId: activeSession.id,
          siteName: activeSession.jobSiteLocation,
          message: "Break ended. Returned to site.",
        });
      } catch (error: any) {
        console.error("Error processing end break:", error);
        return response.status(500).json({ error: error?.message || "Internal server error" });
      }
    },
  );

  router.post(
    GPS_SIGNAL_ROUTE,
    requireCheckInSession,
    async (request: Request, response: Response) => {
      try {
        const session = (request as CheckInRequest).session;
        const identity = identityFromSession(session);
        const body = (request.body ?? {}) as {
          signalLost?: boolean;
          latitude?: unknown;
          longitude?: unknown;
          gpsAccuracy?: unknown;
        };

        const signalLost = body.signalLost === true;
        const activeSession = await options.store.findActiveSessionForWorker(identity.label);

        if (activeSession) {
          const eventType = signalLost ? "LOCATION_SIGNAL_LOST" : "LOCATION_SIGNAL_RESTORED";
          const parsedCoords = parseCoordinates(body.latitude, body.longitude);

          await options.store.recordAttendanceEvent({
            workSessionId: activeSession.id,
            eventType,
            timestamp: nowIso(),
            latitude: parsedCoords ? String(parsedCoords.latitude) : null,
            longitude: parsedCoords ? String(parsedCoords.longitude) : null,
            gpsAccuracy: toOptionalNumber(body.gpsAccuracy) ?? null,
            jobId: activeSession.jobId,
            siteName: activeSession.jobSiteLocation,
            source: "system",
          });
        }

        return response.status(200).json({
          accepted: true,
          signalLost,
          flag: signalLost ? "LOCATION SIGNAL LOST" : null,
        });
      } catch (error: any) {
        console.error("Error updating GPS signal status:", error);
        return response.status(500).json({ error: error?.message || "Internal server error" });
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

        const body = (request.body ?? {}) as {
          workSessionId?: unknown;
          latitude?: unknown;
          longitude?: unknown;
          gpsAccuracy?: unknown;
        };

        // 1. Find active session for this worker (by workSessionId or worker identity)
        let activeSession = await options.store.findActiveSessionForWorker(identity.label);
        if (!activeSession && typeof body.workSessionId === "string" && body.workSessionId.trim() !== "") {
          const allSessions = await options.store.getAllWorkSessions();
          const match = allSessions.find((s) => s.id === body.workSessionId && (s.status === "active" || s.status === "on_break"));
          if (match) {
            activeSession = {
              id: match.id,
              jobId: match.jobId,
              jobSiteLocation: match.jobSiteLocation,
              startTime: match.startTime,
              status: match.status,
            };
          }
        }

        if (!activeSession) {
          return response.status(400).json({
            accepted: false,
            closed: false,
            error: "No active work session found.",
            rejectionReason: "NO_ACTIVE_SESSION",
          });
        }

        // 2. GPS validation is required for Clock Out (QR not required)
        const parsedCoords = parseCoordinates(body.latitude, body.longitude);
        if (!parsedCoords) {
          return response.status(400).json({
            accepted: false,
            closed: false,
            error: "GPS location is required to clock out.",
            rejectionReason: "GPS_REQUIRED",
          });
        }

        const gpsAccuracy = toOptionalNumber(body.gpsAccuracy);
        if (typeof gpsAccuracy === "number" && gpsAccuracy > GPS_ACCURACY_MAX) {
          return response.status(400).json({
            accepted: false,
            closed: false,
            error: "gpsAccuracy is implausible",
            rejectionReason: "INVALID_ACCURACY",
          });
        }

        // 3. Retrieve site configuration for this session
        let config: SiteCheckinConfigRecord | null = null;
        if (activeSession.jobId) {
          config = await options.store.findConfigByJobId(activeSession.jobId);
        }
        if (!config) {
          const allConfigs = await options.store.listConfigs();
          if (activeSession.jobSiteLocation) {
            config = allConfigs.find((c) => c.siteName === activeSession!.jobSiteLocation) ?? null;
          }
          if (!config && allConfigs.length > 0) {
            config = allConfigs[0];
          }
        }

        // 4. Verify worker is within allowed site geofence
        if (config && config.siteLatitude && config.siteLongitude) {
          const siteLat = parseFloat(config.siteLatitude);
          const siteLng = parseFloat(config.siteLongitude);
          if (!Number.isNaN(siteLat) && !Number.isNaN(siteLng)) {
            const distance = haversineDistanceMetres(
              parsedCoords.latitude,
              parsedCoords.longitude,
              siteLat,
              siteLng,
            );
            const permittedRadius = config.allowedRadiusMetres ?? 100;
            if (distance > permittedRadius) {
              return response.status(400).json({
                accepted: false,
                closed: false,
                rejectionReason: "GPS_OUTSIDE_RADIUS",
                distanceMetres: distance,
                permittedRadiusMetres: permittedRadius,
                siteName: activeSession.jobSiteLocation ?? config.siteName,
                error: "You must be at the site to clock out.",
              });
            }
          }
        }

        // 5. Geofence verified -> Close active session
        const now = nowIso();
        const closed = await options.store.closeWorkSession(activeSession.id, now, identity.label, {
          latitude: String(parsedCoords.latitude),
          longitude: String(parsedCoords.longitude),
          gpsAccuracy: toOptionalNumber(body.gpsAccuracy),
          siteName: activeSession.jobSiteLocation,
          jobId: activeSession.jobId,
        });

        return response.status(200).json({
          accepted: true,
          closed,
          displayStatus: "CLOCKED OUT",
          workSessionId: activeSession.id,
          siteName: activeSession.jobSiteLocation,
          checkedOutAt: now,
          clockOutTime: now,
          message: "Clocked out successfully.",
        });
      } catch (error: any) {
        console.error("Error processing site check-out:", error);
        return response.status(500).json({ error: error?.message || "Internal server error" });
      }
    },
  );

  router.get(
    SITE_CONFIG_WORKER_ROUTE,
    requireCheckInSession,
    async (request: Request, response: Response) => {
      try {
        const session = (request as CheckInRequest).session;
        const identity = identityFromSession(session);
        const contractorId = session?.contractorId;
        const jobIdQuery = typeof request.query.jobId === "string" ? request.query.jobId.trim() : null;

        const configs = await options.store.listConfigs();
        if (configs.length === 0) {
          return response.status(404).json({ error: "No site check-in policy configured" });
        }

        // 1. If worker has an active work session, return that exact site's config
        const activeSession = await options.store.findActiveSessionForWorker(identity.label);
        let target: SiteCheckinConfigRecord | null = null;

        if (activeSession?.jobId) {
          target = configs.find((c) => c.jobId === activeSession.jobId) ?? null;
        }

        // 2. Otherwise if a specific jobId was requested
        if (!target && jobIdQuery) {
          target = configs.find((c) => c.jobId === jobIdQuery) ?? null;
        }

        // 3. Otherwise if worker is assigned to a contractor with a configured job
        if (!target && contractorId) {
          target = configs.find((c) => c.contractorId === contractorId) ?? null;
        }

        if (!target) {
          return response.status(200).json({ config: null });
        }

        return response.status(200).json({
          config: {
            jobId: target.jobId,
            siteName: target.siteName,
            siteLatitude: target.siteLatitude,
            siteLongitude: target.siteLongitude,
            allowedRadiusMetres: target.allowedRadiusMetres,
            qrEnabled: target.qrEnabled,
            gpsEnabled: target.gpsEnabled,
          },
        });
      } catch (error: any) {
        console.error("Error fetching worker site config:", error);
        return response.status(500).json({ error: "Failed to load site config" });
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
            qrToken: "",
            qrTokenHash: existing.qrTokenHash,
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

        // Return the ephemeral raw token only when a new one was generated.
        // For keepExistingToken, input.qrToken is "" (raw token is not recoverable).
        const rawToken = input.qrToken || "";
        const configResponse: Record<string, unknown> = {
          id: saved.id,
          jobId: saved.jobId,
          siteName: saved.siteName,
          siteLatitude: saved.siteLatitude,
          siteLongitude: saved.siteLongitude,
          allowedRadiusMetres: saved.allowedRadiusMetres,
          qrEnabled: saved.qrEnabled,
          gpsEnabled: saved.gpsEnabled,
          qrToken: rawToken,
        };

        // If a fresh token was generated, include the QR poster immediately
        // (the raw token is ephemeral and will not be available later).
        let qrPoster: { url: string; dataUrl: string } | undefined;
        if (rawToken) {
          const baseUrl = options.checkInAppBaseUrl
            ? options.checkInAppBaseUrl(request)
            : defaultAppBaseUrl(request);
          const qrUrl = `${baseUrl}/checkin?t=${encodeURIComponent(rawToken)}`;
          const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 512, margin: 2 });
          qrPoster = { url: qrUrl, dataUrl: qrDataUrl };
        }

        return response.status(200).json({ config: configResponse, ...(qrPoster ? { qrPoster } : {}) });
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
      try {
        const configId = request.params.configId;
        const existing = (await options.store.listConfigs()).find((c) => c.id === configId);
        if (!existing) {
          return response.status(404).json({ error: "Site check-in config not found" });
        }
        const qrToken = generateQrToken();
        const username = ((request as any).session?.username || (request as any).session?.adminName || "admin").toString().trim();
        await options.store.rotateConfigToken(
          configId,
          qrToken,
          hashQrToken(qrToken),
          null,
          username,
        );

        // Generate the QR poster immediately while the raw token is in memory.
        // After this response the raw token is no longer available.
        const baseUrl = options.checkInAppBaseUrl
          ? options.checkInAppBaseUrl(request)
          : defaultAppBaseUrl(request);
        const qrUrl = `${baseUrl}/checkin?t=${encodeURIComponent(qrToken)}`;
        const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 512, margin: 2 });
        return response.status(200).json({
          configId,
          qrToken,
          siteName: existing.siteName,
          qrUrl,
          qrDataUrl,
        });
      } catch (error: any) {
        console.error("❌ Error rotating token:", error);
        return response.status(500).json({ error: error?.message || "Failed to rotate token" });
      }
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
      // The raw QR token is never stored in the database (only the SHA-256 hash
      // is persisted). A valid QR poster can only be generated at the moment the
      // token is created or rotated. If the raw token is not available, the admin
      // must rotate the token to receive a new poster.
      if (!existing.qrToken) {
        return response.status(409).json({
          error: "The raw QR token is no longer available. Please rotate the site token to generate a new QR poster.",
          code: "TOKEN_ROTATION_REQUIRED",
        });
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
