import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateCheckIn,
  generateQrToken,
  hashQrToken,
  deriveAttendanceStatus,
  type SiteCheckinConfig,
  type CheckInIdentity,
  type CheckInSubmission,
} from "../server/site-checkin.ts";
import { buildAttendanceTimeline } from "../server/attendance-timeline.ts";
import type {
  SiteCheckinStore,
  SiteCheckinConfigRecord,
  CheckInAttemptRow,
  WorkSessionDraft,
  UpsertSiteCheckinConfigInput,
} from "../server/site-checkin-repository.ts";

/** In-memory store for 4-state attendance model validation */
class MockAttendanceStore implements SiteCheckinStore {
  configs: Map<string, SiteCheckinConfigRecord> = new Map();
  sessions: Map<string, any> = new Map();
  events: Array<{
    id: string;
    workSessionId: string;
    eventType: string;
    timestamp: string;
    latitude: string | null;
    longitude: string | null;
    gpsAccuracy: number | null;
    jobId: string | null;
    siteName: string | null;
    source: string;
    createdAt: string;
  }> = [];

  async findConfigByTokenHash(tokenHash: string): Promise<SiteCheckinConfigRecord | null> {
    for (const cfg of this.configs.values()) {
      if (cfg.qrTokenHash === tokenHash) return cfg;
    }
    return null;
  }

  async findConfigByJobId(jobId: string): Promise<SiteCheckinConfigRecord | null> {
    for (const cfg of this.configs.values()) {
      if (cfg.jobId === jobId) return cfg;
    }
    return null;
  }

  async listConfigs(): Promise<SiteCheckinConfigRecord[]> {
    return Array.from(this.configs.values());
  }

  async createOrUpdateConfig(input: UpsertSiteCheckinConfigInput): Promise<SiteCheckinConfigRecord> {
    const record: SiteCheckinConfigRecord = {
      id: `cfg-${this.configs.size + 1}`,
      jobId: input.jobId,
      siteName: input.siteName,
      siteLatitude: input.siteLatitude,
      siteLongitude: input.siteLongitude,
      allowedRadiusMetres: input.allowedRadiusMetres,
      qrEnabled: input.qrEnabled,
      gpsEnabled: input.gpsEnabled,
      qrTokenHash: input.qrTokenHash,
      qrTokenExpiresAt: input.qrTokenExpiresAt,
      createdBy: input.createdBy,
      contractorId: null,
      qrToken: "",
    };
    this.configs.set(record.id, record);
    return record;
  }

  async rotateConfigToken(configId: string, qrToken: string, qrTokenHash: string): Promise<void> {
    const existing = this.configs.get(configId);
    if (existing) existing.qrTokenHash = qrTokenHash;
  }

  async applyCheckInAttempt(
    attempt: CheckInAttemptRow,
    workSessionDraft: WorkSessionDraft | null,
    identity: CheckInIdentity,
  ): Promise<{ attemptId: string; workSessionId: string | null; duplicate: boolean }> {
    if (!attempt.accepted || !workSessionDraft) {
      return { attemptId: "att-1", workSessionId: null, duplicate: false };
    }

    const existingActive = await this.findActiveSessionForWorker(identity.label);
    if (existingActive) {
      return { attemptId: "att-dup", workSessionId: existingActive.id, duplicate: true };
    }

    const sessionId = `ws-${this.sessions.size + 1}`;
    const startTimeIso = attempt.createdAt || new Date().toISOString();
    this.sessions.set(sessionId, {
      id: sessionId,
      contractorName: identity.label,
      jobSiteLocation: workSessionDraft.jobSiteLocation,
      startTime: startTimeIso,
      endTime: null,
      status: "active",
      jobId: workSessionDraft.jobId,
      workerId: workSessionDraft.workerId,
      contractorId: workSessionDraft.contractorId,
      totalHours: null,
    });

    this.events.push({
      id: `evt-${this.events.length + 1}`,
      workSessionId: sessionId,
      eventType: "CLOCK_IN",
      timestamp: startTimeIso,
      latitude: attempt.latitude,
      longitude: attempt.longitude,
      gpsAccuracy: attempt.gpsAccuracy,
      jobId: workSessionDraft.jobId,
      siteName: workSessionDraft.jobSiteLocation,
      source: "worker",
      createdAt: startTimeIso,
    });

    return { attemptId: "att-ok", workSessionId: sessionId, duplicate: false };
  }

