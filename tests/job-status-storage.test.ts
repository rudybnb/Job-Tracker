import assert from "node:assert/strict";
import { test } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "../server/db.ts";
import { DatabaseStorage } from "../server/database-storage.ts";

test("status update uses selected ID and expected current status in one database update", async (t) => {
  const storage = new DatabaseStorage();
  let set: unknown;
  let predicate: any;
  t.mock.method(db, "update", () => ({
    set(values: unknown) {
      set = values;
      return { where(where: unknown) {
        predicate = where;
        return { returning: async () => [{ id: "selected", status: "assigned" }] };
      } };
    },
  }));
  await storage.transitionJobStatus("selected", "pending", "assigned");
  assert.deepEqual(set, { status: "assigned" });
  const query = new PgDialect().sqlToQuery(predicate);
  assert.match(query.sql, /"jobs"\."id" = .* and "jobs"\."status" = /);
  assert.deepEqual(query.params, ["selected", "pending"]);
});

test("storage rejects backwards transitions without a database update", async (t) => {
  const update = t.mock.method(db, "update", () => { throw new Error("Unexpected write"); });
  assert.equal(await new DatabaseStorage().transitionJobStatus("selected", "completed", "assigned"), undefined);
  assert.equal(update.mock.callCount(), 0);
});

test("contractor assignment preserves job status", async (t) => {
  const storage = new DatabaseStorage();
  for (const status of ["pending", "assigned", "completed"] as const) {
    const job = { id: "selected", status };
    t.mock.method(storage, "getJob", async () => job);
    t.mock.method(storage, "getContractor", async () => ({ id: "contractor", activeJobs: "0" }));
    t.mock.method(storage, "updateContractor", async () => undefined);
    const update = t.mock.method(storage, "updateJob", async (_id: string, changes: object) => {
      assert.equal(Object.hasOwn(changes, "status"), false);
      return { ...job, ...changes };
    });
    const result = await storage.assignJob({ jobId: "selected", contractorId: "contractor" });
    assert.equal(result?.status, status);
    assert.equal(update.mock.callCount(), 1);
    t.mock.restoreAll();
  }
});
