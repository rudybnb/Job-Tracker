import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Regression guard for the varchar ↔ uuid type-mismatch bug in
 * listStructuredWordJobCandidates().
 *
 * PostgreSQL raises an operatorDoesNotExist error when a uuid-typed
 * expression is compared to a varchar column without an explicit cast.
 * jobs.id is declared varchar in Drizzle but gen_random_uuid() produces a
 * uuid-typed value, so every raw-SQL reference to ${jobsTable.id} inside a
 * WHERE / SELECT subquery targeting varchar job_id columns MUST be cast to
 * text. This test verifies the casts are present so future edits cannot
 * accidentally remove them.
 */

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const routesSource = readFileSync(path.join(repoRoot, "server", "routes.ts"), "utf8");

function extractListStructuredWordJobCandidates(): string {
  const start = routesSource.indexOf("async function listStructuredWordJobCandidates()");
  assert.ok(start > -1, "listStructuredWordJobCandidates function found in routes.ts");
  // Find the closing of the function body — look for the next top-level function or
  // a reasonable marker. We'll take from start to the line with "} else {" which
  // follows it, or 80 lines should be enough to capture the full query.
  const snippet = routesSource.slice(start, start + 1200);
  return snippet;
}

test("listStructuredWordJobCandidates casts jobsTable.id to text in all EXISTS subqueries", () => {
  const fn = extractListStructuredWordJobCandidates();

  // There must be exactly 4 occurrences of ::text after ${jobsTable.id}:
  //   1. SELECT column: hasCurrentSourceImport subquery
  //   2. SELECT column: latestImportAt subquery
  //   3. WHERE: job_locations EXISTS
  //   4. WHERE: job_location_tasks EXISTS
  const matches = fn.match(/\$\{jobsTable\.id\}::text/g);
  assert.ok(matches, "must have at least one ${jobsTable.id}::text cast");
  assert.equal(matches!.length, 4, "all four subquery references must carry ::text cast");

  // Every raw-SQL template (sql<boolean>, sql<string|null>, sql) in the query
  // must carry the ::text cast.  There are 4 total ${} template-literal refs
  // to jobsTable.id in the function — all 4 must be cast.
  const allRefs = fn.match(/\$\{jobsTable\.id\}/g) ?? [];
  assert.equal(allRefs.length, 4, "expected exactly 4 template-literal references to jobsTable.id in the function");
});

test("listStructuredWordJobCandidates targets the correct three tables with cast", () => {
  const fn = extractListStructuredWordJobCandidates();

  // Verify each table's subquery uses the cast
  assert.match(
    fn,
    /FROM project_source_import i WHERE i\.job_id = \$\{jobsTable\.id\}::text AND i\.is_current_revision/,
    "project_source_import subquery must use ::text cast",
  );
  assert.match(
    fn,
    /FROM project_source_import i WHERE i\.job_id = \$\{jobsTable\.id\}::text\s*\)/,
    "latestImportAt subquery must use ::text cast",
  );
  assert.match(
    fn,
    /FROM job_locations l WHERE l\.job_id = \$\{jobsTable\.id\}::text\)/,
    "job_locations EXISTS must use ::text cast",
  );
  assert.match(
    fn,
    /FROM job_location_tasks t WHERE t\.job_id = \$\{jobsTable\.id\}::text\)/,
    "job_location_tasks EXISTS must use ::text cast",
  );
});