  async applyCheckOutAttempt(
    attempt: CheckInAttemptRow,
    identity: CheckInIdentity,
  ): Promise<{ attemptId: string; workSessionId: string | null; closed: boolean }> {
    const active = await this.findActiveSessionForWorker(identity.label);
    if (!active) return { attemptId: "att-none", workSessionId: null, closed: false };
    const sess = this.sessions.get(active.id)!;
    sess.status = "completed";
    sess.endTime = attempt.createdAt || new Date().toISOString();
    return { attemptId: "att-out", workSessionId: active.id, closed: true };
  }

  async startBreak(sessionId: string, timestamp: string, coords?: any, identityLabel?: string): Promise<{ accepted: boolean }> {
    const s = this.sessions.get(sessionId);
    if (!s || s.status !== "active") return { accepted: false };
    if (identityLabel && s.contractorName !== identityLabel) return { accepted: false };

    s.status = "on_break";
    this.events.push({
      id: `evt-${this.events.length + 1}`,
      workSessionId: sessionId,
      eventType: "BREAK_START",
      timestamp,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      gpsAccuracy: coords?.gpsAccuracy ?? null,
      jobId: coords?.jobId ?? s.jobId,
      siteName: coords?.siteName ?? s.jobSiteLocation,
      source: "worker",
      createdAt: timestamp,
    });

    return { accepted: true };
  }

  async endBreak(sessionId: string, timestamp: string, coords?: any, identityLabel?: string): Promise<{ accepted: boolean }> {
    const s = this.sessions.get(sessionId);
    if (!s || s.status !== "on_break") return { accepted: false };
    if (identityLabel && s.contractorName !== identityLabel) return { accepted: false };

    s.status = "active";
    this.events.push({
      id: `evt-${this.events.length + 1}`,
      workSessionId: sessionId,
      eventType: "BREAK_END",
      timestamp,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      gpsAccuracy: coords?.gpsAccuracy ?? null,
      jobId: coords?.jobId ?? s.jobId,
      siteName: coords?.siteName ?? s.jobSiteLocation,
      source: "worker",
      createdAt: timestamp,
    });

    return { accepted: true };
  }

  async recordAttendanceEvent(event: any): Promise<void> {
    this.events.push({
      id: `evt-${this.events.length + 1}`,
      workSessionId: event.workSessionId,
      eventType: event.eventType,
      timestamp: event.timestamp,
      latitude: event.latitude ?? null,
      longitude: event.longitude ?? null,
      gpsAccuracy: event.gpsAccuracy ?? null,
      jobId: event.jobId ?? null,
      siteName: event.siteName ?? null,
      source: event.source ?? "worker",
      createdAt: event.timestamp,
    });
  }

  async getEventsForSession(sessionId: string) {
    return this.events.filter((e) => e.workSessionId === sessionId);
  }

  async getAllWorkSessions() {
    return Array.from(this.sessions.values()).map((s) => ({
      ...s,
      events: this.events.filter((e) => e.workSessionId === s.id),
    }));
  }

  async getWorkerWorkSessions(contractorName: string) {
    return Array.from(this.sessions.values())
      .filter((s) => s.contractorName === contractorName)
      .map((s) => ({
        ...s,
        events: this.events.filter((e) => e.workSessionId === s.id),
      }));
  }

  async findActiveSession(jobId: string, identityLabel: string) {
    for (const s of this.sessions.values()) {
      if (s.jobId === jobId && s.contractorName === identityLabel && (s.status === "active" || s.status === "on_break")) {
        return { id: s.id, startTime: s.startTime, status: s.status };
      }
    }
    return null;
  }

