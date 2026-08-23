import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Production-safety contract tests for the Smart Schedule ATTACH path
 * (Word-first / Smart-Schedule-second linking).
 *
 * DATABASE_URL in this environment points at a live managed database, so these
 * tests deliberately do NOT execute writes against it. Instead they verify the
 * source-level guarantees that make the attach path atomic and commercially
 * safe, failing if future edits break any of them:
 *
 *  1. ALL attach mutations happen inside ONE db.transaction (drizzle runs this
 *     as BEGIN ... COMMIT/ROLLBACK on a single connection: any failure anywhere
 *     inside rolls back the supersede update, the revision insert, the jobs
 *     phases/phaseTaskData update AND the lineage row together).
 *  2. Every mutation inside the transaction goes through the shared `tx`
 *     handle (never `db.` directly, which would escape the transaction).
 *  3. Duplicate no-op returns BEFORE any mutation occurs.
 *  4. The jobs update sets ONLY phases + phaseTaskData.
 *  5. The attach branch never touches locations/tasks/commercial columns.
 *  6. Both Smart Schedule upload endpoints are admin-guarded.
 */

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const routesSource = readFileSync(path.join(repoRoot, "server", "routes.ts"), "utf8");

function extractAttachBranch(): string {
  const start = routesSource.indexOf("const attachJobId =");
  const end = routesSource.indexOf("const projectMetadata = parseProjectMetadata");
  assert.ok(start > -1, "attach branch found in routes.ts");
  assert.ok(end > start, "attach branch ends where legacy metadata parsing begins");
  return routesSource.slice(start, end);
}

test("attach mutations are wrapped in exactly ONE db.transaction", () => {
  const branch = extractAttachBranch();
  const transactionCount = branch.match(/await db\.transaction\(/g)?.length ?? 0;
  assert.equal(transactionCount, 1, "attach must run inside a single db.transaction");

  // Every statement between transaction open and its closing belongs to the tx
  // callback; confirm the transaction opens before the first mutation.
  const txOpenIndex = branch.indexOf("await db.transaction(");
  const firstMutationIndex = branch.search(/await\s+(tx|db)\s*\.\s*(update|insert)\s*\(/);
  assert.ok(firstMutationIndex > txOpenIndex, "no mutation may precede the transaction");
});

test("every mutation inside the attach transaction uses the tx handle", () => {
  const branch = extractAttachBranch();
  const txOpen = branch.indexOf("const attachResult = await db.transaction(async (tx) => {");
  assert.ok(txOpen > -1, "transaction callback receives tx");

  const block = branch.slice(txOpen);
  // Direct db.* writes would run OUTSIDE the transaction -> forbidden here.
  assert.doesNotMatch(block, /\bdb\s*\.\s*(insert|update|delete)\s*\(/, "no direct db writes may bypass the tx handle");

  // The four required steps all go through tx, in safe order.
  const lockIndex = block.indexOf("pg_advisory_xact_lock");
  const supersedeIndex = block.indexOf(".update(projectSourceImports)");
  const insertImportIndex = block.indexOf(".insert(projectSourceImports)");
  const jobsUpdateIndex = block.indexOf(".update(jobsTable)");
  const lineageIndex = block.indexOf(".insert(csvUploads)");

  assert.ok(lockIndex > -1, "advisory lock taken first (serialises concurrent attaches)");
  assert.ok(supersedeIndex > lockIndex, "previous revision superseded via tx");
  assert.ok(insertImportIndex > supersedeIndex, "new revision inserted via tx after superseding");
  assert.ok(jobsUpdateIndex > insertImportIndex, "jobs.phases/phaseTaskData updated via tx");
  assert.ok(lineageIndex > jobsUpdateIndex, "lineage row inserted via tx");
});

test("duplicate no-op returns BEFORE any mutation is attempted", () => {
  const branch = extractAttachBranch();
  const duplicateReturn = branch.indexOf('if (importAction.action === "DUPLICATE_NOOP")');
  const firstMutation = branch.search(/\.\s*update\(projectSourceImports\)/);

  assert.ok(duplicateReturn > -1, "duplicate guard exists");
  assert.ok(firstMutation > duplicateReturn, "duplicate short-circuit precedes supersede/insert/update");
});

test("jobs update sets ONLY phases and phaseTaskData", () => {
  const branch = extractAttachBranch();
  const setMatch = branch.match(/\.update\(jobsTable\)\s*\n?\s*\.set\(\{([^}]*)\}\)/);

  assert.ok(setMatch, "jobsTable update with explicit column set found");
  const keys = (setMatch![1].match(/[a-zA-Z]+(?=\s*:)/g) ?? []).sort();
  assert.deepEqual(keys, ["phaseTaskData", "phases"]);

  // Commercial/identity columns must never appear in the attach patch.
  for (const forbidden of ["title", "clientName", "clientId", "address", "postcode", "status", "dueDate", "quotedAmount", "uploadId", "notes"]) {
    assert.equal(
      setMatch![1].includes(forbidden),
      false,
      `attach patch must never write ${forbidden}`,
    );
  }
});

test("attach branch never writes locations, tasks or commercial finance", () => {
  const branch = extractAttachBranch();
  assert.doesNotMatch(branch, /\.(insert|update|delete)\(jobLocations\)/);
  assert.doesNotMatch(branch, /\.(insert|update|delete)\(jobLocationTasks\)/);
  assert.doesNotMatch(branch, /\.(insert|update|delete)\(clients\)/);
  assert.doesNotMatch(branch, /quotedAmount\s*:/, "no quotedAmount write anywhere in attach branch");
});

test("both Smart Schedule endpoints are admin-guarded with requireAdmin", () => {
  assert.match(routesSource, /app\.post\("\/api\/upload-csv\/preview",\s*requireAdmin/);
  assert.match(routesSource, /app\.post\("\/api\/upload-csv",\s*requireAdmin/);
});
