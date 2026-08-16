import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getCanonicalMigrationFiles, getCanonicalMigrationJournal } from "../server/canonical-migrations.ts";

const migrationPath = "migrations/0012_phase2e2a_progress_claims_inspections.sql";
const migrationSql = readFileSync(migrationPath, "utf8");
const schemaSource = readFileSync("shared/schema.ts", "utf8");

test("Phase E2A migration is canonical and creates only four approved tables", () => {
  const journal = getCanonicalMigrationJournal();
  const entry = journal.entries.find((candidate) => candidate.tag === "0012_phase2e2a_progress_claims_inspections");
  assert.ok(entry);
  assert.equal(entry.idx, 12);
  assert.equal(getCanonicalMigrationFiles().find((candidate) => candidate.tag === entry.tag)?.filename, "0012_phase2e2a_progress_claims_inspections.sql");

  const createdTables = Array.from(migrationSql.matchAll(/CREATE TABLE\s+([a-z_]+)/gi), (match) => match[1].toLowerCase());
  assert.deepEqual(createdTables, ["work_progress", "contractor_claim", "contractor_claim_line", "inspection_decision"]);

  for (const forbidden of ["contractor_payment", "payment", "payment_line", "payment_valuation", "procurement_requirement", "supplier_quote", "purchase_order", "delivery", "actual_purchase_cost"]) {
    assert.doesNotMatch(migrationSql, new RegExp(`CREATE TABLE\\s+${forbidden}\\b`, "i"));
  }
});

test("progress is location-specific and references existing operational identities", () => {
  assert.match(migrationSql, /job_id\s+VARCHAR\s+NOT NULL\s+REFERENCES jobs\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /measurable_work_item_id\s+UUID\s+NOT NULL\s+REFERENCES measurable_work_item\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /contractor_id\s+VARCHAR\s+NOT NULL\s+REFERENCES contractors\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /tender_rate_work_item_link_id\s+UUID\s+REFERENCES contractor_tender_rate_work_item_link\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /progress_quantity\s+NUMERIC\(18,6\)\s+NOT NULL/i);
  assert.doesNotMatch(migrationSql, /work_progress[\s\S]*?agreed_quantity/i);
});

test("progress is append-only with exact append-only reversal records", () => {
  assert.match(migrationSql, /CREATE TRIGGER work_progress_append_only[\s\S]*?BEFORE UPDATE OR DELETE ON work_progress/i);
  assert.match(migrationSql, /entry_type IN \('PROGRESS', 'REVERSAL'\)/i);
  assert.match(migrationSql, /reverses_progress_id\s+UUID\s+REFERENCES work_progress\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /progress reversal must exactly reverse one matching progress entry/i);
  assert.match(migrationSql, /CREATE UNIQUE INDEX work_progress_reversal_unique[\s\S]*?WHERE reverses_progress_id IS NOT NULL/i);
});

test("claim headers and lines keep claimed quantity separate from approval", () => {
  assert.match(migrationSql, /UNIQUE \(contract_package_id, claim_number\)/i);
  assert.match(migrationSql, /UNIQUE \(contract_package_id, claim_sequence\)/i);
  assert.match(migrationSql, /claimed_quantity\s+NUMERIC\(18,6\)\s+NOT NULL/i);
  const claimLineTable = migrationSql.match(/CREATE TABLE contractor_claim_line \([\s\S]*?\n\);/)?.[0];
  assert.ok(claimLineTable);
  assert.doesNotMatch(claimLineTable, /approved_quantity|rejected_quantity|held_quantity/i);
  assert.match(claimLineTable, /contractor_tender_rate_id\s+UUID\s+NOT NULL\s+REFERENCES contractor_tender_rate\(id\) ON DELETE RESTRICT/i);
  assert.match(claimLineTable, /tender_rate_work_item_link_id\s+UUID\s+NOT NULL\s+REFERENCES contractor_tender_rate_work_item_link\(id\) ON DELETE RESTRICT/i);
});

