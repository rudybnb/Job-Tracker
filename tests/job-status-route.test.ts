import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { createJobStatusRouter, rejectJobStatusEdit, type JobStatusRepository } from "../server/job-status-route.ts";

type Status = "pending" | "assigned" | "completed";

async function fixture(t: TestContext, role: string | undefined = "admin") {
  const rows = new Map<string, { id: string; status: Status; title: string }>([
    ["selected", { id: "selected", status: "pending", title: "Selected job" }],
    ["other", { id: "other", status: "pending", title: "Other job" }],
  ]);
  let writes = 0;
  const repository: JobStatusRepository = {
    async getJob(id) { return rows.get(id); },
    async transitionJobStatus(id, from, to) {
      const row = rows.get(id);
      if (!row || row.status !== from) return undefined;
      writes++;
      const updated = { ...row, status: to };
      rows.set(id, updated);
      return updated;
    },
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (role) Object.assign(req, { session: { role, username: "test-user" } });
    next();
  });
  app.use(createJobStatusRouter(repository));
  app.put("/api/jobs/:id", rejectJobStatusEdit, (_req, res) => res.json({ unchangedStatus: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (body: unknown, id = "selected", method = "PATCH") => fetch(`${base}/api/jobs/${id}${method === "PATCH" ? "/status" : ""}`, {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { rows, request, writes: () => writes };
}

test("pending -> assigned changes only the selected job status", async (t) => {
  const f = await fixture(t);
  const response = await f.request({ status: "assigned", id: "other", title: "Injected edit" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id: "selected", status: "assigned" });
  assert.deepEqual(f.rows.get("selected"), { id: "selected", status: "assigned", title: "Selected job" });
  assert.equal(f.rows.get("other")!.status, "pending");
});

test("assigned -> completed", async (t) => {
  const f = await fixture(t);
  f.rows.get("selected")!.status = "assigned";
  assert.equal((await f.request({ status: "completed" })).status, 200);
  assert.equal(f.rows.get("selected")!.status, "completed");
});

for (const role of ["", "contractor"]) {
  test(`unauthorised ${role || "anonymous"} request cannot write`, async (t) => {
    const f = await fixture(t, role);
    assert.equal((await f.request({ status: "assigned" })).status, 401);
    assert.equal(f.writes(), 0);
  });
}

for (const [from, to, code] of [
  ["completed", "assigned", 409], ["completed", "pending", 400],
  ["assigned", "pending", 400], ["pending", "completed", 409],
  ["assigned", "assigned", 409], ["completed", "completed", 409],
  ["pending", "active", 400],
] as const) {
  test(`rejects ${from} -> ${to}`, async (t) => {
    const f = await fixture(t);
    f.rows.get("selected")!.status = from;
    assert.equal((await f.request({ status: to })).status, code);
    assert.equal(f.rows.get("selected")!.status, from);
    assert.equal(f.writes(), 0);
  });
}

test("concurrent activation accepts only one request", async (t) => {
  const f = await fixture(t);
  const responses = await Promise.all([f.request({ status: "assigned" }), f.request({ status: "assigned" })]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal(f.writes(), 1);
});

test("missing selected job returns 404 without changing another job", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request({ status: "assigned" }, "missing")).status, 404);
  assert.equal(f.writes(), 0);
});

test("general job edits cannot bypass explicit status transitions", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request({ status: "pending" }, "selected", "PUT")).status, 400);
  assert.equal((await f.request({ title: "Routine edit" }, "selected", "PUT")).status, 200);
  assert.equal(f.writes(), 0);
});
