import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getCanonicalMigrationFiles, getCanonicalMigrationJournal } from "../server/canonical-migrations.ts";

const migrationPath = "migrations/0011_phase2e1_contract_packages_tender_rates.sql";
const migrationSql = readFileSync(migrationPath, "utf8");
const schemaSource = readFileSync("shared/schema.ts", "utf8");

test("Phase E1 migration is canonical and creates only package, tender-rate, and allocation-link tables", () => {
  const journal = getCanonicalMigrationJournal();
  const entry = journal.entries.find((candidate) => candidate.tag === "0011_phase2e1_contract_packages_tender_rates");
  assert.ok(entry);
  assert.equal(entry.idx, 11);

  const canonical = getCanonicalMigrationFiles().find((candidate) => candidate.tag === entry.tag);
  assert.ok(canonical);
  assert.equal(canonical.filename, "0011_phase2e1_contract_packages_tender_rates.sql");

  const createdTables = Array.from(migrationSql.matchAll(/CREATE TABLE\s+([a-z_]+)/gi), (match) => match[1].toLowerCase());
  assert.deepEqual(createdTables, ["contract_package", "contractor_tender_rate", "contractor_tender_rate_work_item_link"]);

  for (const forbidden of [
    "contract_package_work_item",
    "work_progress",
    "contractor_claim",
    "contractor_claim_line",
    "inspection_decision",
    "payment_valuation",
    "procurement_requirement",
    "supplier_quote",
    "purchase_order",
    "delivery",
    "actual_purchase_cost",
  ]) {
    assert.doesNotMatch(migrationSql, new RegExp(`CREATE TABLE\\s+${forbidden}\\b`, "i"));
  }
});

