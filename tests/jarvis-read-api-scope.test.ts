import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import express from "express";
import session from "express-session";
import {
  JARVIS_JOBS_ROUTE,
  SqlJarvisReadRepository,
  createJarvisReadApiRouter,
} from "../server/jarvis-read-api.ts";
import { createJobStatusRouter, rejectJobStatusEdit } from "../server/job-status-route.ts";
import { buildMachineAuthSigningInput } from "../server/integration-auth.ts";
import { isJarvisReadApiPath, createJarvisReadApiDispatcher } from "../server/jarvis-read-api-scope.ts";
import type {
  IntegrationSqlExecutor,
  IntegrationSqlQueryResult,
  IntegrationSqlTransaction,
} from "../server/integration-shadow-sql-repository.ts";

// ─── Shared constants ─────────────────────────────────────────────────────

const KEY_ID = "scope-test-key";
const SECRET = "scope-test-secret";
const NOW = Date.parse("2026-10-06T12:00:00.000Z");

// ─── Minimal read executor (jobs list only) ───────────────────────────────

class MinimalReadExecutor implements IntegrationSqlExecutor {
  jobs: Array<{ id: string; title: string; status: string; client_name: string | null }> = [];

  async query(sql: string, parameters: readonly unknown[]): Promise<IntegrationSqlQueryResult> {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (
      normalized.includes("from jobs j") &&
      normalized.includes("left join clients") &&
      normalized.includes("order by j.title")
    ) {
      return { rows: this.jobs.map((j) => ({ id: j.id, client_id: null, client_name: j.client_name, title: j.title, location: null, address: null, postcode: null, status: j.status })) };
    }
    throw new Error(`Unexpected SQL in scope test: ${sql}`);
  }

  async transaction<T>(_work: (tx: IntegrationSqlTransaction) => Promise<T>): Promise<T> {
    throw new Error("Read-only API must not open transactions");
  }
}

// ─── HMAC helpers ─────────────────────────────────────────────────────────

function signedGetHeaders(path: string, nonce: string): Record<string, string> {
  const timestamp = String(Math.floor(NOW / 1000));
  const queryIndex = path.indexOf("?");
  const rawQuery = queryIndex >= 0 ? path.slice(queryIndex + 1) : "";
  const pairs = rawQuery
    .split("&")
    .filter(Boolean)
    .map((pair) => pair.split("="))
    .filter((parts) => parts.length === 2 && parts[1].length > 0);
  if (pairs.length > 0) {
    pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
  }
  const canonical = pairs.length > 0 ? pairs.map(([k, v]) => `${k}=${v}`).join("&") : undefined;
  const contentSha256 = createHash("sha256").update("").digest("hex");
  const signingInput = buildMachineAuthSigningInput(KEY_ID, timestamp, nonce, contentSha256, canonical);
  return {
    "x-api-key-id": KEY_ID,
    "x-timestamp": timestamp,
    "x-nonce": nonce,
    "x-content-sha256": contentSha256,
    "x-signature": createHmac("sha256", SECRET).update(signingInput).digest("hex"),
  };
}

// ─── Helper: listen ───────────────────────────────────────────────────────

