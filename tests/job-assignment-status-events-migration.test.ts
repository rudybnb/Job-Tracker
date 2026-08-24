import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  path.join(root, "migrations", "0020_job_assignment_status_events.sql"),
  "utf8",
);

test("status event migration is additive and uses assignment text identity with cascade delete", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "job_assignment_status_events"/);
  assert.match(migration, /"assignment_id" text NOT NULL REFERENCES "job_assignments"\("id"\) ON DELETE CASCADE/);
  assert.match(migration, /"actor_id" text/);
  assert.match(migration, /"created_at" timestamp with time zone NOT NULL DEFAULT now\(\)/);
  assert.doesNotMatch(migration, /\bDROP\b|ALTER TABLE\s+"job_assignments"/i);
  assert.doesNotMatch(migration, /\bINSERT\s+INTO\s+"job_assignment_status_events"/i);
});