  async findActiveSessionForWorker(identityLabel: string) {
    for (const s of this.sessions.values()) {
      if (s.contractorName === identityLabel && (s.status === "active" || s.status === "on_break")) {
        return {
          id: s.id,
          jobId: s.jobId,
          jobSiteLocation: s.jobSiteLocation,
          startTime: s.startTime,
          status: s.status,
        };
      }
    }
    return null;
  }

  async closeWorkSession(sessionId: string, endTime: string, identityLabel?: string, coords?: any): Promise<boolean> {
    const s = this.sessions.get(sessionId);
    if (!s || (s.status !== "active" && s.status !== "on_break")) return false;
    if (identityLabel && s.contractorName !== identityLabel) return false;
    s.status = "completed";
    s.endTime = endTime;

    this.events.push({
      id: `evt-${this.events.length + 1}`,
      workSessionId: sessionId,
      eventType: "CLOCK_OUT",
      timestamp: endTime,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      gpsAccuracy: coords?.gpsAccuracy ?? null,
      jobId: coords?.jobId ?? s.jobId,
      siteName: coords?.siteName ?? s.jobSiteLocation,
      source: "worker",
      createdAt: endTime,
    });

    return true;
  }
}

// -------------------------------------------------------------
// TEST 1: Full 4-State Cycle: Clock In -> Start Break -> End Break -> Clock Out
// -------------------------------------------------------------
test("1. Full 4-state attendance cycle transitions and records exact timestamps", async () => {
  const store = new MockAttendanceStore();
  const worker = "mohamed.shawky";
  const site = "38 Crescent Road";
  const rawToken = generateQrToken();
  const tokenHash = hashQrToken(rawToken);

  await store.createOrUpdateConfig({
    jobId: "job-crescent",
    siteName: site,
    siteLatitude: "51.490501",
    siteLongitude: "0.147492",
    allowedRadiusMetres: 100,
    qrEnabled: true,
    gpsEnabled: true,
    qrToken: "",
    qrTokenHash: tokenHash,
    qrTokenExpiresAt: null,
    createdBy: "admin",
  });

  // 1. CLOCK IN: 08:02 (QR + GPS required)
  const clockInTime = "2026-08-18T08:02:00.000Z";
  const checkInRes = await store.applyCheckInAttempt(
    {
      accepted: true,
      rejectionReason: null,
      qrTokenHash: tokenHash,
      latitude: "51.490501",
      longitude: "0.147492",
      gpsAccuracy: 10,
      createdAt: clockInTime,
    },
    {
      jobId: "job-crescent",
      jobSiteLocation: site,
      workerId: "worker-1",
      contractorId: null,
      contractorName: worker,
    },
    { kind: "worker", label: worker },
  );

  assert.equal(checkInRes.duplicate, false);
  const activeSess = await store.findActiveSessionForWorker(worker);
  assert.ok(activeSess);
  assert.equal(activeSess.status, "active");
  assert.equal(deriveAttendanceStatus(activeSess.status), "ON SITE");

  // 2. START BREAK: 12:14 (GPS required)
  const breakStartTime = "2026-08-18T12:14:00.000Z";
  const breakStartRes = await store.startBreak(
    activeSess.id,
    breakStartTime,
    { latitude: "51.490501", longitude: "0.147492", gpsAccuracy: 10 },
    worker,
  );
  assert.equal(breakStartRes.accepted, true);
  const onBreakSess = await store.findActiveSessionForWorker(worker);
  assert.ok(onBreakSess);
  assert.equal(onBreakSess.status, "on_break");
  assert.equal(deriveAttendanceStatus(onBreakSess.status), "ON BREAK");

  // 3. END BREAK: 13:03 (GPS confirms worker is back at site)
  const breakEndTime = "2026-08-18T13:03:00.000Z";
  const breakEndRes = await store.endBreak(
    activeSess.id,
    breakEndTime,
    { latitude: "51.490501", longitude: "0.147492", gpsAccuracy: 10 },
    worker,
  );
  assert.equal(breakEndRes.accepted, true);
  const backOnSiteSess = await store.findActiveSessionForWorker(worker);
  assert.ok(backOnSiteSess);
  assert.equal(backOnSiteSess.status, "active");
  assert.equal(deriveAttendanceStatus(backOnSiteSess.status), "ON SITE");

  // 4. CLOCK OUT: 17:01 (GPS required)
  const clockOutTime = "2026-08-18T17:01:00.000Z";
  const closeRes = await store.closeWorkSession(
    activeSess.id,
    clockOutTime,
    worker,
    { latitude: "51.490501", longitude: "0.147492", gpsAccuracy: 10 },
  );
  assert.equal(closeRes, true);
  const postCloseSess = await store.findActiveSessionForWorker(worker);
  assert.equal(postCloseSess, null);

  // Reconstruct Timeline & Validate Calculations
  const allSessions = await store.getWorkerWorkSessions(worker);
  const timeline = buildAttendanceTimeline(allSessions, worker, new Date(clockOutTime));

  assert.equal(timeline.sessions.length, 1);
  const s0 = timeline.sessions[0];

  assert.equal(s0.clockInTime, clockInTime);
  assert.equal(s0.breakStartTime, breakStartTime);
  assert.equal(s0.breakEndTime, breakEndTime);
  assert.equal(s0.clockOutTime, clockOutTime);

  // Break duration: 12:14 to 13:03 = 49 minutes = 2940 seconds
  assert.equal(s0.breakDurationSeconds, 49 * 60);

  // Total span: 08:02 to 17:01 = 8 hours 59 minutes = 539 minutes = 32340 seconds
  // Worked duration: 539m - 49m break = 490 minutes = 8 hours 10 minutes = 29400 seconds
  assert.equal(s0.workedDurationSeconds, 8 * 3600 + 10 * 60);
  assert.equal(timeline.totalWorkedSeconds, 8 * 3600 + 10 * 60);
  assert.equal(timeline.totalBreakSeconds, 49 * 60);
  assert.equal(timeline.currentStatus, "CLOCKED OUT");
});