test("packages reuse existing varchar job and contractor identities", () => {
  assert.match(migrationSql, /job_id\s+VARCHAR\s+NOT NULL\s+REFERENCES jobs\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /contractor_id\s+VARCHAR\s+NOT NULL\s+REFERENCES contractors\(id\) ON DELETE RESTRICT/i);
  assert.doesNotMatch(migrationSql, /(?:job_id|contractor_id)\s+UUID\b/i);
  assert.doesNotMatch(migrationSql, /CREATE TABLE\s+contractors\b/i);
  assert.match(schemaSource, /export const contractPackages = pgTable\("contract_package", \{[\s\S]*?contractorId: varchar\("contractor_id"\)/);
});

test("tender rates are package commercial lines with decimal quantity and money", () => {
  assert.match(migrationSql, /contract_package_id\s+UUID\s+NOT NULL\s+REFERENCES contract_package\(id\) ON DELETE RESTRICT/i);
  const rateTable = migrationSql.match(/CREATE TABLE contractor_tender_rate \([\s\S]*?\n\);/)?.[0];
  assert.ok(rateTable);
  assert.match(rateTable, /tender_item_code\s+TEXT\s+NOT NULL/i);
  assert.match(rateTable, /description\s+TEXT\s+NOT NULL/i);
  assert.doesNotMatch(rateTable, /measurable_work_item_id/i);
  assert.match(migrationSql, /agreed_quantity\s+NUMERIC\(18,6\)\s+NOT NULL/i);
  assert.match(migrationSql, /locked_unit_rate\s+NUMERIC\(18,6\)\s+NOT NULL/i);
  assert.match(migrationSql, /locked_contract_value\s+NUMERIC\(18,2\)\s+NOT NULL/i);
  assert.match(migrationSql, /CHECK \(locked_contract_value = round\(agreed_quantity \* locked_unit_rate, 2\)\)/i);
  assert.doesNotMatch(migrationSql, /\bREAL\b|DOUBLE PRECISION|FLOAT/i);
});

test("revision identity and current accepted-rate uniqueness are enforced", () => {
  assert.match(migrationSql, /UNIQUE \(contract_package_id, tender_item_code, tender_revision_number\)/i);
  assert.match(migrationSql, /tender_revision_number\s+INTEGER\s+NOT NULL\s+CHECK \(tender_revision_number > 0\)/i);
  assert.match(migrationSql, /CREATE UNIQUE INDEX contractor_tender_rate_current_accepted_unique[\s\S]*?\(contract_package_id, tender_item_code\)[\s\S]*?WHERE status IN \('ACCEPTED', 'LOCKED'\)/i);
  assert.doesNotMatch(migrationSql, /UNIQUE \(measurable_work_item_id\)/i);
});

test("accepted tender commercial fields cannot be silently edited or deleted", () => {
  assert.match(migrationSql, /CREATE FUNCTION protect_accepted_contractor_tender_rate\(\)/i);
  assert.match(migrationSql, /CREATE TRIGGER contractor_tender_rate_locked_values_immutable[\s\S]*?BEFORE UPDATE OR DELETE ON contractor_tender_rate/i);
  assert.match(migrationSql, /IF OLD\.status IN \('ACCEPTED', 'LOCKED', 'SUPERSEDED'\)/i);
  assert.match(migrationSql, /IF TG_OP = 'DELETE' THEN[\s\S]*?accepted contractor tender rates cannot be deleted/i);

  for (const immutableColumn of [
    "contract_package_id",
    "tender_item_code",
    "description",
    "agreed_quantity",
    "unit_code",
    "original_unit_text",
    "locked_unit_rate",
    "currency_code",
    "locked_contract_value",
    "tender_revision_number",
    "accepted_at",
    "accepted_by",
    "source",
    "source_metadata",
    "created_at",
  ]) {
    assert.match(migrationSql, new RegExp(`NEW\\.${immutableColumn} IS DISTINCT FROM OLD\\.${immutableColumn}`, "i"));
  }
  assert.match(migrationSql, /OLD\.status = 'ACCEPTED' AND NEW\.status NOT IN \('ACCEPTED', 'LOCKED', 'SUPERSEDED'\)/i);
  assert.match(migrationSql, /OLD\.status = 'SUPERSEDED' AND NEW\.status <> 'SUPERSEDED'/i);
});

test("one commercial tender rate can allocate to many location work items", () => {
  const linkTable = migrationSql.match(/CREATE TABLE contractor_tender_rate_work_item_link \([\s\S]*?\n\);/)?.[0];
  assert.ok(linkTable);
  assert.match(linkTable, /contractor_tender_rate_id\s+UUID\s+NOT NULL\s+REFERENCES contractor_tender_rate\(id\) ON DELETE RESTRICT/i);
  assert.match(linkTable, /measurable_work_item_id\s+UUID\s+NOT NULL\s+REFERENCES measurable_work_item\(id\) ON DELETE RESTRICT/i);
  assert.match(linkTable, /allocated_quantity\s+NUMERIC\(18,6\)/i);
  assert.match(linkTable, /UNIQUE \(contractor_tender_rate_id, measurable_work_item_id\)/i);
  assert.match(linkTable, /allocation_status[\s\S]*?'REVIEW_REQUIRED'/i);
  assert.doesNotMatch(linkTable, /locked_unit_rate|locked_contract_value|currency_code/i);
  assert.doesNotMatch(migrationSql, /CHECK \([^)]*SUM\s*\(/i);
});

test("accepted states require acceptance evidence", () => {
  assert.match(migrationSql, /CHECK \(status NOT IN \('ACCEPTED', 'LOCKED', 'SUPERSEDED'\) OR \(accepted_at IS NOT NULL AND accepted_by IS NOT NULL\)\)/i);
  assert.match(migrationSql, /CHECK \(status IN \('DRAFT', 'SUBMITTED', 'ACCEPTED', 'LOCKED', 'SUPERSEDED', 'REJECTED', 'WITHDRAWN'\)\)/i);
});

test("HBXL baseline pricing remains separate and untouched", () => {
  assert.doesNotMatch(migrationSql, /REFERENCES hbxl_resource_baseline/i);
  assert.doesNotMatch(migrationSql, /\bhbxl_resource_baseline_id\b|\bbaseline_unit_rate\b|\bbaseline_value\b/i);
  assert.doesNotMatch(migrationSql, /UPDATE\s+hbxl_resource_baseline|ALTER\s+TABLE\s+hbxl_resource_baseline/i);
});

test("legacy assignments and phases are untouched", () => {
  for (const legacyTable of ["job_phases", "sub_phases", "phase_assignments", "job_assignments"]) {
    assert.doesNotMatch(migrationSql, new RegExp(`(?:ALTER|DROP|UPDATE|DELETE\\s+FROM|INSERT\\s+INTO)\\s+(?:TABLE\\s+)?${legacyTable}\\b`, "i"));
  }
  assert.doesNotMatch(migrationSql, /legacy_(?:phase|job)_assignment_id/i);
});

test("same contractor can hold multiple packages and work descriptions are not tender identities", () => {
  assert.doesNotMatch(migrationSql, /UNIQUE\s*\(contractor_id\)/i);
  assert.doesNotMatch(migrationSql, /UNIQUE\s*\(package_name\)/i);
  assert.doesNotMatch(migrationSql, /UNIQUE\s*\([^)]*description/i);
});

test("Phase E1 is additive, non-destructive, and has no PostGIS", () => {
  assert.doesNotMatch(migrationSql, /\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i);
  assert.doesNotMatch(migrationSql, /\bTRUNCATE\b/i);
  assert.doesNotMatch(migrationSql, /\bALTER\s+TABLE\b/i);
  assert.doesNotMatch(migrationSql, /CREATE EXTENSION|postgis|geometry\s*\(/i);
});

test("Phase E1 Drizzle schema exposes tables, constraints, and insert types", () => {
  assert.match(schemaSource, /export const contractPackages = pgTable\("contract_package"/);
  assert.match(schemaSource, /export const contractorTenderRates = pgTable\("contractor_tender_rate"/);
  assert.match(schemaSource, /export const contractorTenderRateWorkItemLinks = pgTable\("contractor_tender_rate_work_item_link"/);
  assert.match(schemaSource, /numeric\("locked_unit_rate", \{ precision: 18, scale: 6 \}\)/);
  assert.match(schemaSource, /numeric\("locked_contract_value", \{ precision: 18, scale: 2 \}\)/);
  assert.match(schemaSource, /export const insertContractPackageSchema = createInsertSchema\(contractPackages\)/);
  assert.match(schemaSource, /export type ContractorTenderRate = typeof contractorTenderRates\.\$inferSelect/);
  assert.match(schemaSource, /export type ContractorTenderRateWorkItemLink = typeof contractorTenderRateWorkItemLinks\.\$inferSelect/);
});
