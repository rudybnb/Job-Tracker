/**
 * Phase QR-1 — Site QR + GPS Check-In core logic.
 *
 * Pure decision-making module. No HTTP, no I/O, no database. All persistence is
 * delegated to a SiteCheckinStore so the rules can be unit-tested in memory.
 *
 * Safety rule (never weakened):
 *   A check-in is VALID only when BOTH the QR token resolves to a configured,
 *   enabled site AND the submitted phone GPS is inside the site's allowed radius.
 *   The backend always makes the final decision; client "GPS passed" values are
 *   never trusted.
 */

import { createHash, randomBytes } from "node:crypto";

export const QR_TOKEN_BYTES = 32;

export type SiteCheckinRejectionReason =
  | "WRONG_QR"
  | "SITE_NOT_FOUND"
  | "SITE_CHECKIN_DISABLED"
  | "GPS_UNAVAILABLE"
  | "INVALID_COORDINATES"
  | "GPS_ACCURACY_UNACCEPTABLE"
  | "GPS_OUTSIDE_RADIUS"
  | "UNAUTHORISED_WORKER";

export const SITE_CHECKIN_REJECTION_REASONS: readonly SiteCheckinRejectionReason[] = [
  "WRONG_QR",
  "SITE_NOT_FOUND",
  "SITE_CHECKIN_DISABLED",
  "GPS_UNAVAILABLE",
  "INVALID_COORDINATES",
  "GPS_ACCURACY_UNACCEPTABLE",
  "GPS_OUTSIDE_RADIUS",
  "UNAUTHORISED_WORKER",
];

export interface SiteCheckinConfig {
  readonly id: string;
  readonly jobId: string;
  readonly siteName: string | null;
  readonly siteLatitude: string;
  readonly siteLongitude: string;
  readonly allowedRadiusMetres: number;
  readonly qrEnabled: boolean;
  readonly gpsEnabled: boolean;
  readonly qrTokenHash: string;
  readonly qrTokenExpiresAt: string | Date | null;
  readonly contractorId: string | null;
}

export interface CheckInSubmission {
  readonly qrToken: string;
  readonly latitude: unknown;
  readonly longitude: unknown;
  readonly gpsAccuracy: unknown;
}

export interface CheckInIdentity {
  readonly label: string;
  readonly workerId?: string | null;
  readonly contractorId?: string | null;
}

export interface WorkSessionDraft {
  readonly contractorName: string;
  readonly jobSiteLocation: string;
  readonly jobId: string;
  readonly workerId?: string | null;
  readonly contractorId?: string | null;
}

export interface CheckInAttemptRow {
  readonly workerId?: string | null;
  readonly contractorId?: string | null;
  readonly jobId?: string | null;
  readonly siteCheckinConfigId?: string | null;
  readonly identityLabel: string;
  readonly attemptTime: string;
  readonly qrValid: boolean;
  readonly submittedLatitude?: string | null;
  readonly submittedLongitude?: string | null;
  readonly gpsAccuracyMetres?: number | null;
  readonly calculatedDistanceMetres?: number | null;
  readonly permittedRadiusMetres?: number | null;
  readonly gpsValid: boolean;
  readonly accepted: boolean;
  readonly rejectionReason?: SiteCheckinRejectionReason | null;
}

export interface CheckInDecision {
  readonly qrValid: boolean;
  readonly gpsValid: boolean;
  readonly accepted: boolean;
  readonly rejectionReason: SiteCheckinRejectionReason | null;
  readonly siteName: string | null;
  readonly siteCheckinConfigId: string | null;
  readonly jobId: string | null;
  readonly distanceMetres: number | null;
  readonly permittedRadiusMetres: number | null;
  readonly submission: CheckInSubmission;
}

/** SHA-256 hex digest of a QR token. The database stores only this digest. */
export function hashQrToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Cryptographically random, URL-safe QR token (256 bits). */
export function generateQrToken(): string {
  return randomBytes(QR_TOKEN_BYTES).toString("base64url");
}

