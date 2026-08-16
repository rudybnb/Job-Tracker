import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getCanonicalMigrationFiles, getCanonicalMigrationJournal } from "../server/canonical-migrations.ts";
import { TABLE_OWNERSHIP_MANIFEST, verifyTableOwnershipManifest } from "../server/table-manifest.ts";

const migrationSql = readFileSync("migrations/0014_phase2l_contractor_actual_payments.sql", "utf8");
const schemaSource = readFileSync("shared/schema.ts", "utf8");
const initializerSource = readFileSync("server/financial-tables-core.ts", "utf8");
const routesSource = readFileSync("server/financial-routes.ts", "utf8");

test("Phase 2L migration is canonical and owns the only contractor_payments table", () => {
  const journal = getCanonicalMigrationJournal();
  const entry = journal.entries.find((candidate) => candidate.tag === "0014_phase2l_contractor_actual_payments");
  assert.equal(entry?.idx, 14);
  assert.equal(getCanonicalMigrationFiles().find((candidate) => candidate.tag === entry?.tag)?.filename, "0014_phase2l_contractor_actual_payments.sql");
  assert.doesNotThrow(verifyTableOwnershipManifest);
  assert.equal(TABLE_OWNERSHIP_MANIFEST.canonical.includes("contractor_payments"), true);
  assert.equal(TABLE_OWNERSHIP_MANIFEST.financialTablesCore.includes("contractor_payments"), false);
  assert.doesNotMatch(initializerSource, /contractor_payments/i);
  assert.equal((migrationSql.match(/CREATE TABLE\s+contractor_payments\b/gi) ?? []).length, 1);
  assert.match(schemaSource, /pgTable\("contractor_payments"/);
});

test("canonical payment shape uses actual-cash vocabulary without obsolete phase fields", () => {
  const table = migrationSql.match(/CREATE TABLE contractor_payments \([\s\S]*?\n\);/)?.[0];
  assert.ok(table);
  assert.match(table, /id UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/i);
  assert.match(table, /job_id VARCHAR NOT NULL REFERENCES jobs\(id\) ON DELETE RESTRICT/i);
  assert.match(table, /contractor_id VARCHAR NOT NULL REFERENCES contractors\(id\) ON DELETE RESTRICT/i);
  assert.match(table, /contractor_valuation_id UUID REFERENCES contractor_valuation\(id\) ON DELETE RESTRICT/i);
  assert.match(table, /payment_amount NUMERIC\(18,2\) NOT NULL/i);
  assert.match(table, /currency_code VARCHAR\(3\) NOT NULL/i);
  assert.match(table, /payment_date DATE NOT NULL/i);
  assert.match(table, /payment_status TEXT NOT NULL/i);
  assert.match(table, /payment_reference TEXT/i);
  assert.match(table, /source_metadata JSONB/i);
  assert.doesNotMatch(table, /assignment_id|phase_id|milestone_id|hours_worked|days_worked|\bamount\s+NUMERIC|\bstatus\s+TEXT|reference_number/i);
});

test("one valuation can have multiple payments and only effective history consumes balance", () => {
  assert.doesNotMatch(migrationSql, /UNIQUE[^;]*contractor_valuation_id/i);
  assert.match(migrationSql, /WHEN payment\.payment_status = 'PAID' THEN payment\.payment_amount/i);
  assert.match(migrationSql, /WHEN payment\.payment_status = 'REVERSED' THEN -payment\.payment_amount/i);
  assert.match(migrationSql, /payment\.payment_status IN \('PAID', 'REVERSED'\)/i);
  assert.doesNotMatch(migrationSql, /payment\.payment_status IN \([^)]*(?:PENDING|SCHEDULED|FAILED|CANCELLED)/i);
});

test("linked payments lock approved valuation and enforce the cumulative cap serializably", () => {
  assert.match(migrationSql, /current_setting\('transaction_isolation'\) <> 'serializable'/i);
  assert.match(migrationSql, /FROM contractor_valuation[\s\S]*WHERE id = NEW\.contractor_valuation_id[\s\S]*FOR UPDATE/i);
  assert.match(migrationSql, /valuation\.status <> 'APPROVED'/i);
  assert.match(migrationSql, /SUM\(line\.current_value\)/i);
  assert.match(migrationSql, /effective_paid > approved_value/i);
  assert.match(routesSource, /isolationLevel: "serializable"/);
  assert.match(routesSource, /error\.code === "40001"/);
});

test("payments preserve valuation and cash history", () => {
  assert.doesNotMatch(migrationSql, /UPDATE\s+contractor_valuation|DELETE\s+FROM\s+contractor_valuation/i);
  assert.match(migrationSql, /payment history cannot be deleted; append an explicit reversal/i);
  assert.match(migrationSql, /effective contractor payment history is immutable; append an explicit reversal/i);
  assert.match(migrationSql, /reversal must exactly match an existing PAID payment/i);
  assert.match(migrationSql, /paid contractor payment has already been reversed/i);
});

test("unlinked exceptions require source and reason and aliases remain API-only", () => {
  assert.match(migrationSql, /source_metadata ->> 'source'/i);
  assert.match(migrationSql, /source_metadata ->> 'reason'/i);
  assert.match(routesSource, /body\.payment_amount \?\? body\.amount/);
  assert.match(routesSource, /body\.payment_reference \?\? body\.reference_number/);
  assert.match(routesSource, /body\.payment_status \?\? body\.status/);
  assert.doesNotMatch(migrationSql, /\bamount\s+NUMERIC|\bstatus\s+TEXT|reference_number/i);
});

test("Phase 2L excludes deferred financial, procurement, and spatial scope", () => {
  assert.doesNotMatch(migrationSql, /\b(vat|cis|retention|credit_note|purchase_order|procurement|postgis|geography|geometry)\b/i);
  assert.doesNotMatch(migrationSql, /CREATE TABLE\s+(?!contractor_payments\b)/i);
  assert.doesNotMatch(migrationSql, /DROP\s+(?:TABLE|COLUMN)|ALTER\s+TABLE|TRUNCATE|INSERT\s+INTO|UPDATE\s+contractor_valuation/i);
});