// -------------------------------------------------------------
// TEST 2: Multiple Break / Return Cycles in One Working Day
// -------------------------------------------------------------
test("2. Supports multiple break / return cycles during one shift", async () => {
  const store = new MockAttendanceStore();
  const worker = "dalwayne.diedericks";
  const site = "38 Crescent Road";
  const sessionId = "ws-multi-break";

  store.sessions.set(sessionId, {
    id: sessionId,
    contractorName: worker,
    jobSiteLocation: site,
    startTime: "2026-08-18T08:00:00.000Z",
    endTime: "2026-08-18T17:00:00.000Z",
    status: "completed",
    jobId: "job-1",
  });

  // Events: Clock in, Break 1 (10:00 - 10:15 = 15m), Break 2 (13:00 - 13:45 = 45m), Clock out
  store.events = [
    { id: "e1", workSessionId: sessionId, eventType: "CLOCK_IN", timestamp: "2026-08-18T08:00:00.000Z", latitude: null, longitude: null, gpsAccuracy: null, jobId: "job-1", siteName: site, source: "worker", createdAt: "2026-08-18T08:00:00.000Z" },
    { id: "e2", workSessionId: sessionId, eventType: "BREAK_START", timestamp: "2026-08-18T10:00:00.000Z", latitude: null, longitude: null, gpsAccuracy: null, jobId: "job-1", siteName: site, source: "worker", createdAt: "2026-08-18T10:00:00.000Z" },
    { id: "e3", workSessionId: sessionId, eventType: "BREAK_END", timestamp: "2026-08-18T10:15:00.000Z", latitude: null, longitude: null, gpsAccuracy: null, jobId: "job-1", siteName: site, source: "worker", createdAt: "2026-08-18T10:15:00.000Z" },
    { id: "e4", workSessionId: sessionId, eventType: "BREAK_START", timestamp: "2026-08-18T13:00:00.000Z", latitude: null, longitude: null, gpsAccuracy: null, jobId: "job-1", siteName: site, source: "worker", createdAt: "2026-08-18T13:00:00.000Z" },
    { id: "e5", workSessionId: sessionId, eventType: "BREAK_END", timestamp: "2026-08-18T13:45:00.000Z", latitude: null, longitude: null, gpsAccuracy: null, jobId: "job-1", siteName: site, source: "worker", createdAt: "2026-08-18T13:45:00.000Z" },
    { id: "e6", workSessionId: sessionId, eventType: "CLOCK_OUT", timestamp: "2026-08-18T17:00:00.000Z", latitude: null, longitude: null, gpsAccuracy: null, jobId: "job-1", siteName: site, source: "worker", createdAt: "2026-08-18T17:00:00.000Z" },
  ];

  const sessions = await store.getWorkerWorkSessions(worker);
  const timeline = buildAttendanceTimeline(sessions, worker, new Date("2026-08-18T17:00:00.000Z"));

  assert.equal(timeline.sessions.length, 1);
  const s0 = timeline.sessions[0];
  assert.equal(s0.breaks.length, 2);
  assert.equal(s0.breaks[0].durationSeconds, 15 * 60);
  assert.equal(s0.breaks[1].durationSeconds, 45 * 60);
  assert.equal(s0.breakDurationSeconds, 60 * 60); // 1 hour total break

  // Total span: 08:00 to 17:00 = 9 hours = 32400 seconds
  // Net worked: 9h - 1h break = 8 hours = 28800 seconds
  assert.equal(s0.workedDurationSeconds, 8 * 3600);
  assert.equal(timeline.totalWorkedSeconds, 8 * 3600);
  assert.equal(timeline.totalBreakSeconds, 3600);
});

