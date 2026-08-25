import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getCanonicalMigrationFiles } from "../server/canonical-migrations.ts";
import { jobLocationTableStatements } from "../server/job-location-tables-core.ts";

const migrationSource = readFileSync(
  fileURLToPath(new URL("../migrations/0021_job_location_task_resources.sql", import.meta.url)),
  "utf8",
);
const routesSource = readFileSync(
  fileURLToPath(new URL("../server/routes.ts", import.meta.url)),
  "utf8",
);

test("resource retention migration is journaled, additive, and limited to source fields", () => {
  const migration = getCanonicalMigrationFiles().find((file) => file.tag === "0021_job_location_task_resources");
  assert.ok(migration);
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS "job_location_task_resources"/);
  assert.match(migrationSource, /location_task_id" varchar NOT NULL REFERENCES "job_location_tasks"\("id"\) ON DELETE CASCADE/);
  assert.match(migrationSource, /currency_unclassified/);
  assert.match(migrationSource, /UNIQUE INDEX IF NOT EXISTS "job_location_task_resources_task_order_unique"/);
  assert.doesNotMatch(migrationSource.replace(/ON DELETE CASCADE/gi, ""), /\b(?:DROP|TRUNCATE|DELETE|UPDATE|ALTER)\b/i);
  assert.doesNotMatch(migrationSource, /supplier|product_code|resource_type|unit_rate|line_total|budget|price/i);
});

test("fresh database setup creates the resource child only after its operational task parent", () => {
  const statements = jobLocationTableStatements();
  const parentIndex = statements.findIndex((statement) => /CREATE TABLE IF NOT EXISTS job_location_tasks\s*\(/.test(statement));
  const childIndex = statements.findIndex((statement) => /CREATE TABLE IF NOT EXISTS job_location_task_resources\s*\(/.test(statement));
  assert.ok(parentIndex >= 0);
  assert.ok(childIndex > parentIndex);
  assert.match(statements[childIndex], /location_task_id VARCHAR NOT NULL REFERENCES job_location_tasks\(id\) ON DELETE CASCADE/);
});

test("Word route obtains the operational task id before inserting resource children", () => {
  const helperIndex = routesSource.indexOf("const persistTaskResources");
  const returningIndex = routesSource.indexOf(".returning();", helperIndex);
  const persistenceIndex = routesSource.indexOf("await persistTaskResources(createdTask.id", returningIndex);
  assert.ok(helperIndex >= 0);
  assert.ok(returningIndex > helperIndex);
  assert.ok(persistenceIndex > returningIndex);
  assert.doesNotMatch(routesSource.slice(helperIndex, persistenceIndex), /jobAssignments\)\.values/);
});
