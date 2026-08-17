import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateCheckIn,
  generateQrToken,
  hashQrToken,
  buildWorkSessionDraft,
  buildAttemptRow,
  type SiteCheckinConfig,
  type CheckInIdentity,
  type CheckInSubmission,
} from "../server/site-checkin.ts";
import type {
  SiteCheckinStore,
  SiteCheckinConfigRecord,
  CheckInAttemptRow,
  WorkSessionDraft,
  UpsertSiteCheckinConfigInput,
} from "../server/site-checkin-repository.ts";

/** In-memory store simulating the single source of truth database behavior */
class InMemorySiteCheckinStore implements SiteCheckinStore {
  configs: Map<string, SiteCheckinConfigRecord> = new Map();
  sessions: Map<string, { id: string; contractorName: string; jobSiteLocation: string | null; startTime: string | null; endTime: string | null; status: string; jobId: string | null; workerId: string | null; contractorId: string | null }> = new Map();
  attempts: CheckInAttemptRow[] = [];

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
      id: "cfg-1",
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
    if (existing) {
      existing.qrTokenHash = qrTokenHash;
    }
  }

  async applyCheckInAttempt(
    attempt: CheckInAttemptRow,
    workSessionDraft: WorkSessionDraft | null,
    identity: CheckInIdentity,
  ): Promise<{ attemptId: string; workSessionId: string | null; duplicate: boolean }> {
    this.attempts.push(attempt);
    if (!attempt.accepted || !workSessionDraft) {
      return { attemptId: `att-${this.attempts.length}`, workSessionId: null, duplicate: false };
    }

    // Check if worker already has active session
    const existingActive = await this.findActiveSessionForWorker(identity.label);
    if (existingActive) {
      return { attemptId: `att-${this.attempts.length}`, workSessionId: existingActive.id, duplicate: true };
    }

    const sessionId = `ws-${this.sessions.size + 1}`;
    this.sessions.set(sessionId, {
      id: sessionId,
      contractorName: identity.label,
      jobSiteLocation: workSessionDraft.jobSiteLocation,
      startTime: new Date().toISOString(),
      endTime: null,
      status: "active",
      jobId: workSessionDraft.jobId,
      workerId: workSessionDraft.workerId,
      contractorId: workSessionDraft.contractorId,
    });

    return { attemptId: `att-${this.attempts.length}`, workSessionId: sessionId, duplicate: false };
  }

  async applyCheckOutAttempt(
    attempt: CheckInAttemptRow,
    identity: CheckInIdentity,
  ): Promise<{ attemptId: string; workSessionId: string | null; closed: boolean }> {
    this.attempts.push(attempt);
    const active = await this.findActiveSessionForWorker(identity.label);
    if (!active) {
      return { attemptId: `att-${this.attempts.length}`, workSessionId: null, closed: false };
    }
    const sess = this.sessions.get(active.id)!;
    sess.status = "completed";
    sess.endTime = new Date().toISOString();
    return { attemptId: `att-${this.attempts.length}`, workSessionId: active.id, closed: true };
  }

  async getAllWorkSessions() {
    return Array.from(this.sessions.values());
  }

  async findActiveSession(jobId: string, identityLabel: string) {
    for (const s of this.sessions.values()) {
      if (s.jobId === jobId && s.contractorName === identityLabel && s.status === "active") {
        return { id: s.id, startTime: s.startTime, status: s.status };
      }
    }
    return null;
  }

  async findActiveSessionForWorker(identityLabel: string) {
    for (const s of this.sessions.values()) {
      if (s.contractorName === identityLabel && s.status === "active") {
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

  async closeWorkSession(sessionId: string, endTime: string, identityLabel?: string): Promise<boolean> {
    const s = this.sessions.get(sessionId);
    if (!s || s.status !== "active") return false;
    if (identityLabel && s.contractorName !== identityLabel) return false;
    s.status = "completed";
    s.endTime = endTime;
    return true;
  }
}

// 1. Initial State: No Active Session → State is NOT CLOCKED IN
test("1. initial state: no active session in DB returns active: false", async () => {
  const store = new InMemorySiteCheckinStore();
  const workerSession = await store.findActiveSessionForWorker("mohamed.shawky");
  assert.equal(workerSession, null, "worker should have no active session initially");
});

// 2. Clock In: Valid QR + Inside GPS Geofence creates ONE active session
test("2. valid QR + GPS creates exactly one active session", async () => {
  const store = new InMemorySiteCheckinStore();
  const rawToken = generateQrToken();
  const tokenHash = hashQrToken(rawToken);

  await store.createOrUpdateConfig({
    jobId: "job-gilbert",
    siteName: "Tester — 15 Gilbert Road",
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

  const identity: CheckInIdentity = { label: "mohamed.shawky", workerId: "w-1", contractorId: null };
  const config = await store.findConfigByTokenHash(tokenHash);
  assert.ok(config);

  const decision = evaluateCheckIn({
    config,
    qrToken: rawToken,
    latitude: 51.490501,
    longitude: 0.147492,
    gpsAccuracy: 10,
    contractorId: null,
  });

  assert.equal(decision.accepted, true);
  assert.equal(decision.siteName, "Tester — 15 Gilbert Road");

  const draft = buildWorkSessionDraft(decision, identity);
  const attemptRow = buildAttemptRow(decision, identity, new Date().toISOString());

  const result = await store.applyCheckInAttempt(attemptRow, draft, identity);
  assert.ok(result.workSessionId, "work session must be created");
  assert.equal(result.duplicate, false);

  // Verify server state now confirms active session
  const active = await store.findActiveSessionForWorker("mohamed.shawky");
  assert.ok(active);
  assert.equal(active.id, result.workSessionId);
  assert.equal(active.jobSiteLocation, "Tester — 15 Gilbert Road");
  assert.equal(active.status, "active");
});

// 3. Second Clock In while already active is REJECTED
test("3. second Clock In attempt while active session exists is rejected", async () => {
  const store = new InMemorySiteCheckinStore();
  const rawToken = generateQrToken();
  const tokenHash = hashQrToken(rawToken);

  await store.createOrUpdateConfig({
    jobId: "job-gilbert",
    siteName: "Tester — 15 Gilbert Road",
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

  const identity: CheckInIdentity = { label: "mohamed.shawky", workerId: "w-1", contractorId: null };
  const config = await store.findConfigByTokenHash(tokenHash);
  const decision = evaluateCheckIn({
    config,
    qrToken: rawToken,
    latitude: 51.490501,
    longitude: 0.147492,
    gpsAccuracy: 10,
    contractorId: null,
  });

  const draft = buildWorkSessionDraft(decision, identity);
  const attemptRow = buildAttemptRow(decision, identity, new Date().toISOString());

  // 1st Check In
  const first = await store.applyCheckInAttempt(attemptRow, draft, identity);
  assert.equal(first.duplicate, false);

  // 2nd Check In with same worker
  const second = await store.applyCheckInAttempt(attemptRow, draft, identity);
  assert.equal(second.duplicate, true, "must reject duplicate active session");

  // Verify only 1 session exists in DB
  const all = await store.getAllWorkSessions();
  const activeSessions = all.filter((s) => s.contractorName === "mohamed.shawky" && s.status === "active");
  assert.equal(activeSessions.length, 1, "exactly one active session must exist");
});

// 4. Clock Out: Closes session cleanly WITHOUT requiring QR code or camera
test("4. Clock Out closes active session directly using sessionId without QR", async () => {
  const store = new InMemorySiteCheckinStore();
  const identity: CheckInIdentity = { label: "mohamed.shawky", workerId: "w-1", contractorId: null };

  // Setup active session
  store.sessions.set("ws-active-1", {
    id: "ws-active-1",
    contractorName: "mohamed.shawky",
    jobSiteLocation: "Tester — 15 Gilbert Road",
    startTime: new Date().toISOString(),
    endTime: null,
    status: "active",
    jobId: "job-1",
    workerId: "w-1",
    contractorId: null,
  });

  // Verify active before checkout
  let active = await store.findActiveSessionForWorker("mohamed.shawky");
  assert.ok(active);
  assert.equal(active.status, "active");

  // Clock Out without QR code
  const now = new Date().toISOString();
  const closed = await store.closeWorkSession(active.id, now, "mohamed.shawky");
  assert.equal(closed, true, "closeWorkSession must return true");

  // Verify session is completed and no active session remains
  active = await store.findActiveSessionForWorker("mohamed.shawky");
  assert.equal(active, null, "worker should have NO active session after clock out");

  const sess = store.sessions.get("ws-active-1")!;
  assert.equal(sess.status, "completed");
  assert.equal(sess.endTime, now);
});

// 5. Clock Out with NO active session is rejected
test("5. Clock Out when no active session exists is rejected", async () => {
  const store = new InMemorySiteCheckinStore();
  const closed = await store.closeWorkSession("non-existent-session", new Date().toISOString(), "mohamed.shawky");
  assert.equal(closed, false, "cannot close non-existent session");

  const active = await store.findActiveSessionForWorker("mohamed.shawky");
  assert.equal(active, null);
});

// 6. Full Lifecycle: Not Clocked In → Clock In (QR+GPS) → Clocked In → Clock Out (no QR) → Not Clocked In
test("6. full attendance cycle: not clocked in → QR clock in → clocked in → direct clock out → not clocked in", async () => {
  const store = new InMemorySiteCheckinStore();
  const rawToken = generateQrToken();
  const tokenHash = hashQrToken(rawToken);

  await store.createOrUpdateConfig({
    jobId: "job-1",
    siteName: "Tester — 15 Gilbert Road",
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

  const worker = "ahmed.gouda";
  const identity: CheckInIdentity = { label: worker, workerId: "w-2", contractorId: null };

  // Step 1: Check state initially -> NOT CLOCKED IN
  let state = await store.findActiveSessionForWorker(worker);
  assert.equal(state, null);

  // Step 2: Clock In with QR + GPS
  const config = await store.findConfigByTokenHash(tokenHash);
  const decision = evaluateCheckIn({
    config,
    qrToken: rawToken,
    latitude: 51.490501,
    longitude: 0.147492,
    gpsAccuracy: 10,
    contractorId: null,
  });
  assert.equal(decision.accepted, true);

  const checkinResult = await store.applyCheckInAttempt(
    buildAttemptRow(decision, identity, new Date().toISOString()),
    buildWorkSessionDraft(decision, identity),
    identity,
  );
  assert.ok(checkinResult.workSessionId);

  // Step 3: Server state is now CLOCKED IN
  state = await store.findActiveSessionForWorker(worker);
  assert.ok(state);
  assert.equal(state.status, "active");
  assert.equal(state.jobSiteLocation, "Tester — 15 Gilbert Road");

  // Step 4: Clock Out directly without QR
  const closed = await store.closeWorkSession(state.id, new Date().toISOString(), worker);
  assert.equal(closed, true);

  // Step 5: Server state is back to NOT CLOCKED IN
  state = await store.findActiveSessionForWorker(worker);
  assert.equal(state, null);
});

// 7. Active session resolves correct site location; does not default to first config (Mary G)
test("7. worker site resolution uses active session site and never defaults to first config (Mary G)", async () => {
  const store = new InMemorySiteCheckinStore();

  // Mary G (alphabetically first)
  await store.createOrUpdateConfig({
    jobId: "job-mary-g",
    siteName: "Mary G — 38 Crescent Road, SE18 7BN",
    siteLatitude: "51.488344",
    siteLongitude: "0.068153",
    allowedRadiusMetres: 100,
    qrEnabled: true,
    gpsEnabled: true,
    qrToken: "",
    qrTokenHash: hashQrToken(generateQrToken()),
    qrTokenExpiresAt: null,
    createdBy: "admin",
  });

  // Gilbert Road
  const rawToken = generateQrToken();
  const tokenHash = hashQrToken(rawToken);
  await store.createOrUpdateConfig({
    jobId: "job-gilbert",
    siteName: "Tester — 15 Gilbert Road, Belvedere, DA17 5DB",
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

  const worker = "rudy.test";
  const identity: CheckInIdentity = { label: worker, workerId: null, contractorId: null };

  // When clocked into Gilbert Road
  const config = await store.findConfigByTokenHash(tokenHash);
  const decision = evaluateCheckIn({
    config,
    qrToken: rawToken,
    latitude: 51.490501,
    longitude: 0.147492,
    gpsAccuracy: 10,
    contractorId: null,
  });

  await store.applyCheckInAttempt(
    buildAttemptRow(decision, identity, new Date().toISOString()),
    buildWorkSessionDraft(decision, identity),
    identity,
  );

  const active = await store.findActiveSessionForWorker(worker);
  assert.ok(active);
  assert.equal(active.jobSiteLocation, "Tester — 15 Gilbert Road, Belvedere, DA17 5DB");
  assert.notEqual(active.jobSiteLocation, "Mary G — 38 Crescent Road, SE18 7BN");
});