/** Great-circle distance in metres (haversine). Earth radius = 6,371,000 m. */
export function haversineDistanceMetres(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRadians = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface ParsedCoordinates {
  readonly latitude: number;
  readonly longitude: number;
}

/** Validates a finite numeric latitude within [-90, 90]. */
export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

/** Validates a finite numeric longitude within [-180, 180]. */
export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidAccuracy(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Parses a lat/lng submission. Returns parsed coordinates, or null when either
 * is missing, non-numeric, or out of range.
 */
export function parseCoordinates(
  latitude: unknown,
  longitude: unknown,
): ParsedCoordinates | null {
  if (latitude == null || longitude == null) return null;
  if (latitude === "" || longitude === "") return null;
  const lat = typeof latitude === "number" ? latitude : Number(latitude);
  const lng = typeof longitude === "number" ? longitude : Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!isValidLatitude(lat) || !isValidLongitude(lng)) return null;
  return { latitude: lat, longitude: lng };
}

export interface EvaluateCheckInInput {
  readonly config: SiteCheckinConfig | null;
  readonly qrToken: string;
  readonly latitude: unknown;
  readonly longitude: unknown;
  readonly gpsAccuracy: unknown;
  readonly contractorId: string | null;
}

/**
 * Evaluates a single check-in submission against a resolved site config.
 * Produces the full decision including audit fields. Never throws for normal
 * input; missing/unknown tokens become WRONG_QR.
 */
export function evaluateCheckIn(input: EvaluateCheckInInput): CheckInDecision {
  const { config, qrToken } = input;
  const submission: CheckInSubmission = {
    qrToken,
    latitude: input.latitude,
    longitude: input.longitude,
    gpsAccuracy: input.gpsAccuracy,
  };

  if (!config) {
    return {
      qrValid: false,
      gpsValid: false,
      accepted: false,
      rejectionReason: "WRONG_QR",
      siteName: null,
      siteCheckinConfigId: null,
      jobId: null,
      distanceMetres: null,
      permittedRadiusMetres: null,
      submission,
    };
  }

  if (!config.qrEnabled || !config.gpsEnabled) {
    return {
      qrValid: true,
      gpsValid: false,
      accepted: false,
      rejectionReason: "SITE_CHECKIN_DISABLED",
      siteName: config.siteName,
      siteCheckinConfigId: config.id,
      jobId: config.jobId,
      distanceMetres: null,
      permittedRadiusMetres: config.allowedRadiusMetres,
      submission,
    };
  }

  // Verify QR token against stored hash (if configured).
  // If the config has a token hash, the submission must match; if no hash is stored,
  // fall back to a plain string comparison so legacy configs still function.
  if (config.qrTokenHash) {
    const submittedHash = hashQrToken(qrToken);
    if (submittedHash !== config.qrTokenHash) {
      return {
        qrValid: false,
        gpsValid: false,
        accepted: false,
        rejectionReason: "WRONG_QR",
        siteName: config.siteName,
        siteCheckinConfigId: config.id,
        jobId: config.jobId,
        distanceMetres: null,
        permittedRadiusMetres: config.allowedRadiusMetres,
        submission,
      };
    }
  }

  // Job authorisation: the authenticated worker/contractor must be assigned
  // to the job via the contractorId relationship.
  // config.contractorId references contractors.id; input.contractorId is the
  // authenticated worker's contractorId. They must match for the check-in to proceed.
  if (config.contractorId && input.contractorId && config.contractorId !== input.contractorId) {
    return {
      qrValid: true,
      gpsValid: true,
      accepted: false,
      rejectionReason: "UNAUTHORISED_WORKER",
      siteName: config.siteName,
      siteCheckinConfigId: config.id,
      jobId: config.jobId,
      distanceMetres: null,
      permittedRadiusMetres: config.allowedRadiusMetres,
      submission,
    };
  }

  const coordinates = parseCoordinates(input.latitude, input.longitude);
  if (!coordinates) {
    const missing =
      input.latitude === undefined ||
      input.latitude === null ||
      input.longitude === undefined ||
      input.longitude === null ||
      input.latitude === "" ||
      input.longitude === "";
    return {
      qrValid: true,
      gpsValid: false,
      accepted: false,
      rejectionReason: missing ? "GPS_UNAVAILABLE" : "INVALID_COORDINATES",
      siteName: config.siteName,
      siteCheckinConfigId: config.id,
      jobId: config.jobId,
      distanceMetres: null,
      permittedRadiusMetres: config.allowedRadiusMetres,
      submission,
    };
  }

  if (isValidAccuracy(input.gpsAccuracy) && input.gpsAccuracy > config.allowedRadiusMetres) {
    return {
      qrValid: true,
      gpsValid: false,
      accepted: false,
      rejectionReason: "GPS_ACCURACY_UNACCEPTABLE",
      siteName: config.siteName,
      siteCheckinConfigId: config.id,
      jobId: config.jobId,
      distanceMetres: null,
      permittedRadiusMetres: config.allowedRadiusMetres,
      submission,
    };
  }

  const siteLat = Number(config.siteLatitude);
  const siteLng = Number(config.siteLongitude);
  const distanceMetres = haversineDistanceMetres(
    coordinates.latitude,
    coordinates.longitude,
    siteLat,
    siteLng,
  );

  const insideRadius = distanceMetres <= config.allowedRadiusMetres;
  return {
    qrValid: true,
    gpsValid: insideRadius,
    accepted: insideRadius,
    rejectionReason: insideRadius ? null : "GPS_OUTSIDE_RADIUS",
    siteName: config.siteName,
    siteCheckinConfigId: config.id,
    jobId: config.jobId,
    distanceMetres,
    permittedRadiusMetres: config.allowedRadiusMetres,
    submission,
  };
}

/**
 * Builds the append-only audit row for a decision. Server-provided attemptTime.
 */
export function buildAttemptRow(
  decision: CheckInDecision,
  identity: CheckInIdentity,
  attemptTime: string,
): CheckInAttemptRow {
  return {
    workerId: identity.workerId ?? null,
    contractorId: identity.contractorId ?? null,
    jobId: decision.jobId,
    siteCheckinConfigId: decision.siteCheckinConfigId,
    identityLabel: identity.label,
    attemptTime,
    qrValid: decision.qrValid,
    submittedLatitude:
      typeof decision.submission.latitude === "number" || decision.submission.latitude !== null
        ? String(decision.submission.latitude)
        : null,
    submittedLongitude:
      typeof decision.submission.longitude === "number" || decision.submission.longitude !== null
        ? String(decision.submission.longitude)
        : null,
    gpsAccuracyMetres:
      typeof decision.submission.gpsAccuracy === "number"
        ? decision.submission.gpsAccuracy
        : null,
    calculatedDistanceMetres: decision.distanceMetres,
    permittedRadiusMetres: decision.permittedRadiusMetres,
    gpsValid: decision.gpsValid,
    accepted: decision.accepted,
    rejectionReason: decision.rejectionReason,
  };
}

/**
 * The one place that decides whether a work session may be created: ONLY for an
 * accepted (QR PASS + GPS PASS) decision. Rejected attempts never produce a
 * session draft.
 */
export function buildWorkSessionDraft(
  decision: CheckInDecision,
  identity: CheckInIdentity,
): WorkSessionDraft | null {
  if (!decision.accepted || !decision.jobId || !decision.siteName) return null;
  return {
    contractorName: identity.label,
    jobSiteLocation: decision.siteName,
    jobId: decision.jobId,
    workerId: identity.workerId ?? null,
    contractorId: identity.contractorId ?? null,
  };
}

/* --------------------------------------------------------------
 * QR-4 — Admin live-monitor presentation helpers & 4-State Engine.
 * --------------------------------------------------------------
 * Maps site-checkin work-session data (work_sessions table & attendance_events)
 * into the admin Live Monitor display shape. Pure functions, no I/O.
 */

export type AttendanceEventType =
  | "CLOCK_IN"
  | "BREAK_START"
  | "BREAK_END"
  | "CLOCK_OUT"
  | "LOCATION_SIGNAL_LOST"
  | "LOCATION_SIGNAL_RESTORED";

export interface AttendanceEventRecord {
  readonly id: string;
  readonly workSessionId: string;
  readonly eventType: AttendanceEventType;
  readonly timestamp: Date | string;
  readonly latitude?: string | null;
  readonly longitude?: string | null;
  readonly gpsAccuracy?: number | null;
  readonly jobId?: string | null;
  readonly siteName?: string | null;
  readonly source: "worker" | "admin" | "system";
  readonly createdAt?: Date | string;
}

export type SiteCheckinSessionUser = {
  readonly id: string;
  readonly contractorName: string;
  readonly jobSiteLocation?: string | null;
  readonly startTime?: Date | string | null;
  readonly endTime?: Date | string | null;
  readonly status?: string | null;
  readonly jobId?: string | null;
  readonly workerId?: string | null;
  readonly contractorId?: string | null;
  readonly breakStartedAt?: Date | string | null;
  readonly breakEndedAt?: Date | string | null;
  readonly totalWorkedTime?: string | null;
  readonly totalBreakTime?: string | null;
  readonly attendanceFlag?: string | null;
  readonly events?: readonly AttendanceEventRecord[];
};

export interface AdminSiteSessionView {
  readonly id: string;
  readonly workerName: string;
  readonly jobSiteLocation: string | null;
  readonly checkedInAt: string | null;
  readonly breakOutAt: string | null;
  readonly breakReturnAt: string | null;
  readonly checkedOutAt: string | null;
  readonly isActive: boolean;
  readonly status: "ON SITE" | "ON BREAK" | "CLOCKED OUT";
  readonly totalWorkedTime?: string | null;
  readonly totalBreakTime?: string | null;
  readonly attendanceFlag?: string | null;
}

/**
 * Derives whether a site-checkin work session is currently active.
 * A session is ACTIVE while status is 'active' or 'on_break'.
 * Anything else (null, 'completed', etc.) is treated as checked out.
 */
export function isSessionActive(status: string | null | undefined): boolean {
  return status === "active" || status === "on_break";
}

/** Derives human-facing 4-state status */
export function deriveAttendanceStatus(status: string | null | undefined): "ON SITE" | "ON BREAK" | "CLOCKED OUT" {
  if (status === "on_break") return "ON BREAK";
  if (status === "active") return "ON SITE";
  return "CLOCKED OUT";
}

/** Normalises a session timestamp (Date or ISO string) to an ISO string, or null. */
export function toIsoTimestamp(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Builds the per-worker admin Live Monitor row from site-checkin session data.
 * The worker is ON SITE while active, ON BREAK while on break, and CHECKED OUT once completed.
 */
export function buildAdminSiteSessionView(session: SiteCheckinSessionUser): AdminSiteSessionView {
  const active = isSessionActive(session.status);
  const checkedInAt = toIsoTimestamp(session.startTime);
  const breakOutAt = toIsoTimestamp(session.breakStartedAt);
  const breakReturnAt = toIsoTimestamp(session.breakEndedAt);
  const checkedOutAt = active || session.endTime == null ? null : toIsoTimestamp(session.endTime);
  const status = deriveAttendanceStatus(session.status);

  return {
    id: session.id,
    workerName: session.contractorName,
    jobSiteLocation: session.jobSiteLocation ?? null,
    checkedInAt,
    breakOutAt,
    breakReturnAt,
    checkedOutAt,
    isActive: active,
    status,
    totalWorkedTime: session.totalWorkedTime ?? null,
    totalBreakTime: session.totalBreakTime ?? null,
    attendanceFlag: session.attendanceFlag ?? null,
  };
}

/** Maps a set of site-checkin sessions to admin views for the Live Monitor. */
export function buildAdminSiteSessionViews(
  sessions: readonly SiteCheckinSessionUser[],
): AdminSiteSessionView[] {
  return sessions.map(buildAdminSiteSessionView);
}