async function listen(app: express.Express): Promise<{ port: number; close: () => Promise<void> }> {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

// ─── isJarvisReadApiPath unit tests ───────────────────────────────────────

test("isJarvisReadApiPath matches jarvis v1 routes", () => {
  assert.equal(isJarvisReadApiPath("/api/integrations/jarvis/v1/jobs"), true);
  assert.equal(isJarvisReadApiPath("/api/integrations/jarvis/v1/jobs/job-1"), true);
  assert.equal(isJarvisReadApiPath("/api/integrations/jarvis/v1/schedule"), true);
  assert.equal(isJarvisReadApiPath("/api/integrations/jarvis/v1/dashboard/weekly-buying"), true);
});

test("isJarvisReadApiPath rejects prefix lookalikes", () => {
  assert.equal(isJarvisReadApiPath("/api/integrations/jarvis/v1"), false, "bare namespace with no route");
  assert.equal(isJarvisReadApiPath("/api/integrations/jarvis"), false, "parent namespace");
  assert.equal(isJarvisReadApiPath("/api/integrations/jarvis-read"), false, "prefix lookalike");
  assert.equal(isJarvisReadApiPath("/api/integrations/jarvis/v1-foo"), false, "wrong sub-namespace");
  assert.equal(isJarvisReadApiPath("/api/integrations/jarvis/v2/jobs"), false, "v2 not v1");
  assert.equal(isJarvisReadApiPath("/api/jobs"), false, "unrelated path");
  assert.equal(isJarvisReadApiPath("/"), false, "root");
});

test("isJarvisReadApiPath is case-insensitive", () => {
  assert.equal(isJarvisReadApiPath("/API/INTEGRATIONS/JARVIS/V1/JOBS"), true);
  assert.equal(isJarvisReadApiPath("/Api/Integrations/Jarvis/V1/Jobs"), true);
});

// ─── Combined middleware: express.raw before express.json ──────────────────
//
// These tests compose the real middleware order: the jarvis read API router
// (which registers router.use(express.raw())) is dispatched through the
// shared scope helper, followed by express.json() and express.urlencoded().
// This mirrors production index.ts lines 67-94.

function buildCombinedApp(
  jarvisRouter: express.Router,
  jobStatusRouter: express.Router,
  useDispatcher = true,
) {
  const app = express();

  // 1. The jarvis read-API router, dispatched path-scoped (fix) or mounted
  //    globally (pre-fix reproduction). Both mirror production index.ts.
  if (useDispatcher) {
    app.use(createJarvisReadApiDispatcher(jarvisRouter));
  } else {
    app.use(jarvisRouter);
  }

  // 2. Normal JSON parsing (line 93 in production)
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // 3. Session for job-status admin guard
  app.use(
    session({
      secret: "scope-test-session",
      resave: false,
      saveUninitialized: false,
    }),
  );

  // 4. Simulated admin session — mirrors an authenticated browser so the
  //    requireAdmin guard on the job-status routes passes.
  app.use((req, _res, next) => {
    if (!req.session) req.session = {} as any;
    (req.session as any).role = "admin";
    (req.session as any).username = "test-admin";
    (req.session as any).userId = "test-admin";
    next();
  });

  // 5. Job-status routes (PATCH + PUT with rejectJobStatusEdit)
  app.use(jobStatusRouter);
  app.put("/api/jobs/:id", rejectJobStatusEdit, (req, res) => {
    res.json({ received: typeof req.body, bodyKeys: Object.keys(req.body ?? {}) });
  });

  // 6. Echo route for body-inspection tests
  app.post("/api/test-body-echo", (req, res) => {
    const isBuffer = Buffer.isBuffer(req.body);
    const hasStatus = isBuffer ? false : Object.prototype.hasOwnProperty.call(req.body ?? {}, "status");
    res.json({ isBuffer, hasStatus, bodyType: typeof req.body });
  });

  return app;
}

test("REPRO: global mount (no dispatcher) makes unrelated JSON body a Buffer", async () => {
  // Pre-fix reproduction: when the jarvis read API router is mounted globally
  // with app.use(jarvisRouter), its router.use(express.raw()) consumes the
  // request body into a Buffer before express.json() runs. The job-status
  // PATCH then fails to see { status } and returns 400.
  const executor = new MinimalReadExecutor();
  const usedNonces = new Set<string>();
  const jarvisRouter = createJarvisReadApiRouter({
    enabled: true,
    repository: new SqlJarvisReadRepository(executor),
    keyLookup: (keyId) => (keyId === KEY_ID ? SECRET : undefined),
    nonceLookup: (keyId, nonce) => usedNonces.has(`${keyId}:${nonce}`),
    nonceStore: (keyId, nonce) => usedNonces.add(`${keyId}:${nonce}`),
    now: () => NOW,
  });

  const rows = new Map<string, { id: string; status: string }>([
    ["job-pending", { id: "job-pending", status: "pending" }],
  ]);
  const jobStatusRouter = createJobStatusRouter({
    async transitionJobStatus(id, from, to) {
      const row = rows.get(id);
      if (!row || row.status !== from) return undefined;
      const updated = { ...row, status: to };
      rows.set(id, updated);
      return updated;
    },
    async getJob(id) { return rows.get(id); },
  });

  // Pretend we reverted the fix: mount the router globally.
  const app = buildCombinedApp(jarvisRouter, jobStatusRouter, false);
  const server = await listen(app);
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/jobs/job-pending/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "assigned" }),
    });
    // REQUIREMENTS state this must be replaced by the fixed behaviour: the
    // body arrives as a Buffer, so the handler sees no status and returns 400.
    assert.equal(response.status, 400, "pre-fix: Buffer body hides status => 400");
    assert.equal(rows.get("job-pending")!.status, "pending", "no transition occurred");
  } finally {
    await server.close();
  }
});