test("inspection decisions preserve approved, rejected, held, and partial quantities", () => {
  for (const column of ["inspected_quantity", "approved_quantity", "rejected_quantity", "held_quantity"]) {
    assert.match(migrationSql, new RegExp(`${column}\\s+NUMERIC\\(18,6\\)`, "i"));
  }
  assert.match(migrationSql, /CHECK \(approved_quantity \+ rejected_quantity \+ held_quantity <= inspected_quantity\)/i);
  assert.match(migrationSql, /decision_status IN \('APPROVED', 'PART_APPROVED', 'REJECTED', 'HELD', 'REINSPECTION_REQUIRED'\)/i);
  assert.match(migrationSql, /defect_reason_code\s+TEXT/i);
  assert.match(migrationSql, /evidence_metadata\s+JSONB/i);
});

test("inspection history is append-only and requires explicit supersession", () => {
  assert.match(migrationSql, /CREATE TRIGGER inspection_decision_append_only[\s\S]*?BEFORE UPDATE OR DELETE ON inspection_decision/i);
  assert.match(migrationSql, /supersedes_decision_id\s+UUID\s+REFERENCES inspection_decision\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /CREATE UNIQUE INDEX inspection_decision_supersedes_unique[\s\S]*?WHERE supersedes_decision_id IS NOT NULL/i);
  assert.match(migrationSql, /later inspection decisions must supersede the current decision/i);
  assert.match(migrationSql, /inspection supersession must reference a decision for the same claim line/i);
});

test("cumulative over-claim and over-approval are transactionally blocked", () => {
  assert.match(migrationSql, /claim requires a known tender allocation quantity/i);
  assert.match(migrationSql, /SUM\(line\.claimed_quantity\)[\s\S]*?cumulative claimed quantity exceeds tender work-item allocation/i);
  assert.match(migrationSql, /SUM\(decision\.approved_quantity\)[\s\S]*?cumulative approved quantity exceeds tender work-item allocation/i);
  assert.equal((migrationSql.match(/current_setting\('transaction_isolation'\) <> 'serializable'/gi) ?? []).length, 2);
  assert.match(migrationSql, /SERIALIZABLE transaction with retry on serialization failure/i);
  assert.match(migrationSql, /FROM contractor_tender_rate_work_item_link[\s\S]*?FOR UPDATE/i);
});

test("E2A references locked tender facts without copying commercial values", () => {
  assert.match(migrationSql, /tender\.status NOT IN \('ACCEPTED', 'LOCKED'\)/i);
  for (const copiedField of ["locked_unit_rate", "locked_contract_value", "currency_code", "agreed_quantity"]) {
    assert.doesNotMatch(migrationSql, new RegExp(`^\\s*${copiedField}\\s+`, "im"));
  }
  assert.doesNotMatch(migrationSql, /UPDATE\s+contractor_tender_rate|ALTER\s+TABLE\s+contractor_tender_rate/i);
});

test("legacy assignments remain untouched and E2A has no PostGIS", () => {
  for (const table of ["job_phases", "sub_phases", "phase_assignments", "job_assignments", "task_progress", "task_inspection_results"]) {
    assert.doesNotMatch(migrationSql, new RegExp(`(?:ALTER|DROP|UPDATE|DELETE\\s+FROM|INSERT\\s+INTO)\\s+(?:TABLE\\s+)?${table}\\b`, "i"));
  }
  assert.doesNotMatch(migrationSql, /CREATE EXTENSION|postgis|geometry\s*\(/i);
});

test("Phase E2A Drizzle schema mirrors all four tables and types", () => {
  assert.match(schemaSource, /export const workProgress = pgTable\("work_progress"/);
  assert.match(schemaSource, /export const contractorClaims = pgTable\("contractor_claim"/);
  assert.match(schemaSource, /export const contractorClaimLines = pgTable\("contractor_claim_line"/);
  assert.match(schemaSource, /export const inspectionDecisions = pgTable\("inspection_decision"/);
  assert.match(schemaSource, /export type InspectionDecision = typeof inspectionDecisions\.\$inferSelect/);
});
