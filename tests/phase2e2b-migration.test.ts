import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getCanonicalMigrationFiles, getCanonicalMigrationJournal } from "../server/canonical-migrations.ts";

const migrationPath = "migrations/0013_phase2e2b_approved_work_valuation.sql";
const migrationSql = readFileSync(migrationPath, "utf8");
const schemaSource = readFileSync("shared/schema.ts", "utf8");
test("Phase E2B records payment reconciliation as deferred work", () => {
  assert.match(migrationSql, /contractor_payments remains untouched pending legacy schema\/API reconciliation/i);
  assert.doesNotMatch(migrationSql, /CREATE TABLE\s+contractor_payments\b/i);
});

test("Phase E2B migration is canonical and creates valuation tables only", () => {
  const journal = getCanonicalMigrationJournal();
  const entry = journal.entries.find((candidate) => candidate.tag === "0013_phase2e2b_approved_work_valuation");
  assert.ok(entry);
  assert.equal(entry.idx, 13);
  assert.equal(getCanonicalMigrationFiles().find((candidate) => candidate.tag === entry.tag)?.filename, "0013_phase2e2b_approved_work_valuation.sql");

  const createdTables = Array.from(migrationSql.matchAll(/CREATE TABLE\s+([a-z_]+)/gi), (match) => match[1].toLowerCase());
  assert.deepEqual(createdTables, ["contractor_valuation", "contractor_valuation_line"]);
  assert.doesNotMatch(migrationSql, /CREATE TABLE\s+contractor_payments\b/i);
});

test("valuation headers retain project, package, contractor, period, and approval audit", () => {
  assert.match(migrationSql, /job_id\s+VARCHAR\s+NOT NULL\s+REFERENCES jobs\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /contract_package_id\s+UUID\s+NOT NULL\s+REFERENCES contract_package\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /contractor_id\s+VARCHAR\s+NOT NULL\s+REFERENCES contractors\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /status IN \('DRAFT', 'CALCULATED', 'APPROVED', 'SUPERSEDED', 'CANCELLED'\)/i);
  assert.match(migrationSql, /UNIQUE \(contract_package_id, valuation_number\)/i);
  assert.match(migrationSql, /UNIQUE \(contract_package_id, valuation_sequence\)/i);
  assert.match(migrationSql, /status NOT IN \('APPROVED', 'SUPERSEDED'\) OR \(approved_at IS NOT NULL AND approved_by IS NOT NULL\)/i);
});

test("valuation lines reference operational and locked tender identities", () => {
  assert.match(migrationSql, /measurable_work_item_id\s+UUID\s+NOT NULL\s+REFERENCES measurable_work_item\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /contractor_tender_rate_id\s+UUID\s+NOT NULL\s+REFERENCES contractor_tender_rate\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /tender_rate_work_item_link_id\s+UUID\s+NOT NULL\s+REFERENCES contractor_tender_rate_work_item_link\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /approved_quantity\s+NUMERIC\(18,6\)/i);
  assert.match(migrationSql, /previously_valued_quantity\s+NUMERIC\(18,6\)/i);
  assert.match(migrationSql, /current_valuation_quantity\s+NUMERIC\(18,6\)/i);
  assert.match(migrationSql, /current_value\s+NUMERIC\(18,2\)/i);
  assert.doesNotMatch(migrationSql, /^\s*locked_unit_rate\s+/im);
});

test("only current non-superseded approved inspection quantities are valued", () => {
  assert.match(migrationSql, /SUM\(decision\.approved_quantity\)/i);
  assert.match(migrationSql, /NOT EXISTS \([\s\S]*?replacement\.supersedes_decision_id = decision\.id[\s\S]*?\)/i);
  assert.doesNotMatch(migrationSql, /SUM\([^)]*claimed_quantity/i);
  assert.doesNotMatch(migrationSql, /SUM\([^)]*inspected_quantity/i);
  assert.doesNotMatch(migrationSql, /SUM\([^)]*(?:held_quantity|rejected_quantity)/i);
  assert.match(migrationSql, /approval_snapshot JSONB NOT NULL/i);
});

