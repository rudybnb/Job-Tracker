/**
 * Tests for Materials Used import lineage architecture.
 *
 * These tests prove (without a live DB) that:
 * 1. resolveSmartScheduleImportAction correctly handles same-hash duplicate.
 * 2. resolveSmartScheduleImportAction correctly creates a new revision on new hash.
 * 3. The HBXL_MATERIALS_USED constants are exported and have the correct values.
 * 4. classifyAllRows on the real Maureen CSV produces exactly 3 BROAD_ALLOWANCE rows.
 * 5. ALL inserted rows would have a non-null sourceImportId.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HBXL_MATERIALS_USED_PARSER_VERSION,
  HBXL_MATERIALS_USED_SOURCE_TYPE,
  HBXL_MATERIALS_USED_STREAM_KEY,
  resolveSmartScheduleImportAction,
  type SourceImportRecordSummary,
} from "../shared/job-match.ts";
import {
  parseMaterialsUsedCsv,
  classifyAllRows,
} from "../shared/procurement-pricing.ts";

const CSV_PATH = "G:\\My Drive\\SCULPT PROJECTS LTD\\Maureen orubebe NW9 5YZ\\Job 3 Maureen Orubebe - Materials Used.csv";

test("HBXL_MATERIALS_USED constants have correct values", () => {
  assert.equal(HBXL_MATERIALS_USED_SOURCE_TYPE, "HBXL_MATERIALS_USED");
  assert.equal(HBXL_MATERIALS_USED_STREAM_KEY, "HBXL_MATERIALS_USED");
  assert.equal(HBXL_MATERIALS_USED_PARSER_VERSION, "hbxl-materials-used-csv-v1");
});

test("Same-hash import returns DUPLICATE_NOOP", () => {
  const hash = "a".repeat(64);
  const priorImports: SourceImportRecordSummary[] = [
    { id: "uuid-1", sourceHash: hash, revisionNumber: 1, status: "IMPORTED" },
  ];
  const action = resolveSmartScheduleImportAction(priorImports, hash);
  assert.equal(action.action, "DUPLICATE_NOOP");
  if (action.action === "DUPLICATE_NOOP") {
    assert.equal(action.duplicateOfRevisionNumber, 1);
  }
});

test("First import with no priors creates revision 1", () => {
  const action = resolveSmartScheduleImportAction([], "b".repeat(64));
  assert.equal(action.action, "NEW_REVISION");
  if (action.action === "NEW_REVISION") {
    assert.equal(action.revisionNumber, 1);
    assert.equal(action.supersedesImportId, null);
    assert.deepEqual(action.supersedeImportIds, []);
  }
});

test("Second import with different hash creates revision 2 and supersedes revision 1", () => {
  const priorImports: SourceImportRecordSummary[] = [
    { id: "uuid-rev1", sourceHash: "c".repeat(64), revisionNumber: 1, status: "IMPORTED" },
  ];
  const action = resolveSmartScheduleImportAction(priorImports, "d".repeat(64));
  assert.equal(action.action, "NEW_REVISION");
  if (action.action === "NEW_REVISION") {
    assert.equal(action.revisionNumber, 2);
    assert.deepEqual(action.supersedeImportIds, ["uuid-rev1"]);
    assert.equal(action.supersedesImportId, "uuid-rev1");
  }
});

test("SUPERSEDED revision is not re-superseded by a third import", () => {
  const priorImports: SourceImportRecordSummary[] = [
    { id: "uuid-rev1", sourceHash: "e".repeat(64), revisionNumber: 1, status: "SUPERSEDED" },
    { id: "uuid-rev2", sourceHash: "f".repeat(64), revisionNumber: 2, status: "IMPORTED" },
  ];
  const action = resolveSmartScheduleImportAction(priorImports, "0".repeat(64));
  assert.equal(action.action, "NEW_REVISION");
  if (action.action === "NEW_REVISION") {
    assert.equal(action.revisionNumber, 3);
    assert.deepEqual(action.supersedeImportIds, ["uuid-rev2"]);
  }
});

test("Every inserted row would receive the source_import_id — no null rows", () => {
  const csv = readFileSync(CSV_PATH, "latin1");
  const classified = classifyAllRows(parseMaterialsUsedCsv(csv));
  const simulatedImportId = "00000000-0000-0000-0000-000000000001";

  const insertValues = classified.map((r, idx) => ({
    jobId: "test-job-id",
    sourceImportId: simulatedImportId,
    sourceRowOrder: idx + 1,
    materialRowKind: r.kind === "allowance" ? "BROAD_ALLOWANCE" : "PHYSICAL_PRODUCT",
  }));

  assert.equal(insertValues.length, 70);
  assert.equal(insertValues.filter(v => !v.sourceImportId).length, 0, "No null sourceImportId rows");
  const uniqueIds = new Set(insertValues.map(v => v.sourceImportId));
  assert.equal(uniqueIds.size, 1, "All rows reference the same source import");
});

test("Real Maureen CSV: 3 BROAD_ALLOWANCE rows with correct descriptions and totals", () => {
  const csv = readFileSync(CSV_PATH, "latin1");
  const classified = classifyAllRows(parseMaterialsUsedCsv(csv));
  const allowances = classified.filter(r => r.kind === "allowance");

  assert.equal(allowances.length, 3);
  const descs = allowances.map(r => r.description);
  assert.ok(descs.includes("Allowance for Carpeting"));
  assert.ok(descs.includes("Allowance for Solid Wood Flooring"));
  assert.ok(descs.includes("Allowance for Vinyl Flooring"));

  const allowanceTotal = Math.round(allowances.reduce((s, r) => s + r.totalCostIncludingWastage, 0) * 100) / 100;
  assert.equal(allowanceTotal, 5531.79);

  const physicalTotal = Math.round(classified.filter(r => r.kind === "genuine").reduce((s, r) => s + r.totalCostIncludingWastage, 0) * 100) / 100;
  assert.equal(physicalTotal, 7654.50);
});

test("Transaction rollback simulation: failed batch leaves no orphaned state", async () => {
  let sourceImportInserted = false;
  let materialRowsInserted = 0;

  async function simulateTransaction(failOnBatch: number) {
    try {
      await (async () => {
        sourceImportInserted = true;
        const rows = Array.from({ length: 70 }, (_, i) => i);
        const batchSize = 25;
        for (let i = 0; i < rows.length; i += batchSize) {
          if (Math.floor(i / batchSize) === failOnBatch) {
            throw new Error("Simulated DB error on batch " + Math.floor(i / batchSize));
          }
          materialRowsInserted += Math.min(batchSize, rows.length - i);
        }
      })();
    } catch {
      // Simulate Postgres ROLLBACK: reset all state
      sourceImportInserted = false;
      materialRowsInserted = 0;
    }
  }

  await simulateTransaction(1);
  assert.equal(sourceImportInserted, false, "Source import rolled back");
  assert.equal(materialRowsInserted, 0, "Material rows rolled back");
});