// -------------------------------------------------------------
// TEST 3: GPS Signal Loss Protection
// -------------------------------------------------------------
test("3. GPS signal loss is informational only and does NOT clock out or deduct pay", async () => {
  const store = new MockAttendanceStore();
  const worker = "mohamed.shawky";
  const site = "38 Crescent Road";
  const sessionId = "ws-gps-loss";

  store.sessions.set(sessionId, {
    id: sessionId,
    contractorName: worker,
    jobSiteLocation: site,
    startTime: "2026-08-18T08:00:00.000Z",
    endTime: null,
    status: "active",
    jobId: "job-1",
  });

  // Worker clocks in, then GPS signal is lost, but worker continues working on site
  await store.recordAttendanceEvent({
    workSessionId: sessionId,
    eventType: "CLOCK_IN",
    timestamp: "2026-08-18T08:00:00.000Z",
  });

  await store.recordAttendanceEvent({
    workSessionId: sessionId,
    eventType: "LOCATION_SIGNAL_LOST",
    timestamp: "2026-08-18T10:00:00.000Z",
  });

  // Session must remain active in database!
  const activeSess = await store.findActiveSessionForWorker(worker);
  assert.ok(activeSess);
  assert.equal(activeSess.status, "active");

  const sessions = await store.getWorkerWorkSessions(worker);
  const timeline = buildAttendanceTimeline(sessions, worker, new Date("2026-08-18T12:00:00.000Z"));

  // Status must remain ON SITE, with LOCATION SIGNAL LOST flag
  assert.equal(timeline.currentStatus, "ON SITE");
  assert.equal(timeline.attendanceFlag, "LOCATION SIGNAL LOST");
  assert.equal(timeline.sessions[0].locationSignalLost, true);

  // Full 4 hours (08:00 to 12:00) must be credited as worked time
  assert.equal(timeline.totalWorkedSeconds, 4 * 3600);
  assert.equal(timeline.totalBreakSeconds, 0);

  // When GPS signal is restored inside site:
  await store.recordAttendanceEvent({
    workSessionId: sessionId,
    eventType: "LOCATION_SIGNAL_RESTORED",
    timestamp: "2026-08-18T13:00:00.000Z",
  });

  const updatedSessions = await store.getWorkerWorkSessions(worker);
  const updatedTimeline = buildAttendanceTimeline(updatedSessions, worker, new Date("2026-08-18T14:00:00.000Z"));
  assert.equal(updatedTimeline.attendanceFlag, null);
  assert.equal(updatedTimeline.sessions[0].locationSignalLost, false);
});