test("previously valued quantity is subtracted and cannot be valued twice", () => {
  assert.match(migrationSql, /SUM\(line\.current_valuation_quantity\)[\s\S]*?header\.status IN \('APPROVED', 'SUPERSEDED'\)/i);
  assert.match(migrationSql, /NEW\.current_valuation_quantity := NEW\.approved_quantity - NEW\.previously_valued_quantity/i);
  assert.match(migrationSql, /current_valuation_quantity = approved_quantity - previously_valued_quantity/i);
  assert.match(migrationSql, /NEW\.current_valuation_quantity <= 0/i);
  assert.match(migrationSql, /no unvalued approved quantity or approval exceeds tender allocation/i);
});

test("valuation value is derived from immutable tender rate with numeric rounding", () => {
  assert.match(migrationSql, /NEW\.current_value := round\(NEW\.current_valuation_quantity \* tender\.locked_unit_rate, 2\)/i);
  assert.match(migrationSql, /tender\.status NOT IN \('ACCEPTED', 'LOCKED'\)/i);
  assert.match(migrationSql, /tender\.currency_code <> valuation_line\.currency_code/i);
  assert.doesNotMatch(migrationSql, /\bREAL\b|DOUBLE PRECISION|FLOAT/i);
});

test("approved valuation snapshots are immutable and stale approvals are blocked", () => {
  assert.match(migrationSql, /CREATE TRIGGER contractor_valuation_line_append_only[\s\S]*?BEFORE UPDATE OR DELETE ON contractor_valuation_line/i);
  assert.match(migrationSql, /approved contractor valuations cannot be deleted/i);
  assert.match(migrationSql, /approved contractor valuation fields are immutable/i);
  assert.match(migrationSql, /approved contractor valuation cannot be reopened/i);
  assert.match(migrationSql, /supersedes_valuation_id\s+UUID\s+REFERENCES contractor_valuation\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /CREATE UNIQUE INDEX contractor_valuation_supersedes_unique[\s\S]*?WHERE supersedes_valuation_id IS NOT NULL/i);
  assert.match(migrationSql, /replacement valuation must reference a superseded valuation in the same package/i);
  assert.match(migrationSql, /valuation line is stale or does not reconcile to current approvals, prior valuations, allocation, or locked tender rate/i);
  assert.equal((migrationSql.match(/current_setting\('transaction_isolation'\) <> 'serializable'/gi) ?? []).length, 2);
});

test("Phase E2B migration leaves contractor_payments completely untouched", () => {
  assert.doesNotMatch(migrationSql, /(?:ALTER|DROP|UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+(?:TABLE\s+)?contractor_payments\b/i);
  assert.doesNotMatch(migrationSql, /contractor_payment_id|payment_status|payment_date|payment_amount/i);
});

test("E2B excludes payment, tax, deduction, procurement, and PostGIS structures", () => {
  for (const term of ["vat", "cis", "retention", "credit_note", "tax_deduction", "procurement_requirement", "supplier_quote", "purchase_order", "actual_purchase_cost"]) {
    assert.doesNotMatch(migrationSql, new RegExp(`\\b${term}\\b`, "i"));
  }
  assert.doesNotMatch(migrationSql, /CREATE EXTENSION|postgis|geometry\s*\(/i);
});

test("Phase E2B Drizzle schema exposes valuation tables", () => {
  assert.match(schemaSource, /export const contractorValuations = pgTable\("contractor_valuation"/);
  assert.match(schemaSource, /export const contractorValuationLines = pgTable\("contractor_valuation_line"/);
  assert.match(schemaSource, /numeric\("current_value", \{ precision: 18, scale: 2 \}\)/);
  assert.match(schemaSource, /export type ContractorValuationLine = typeof contractorValuationLines\.\$inferSelect/);
});