test("JSON PATCH body is parsed (not Buffer) after combined middleware", async () => {
  const executor = new MinimalReadExecutor();
  const usedNonces = new Set<string>();
  const jarvisRouter = createJarvisReadApiRouter({
    enabled: true,
    repository: new SqlJarvisReadRepository(executor),
    keyLookup: (keyId) => (keyId === KEY_ID ? SECRET : undefined),
    nonceLookup: (keyId, nonce) => usedNonces.has(`${keyId}:${nonce}`),
    nonceStore: (keyId, nonce) => usedNonces.add(`${keyId}:${nonce}`),
    now: () => NOW,
  });

  const rows = new Map<string, { id: string; status: string }>([
    ["job-pending", { id: "job-pending", status: "pending" }],
  ]);
  const jobStatusRouter = createJobStatusRouter({
    async transitionJobStatus(id, from, to) {
      const row = rows.get(id);
      if (!row || row.status !== from) return undefined;
      const updated = { ...row, status: to };
      rows.set(id, updated);
      return updated;
    },
    async getJob(id) { return rows.get(id); },
  });

  const app = buildCombinedApp(jarvisRouter, jobStatusRouter);
  const server = await listen(app);
  try {
    // PATCH /api/jobs/:id/status should receive a parsed object, not Buffer
    const response = await fetch(`http://127.0.0.1:${server.port}/api/jobs/job-pending/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "assigned" }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.status, "assigned", "activation succeeded through combined middleware");
  } finally {
    await server.close();
  }
});

test("JSON PUT with status returns 400 from rejectJobStatusEdit, not 500", async () => {
  const executor = new MinimalReadExecutor();
  const usedNonces = new Set<string>();
  const jarvisRouter = createJarvisReadApiRouter({
    enabled: true,
    repository: new SqlJarvisReadRepository(executor),
    keyLookup: (keyId) => (keyId === KEY_ID ? SECRET : undefined),
    nonceLookup: (keyId, nonce) => usedNonces.has(`${keyId}:${nonce}`),
    nonceStore: (keyId, nonce) => usedNonces.add(`${keyId}:${nonce}`),
    now: () => NOW,
  });

  const rows = new Map<string, { id: string; status: string }>();
  const jobStatusRouter = createJobStatusRouter({
    async transitionJobStatus() { return undefined; },
    async getJob() { return undefined; },
  });

  const app = buildCombinedApp(jarvisRouter, jobStatusRouter);
  const server = await listen(app);
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/jobs/job-x`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "assigned" }),
    });
    assert.equal(response.status, 400, "rejectJobStatusEdit blocked status in PUT body");
    const body = await response.json() as any;
    assert.ok(body.error?.includes("status action"), "correct error message");
  } finally {
    await server.close();
  }
});

test("PUT without status passes through (body parsed as object)", async () => {
  const executor = new MinimalReadExecutor();
  const usedNonces = new Set<string>();
  const jarvisRouter = createJarvisReadApiRouter({
    enabled: true,
    repository: new SqlJarvisReadRepository(executor),
    keyLookup: (keyId) => (keyId === KEY_ID ? SECRET : undefined),
    nonceLookup: (keyId, nonce) => usedNonces.has(`${keyId}:${nonce}`),
    nonceStore: (keyId, nonce) => usedNonces.add(`${keyId}:${nonce}`),
    now: () => NOW,
  });

  const jobStatusRouter = createJobStatusRouter({
    async transitionJobStatus() { return undefined; },
    async getJob() { return undefined; },
  });

  const app = buildCombinedApp(jarvisRouter, jobStatusRouter);
  const server = await listen(app);
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/jobs/job-x`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Routine edit" }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.received, "object", "body is a parsed object, not a Buffer");
    assert.equal(body.isBuffer, undefined);
  } finally {
    await server.close();
  }
});

test("POST to non-jarvis endpoint receives parsed object, not Buffer", async () => {
  const executor = new MinimalReadExecutor();
  const usedNonces = new Set<string>();
  const jarvisRouter = createJarvisReadApiRouter({
    enabled: true,
    repository: new SqlJarvisReadRepository(executor),
    keyLookup: (keyId) => (keyId === KEY_ID ? SECRET : undefined),
    nonceLookup: (keyId, nonce) => usedNonces.has(`${keyId}:${nonce}`),
    nonceStore: (keyId, nonce) => usedNonces.add(`${keyId}:${nonce}`),
    now: () => NOW,
  });

  const jobStatusRouter = createJobStatusRouter({
    async transitionJobStatus() { return undefined; },
    async getJob() { return undefined; },
  });

  const app = buildCombinedApp(jarvisRouter, jobStatusRouter);
  const server = await listen(app);
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/test-body-echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "assigned", extra: "injected" }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.isBuffer, false, "body is NOT a Buffer");
    assert.equal(body.hasStatus, true, "status field is visible on the parsed object");
    assert.equal(body.bodyType, "object");
  } finally {
    await server.close();
  }
});

test("unrelated JSON route not subjected to 64KB raw-body limit", async () => {
  // Build an app with the dispatcher; send a 70KB JSON body to a non-jarvis route.
  // Without the fix, express.raw(limit=64kb) would reject it.
  // With the fix, express.json() (default 100kb) accepts it.
  const executor = new MinimalReadExecutor();
  const usedNonces = new Set<string>();
  const jarvisRouter = createJarvisReadApiRouter({
    enabled: true,
    repository: new SqlJarvisReadRepository(executor),
    keyLookup: (keyId) => (keyId === KEY_ID ? SECRET : undefined),
    nonceLookup: (keyId, nonce) => usedNonces.has(`${keyId}:${nonce}`),
    nonceStore: (keyId, nonce) => usedNonces.add(`${keyId}:${nonce}`),
    now: () => NOW,
  });

  const jobStatusRouter = createJobStatusRouter({
    async transitionJobStatus() { return undefined; },
    async getJob() { return undefined; },
  });

  const app = buildCombinedApp(jarvisRouter, jobStatusRouter);
  app.post("/api/big-payload", (req, res) => {
    res.json({ received: true, bodyType: typeof req.body });
  });
  const server = await listen(app);
  try {
    // 70KB payload exceeds jarvis 64KB raw limit but fits express.json 100KB default
    const bigPayload = "x".repeat(70 * 1024);
    const response = await fetch(`http://127.0.0.1:${server.port}/api/big-payload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: bigPayload }),
    });
    assert.equal(response.status, 200, "70KB payload accepted by express.json, not rejected by express.raw");
    const body = await response.json() as any;
    assert.equal(body.bodyType, "object");
  } finally {
    await server.close();
  }
});

test("disabled jarvis router still allows normal JSON requests", async () => {
  const executor = new MinimalReadExecutor();
  const jarvisRouter = createJarvisReadApiRouter({
    enabled: false,
    repository: new SqlJarvisReadRepository(executor),
    keyLookup: () => undefined,
    nonceLookup: () => false,
    nonceStore: () => undefined,
    now: () => NOW,
  });

  const jobStatusRouter = createJobStatusRouter({
    async transitionJobStatus() { return undefined; },
    async getJob() { return undefined; },
  });

  const app = buildCombinedApp(jarvisRouter, jobStatusRouter);
  const server = await listen(app);
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/test-body-echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "test" }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.isBuffer, false, "disabled jarvis router does not consume body");
    assert.equal(body.hasStatus, true);
  } finally {
    await server.close();
  }
});

test("prefix lookalike /api/integrations/jarvis-foo does not enter the router", async () => {
  const executor = new MinimalReadExecutor();
  const usedNonces = new Set<string>();
  const jarvisRouter = createJarvisReadApiRouter({
    enabled: true,
    repository: new SqlJarvisReadRepository(executor),
    keyLookup: (keyId) => (keyId === KEY_ID ? SECRET : undefined),
    nonceLookup: (keyId, nonce) => usedNonces.has(`${keyId}:${nonce}`),
    nonceStore: (keyId, nonce) => usedNonces.add(`${keyId}:${nonce}`),
    now: () => NOW,
  });

  const jobStatusRouter = createJobStatusRouter({
    async transitionJobStatus() { return undefined; },
    async getJob() { return undefined; },
  });

  const app = buildCombinedApp(jarvisRouter, jobStatusRouter);
  app.post("/api/integrations/jarvis-foo", (req, res) => {
    res.json({ isBuffer: Buffer.isBuffer(req.body), bodyType: typeof req.body });
  });
  const server = await listen(app);
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/integrations/jarvis-foo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "value" }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.isBuffer, false, "lookalike path received parsed JSON, not raw Buffer");
  } finally {
    await server.close();
  }
});

// ─── Jarvis read API HMAC still works through the dispatcher ──────────────

test("signed Jarvis read request succeeds through the dispatcher", async () => {
  const executor = new MinimalReadExecutor();
  executor.jobs.push({ id: "job-a", title: "Test Job", status: "assigned", client_name: "Test Client" });
  const usedNonces = new Set<string>();
  const jarvisRouter = createJarvisReadApiRouter({
    enabled: true,
    repository: new SqlJarvisReadRepository(executor),
    keyLookup: (keyId) => (keyId === KEY_ID ? SECRET : undefined),
    nonceLookup: (keyId, nonce) => usedNonces.has(`${keyId}:${nonce}`),
    nonceStore: (keyId, nonce) => usedNonces.add(`${keyId}:${nonce}`),
    now: () => NOW,
  });

  const jobStatusRouter = createJobStatusRouter({
    async transitionJobStatus() { return undefined; },
    async getJob() { return undefined; },
  });

  const app = buildCombinedApp(jarvisRouter, jobStatusRouter);
  const server = await listen(app);
  try {
    const nonce = `nonce-scope-${Date.now()}-valid`;
    const response = await fetch(`http://127.0.0.1:${server.port}${JARVIS_JOBS_ROUTE}`, {
      headers: signedGetHeaders(JARVIS_JOBS_ROUTE, nonce),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as any[];
    assert.ok(Array.isArray(body));
    assert.ok(body.some((j) => j.jobName === "Test Job"));
  } finally {
    await server.close();
  }
});

test("unsigned Jarvis read request is rejected with 401 through the dispatcher", async () => {
  const executor = new MinimalReadExecutor();
  executor.jobs.push({ id: "job-a", title: "Test Job", status: "assigned", client_name: null });
  const usedNonces = new Set<string>();
  const jarvisRouter = createJarvisReadApiRouter({
    enabled: true,
    repository: new SqlJarvisReadRepository(executor),
    keyLookup: (keyId) => (keyId === KEY_ID ? SECRET : undefined),
    nonceLookup: (keyId, nonce) => usedNonces.has(`${keyId}:${nonce}`),
    nonceStore: (keyId, nonce) => usedNonces.add(`${keyId}:${nonce}`),
    now: () => NOW,
  });

  const jobStatusRouter = createJobStatusRouter({
    async transitionJobStatus() { return undefined; },
    async getJob() { return undefined; },
  });

  const app = buildCombinedApp(jarvisRouter, jobStatusRouter);
  const server = await listen(app);
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}${JARVIS_JOBS_ROUTE}`);
    assert.equal(response.status, 401);
  } finally {
    await server.close();
  }
});
