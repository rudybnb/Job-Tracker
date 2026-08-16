import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getCanonicalMigrationFiles, getCanonicalMigrationJournal } from "../server/canonical-migrations.ts";

const migrationPath = "migrations/0009_phase2c_hbxl_resource_baseline.sql";
const migrationSql = readFileSync(migrationPath, "utf8");
const schemaSource = readFileSync("shared/schema.ts", "utf8");

test("Phase C migration is canonical and creates only the HBXL baseline table", () => {
  const journal = getCanonicalMigrationJournal();
  const entry = journal.entries.find((candidate) => candidate.tag === "0009_phase2c_hbxl_resource_baseline");
  assert.ok(entry);
  assert.equal(entry.idx, 9);

  const canonical = getCanonicalMigrationFiles().find((candidate) => candidate.tag === entry.tag);
  assert.ok(canonical);
  assert.equal(canonical.filename, "0009_phase2c_hbxl_resource_baseline.sql");

  const createdTables = Array.from(migrationSql.matchAll(/CREATE TABLE\s+([a-z_]+)/gi), (match) => match[1].toLowerCase());
  assert.deepEqual(createdTables, ["hbxl_resource_baseline"]);

  for (const forbidden of [
    "measurable_work_item",
    "work_item_source_link",
    "work_item_resource_link",
    "contract_package",
    "contractor_tender_rate",
    "work_progress",
    "contractor_claim",
    "inspection_decision",
    "procurement_requirement",
    "supplier_quote",
    "purchase_order",
    "delivery",
    "actual_purchase_cost",
  ]) {
    assert.doesNotMatch(migrationSql, new RegExp(`CREATE TABLE\\s+${forbidden}\\b`, "i"));
  }
});

test("Phase C foreign keys preserve job and source revision provenance", () => {
  assert.match(migrationSql, /job_id\s+VARCHAR\s+NOT NULL\s+REFERENCES jobs\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /source_import_id\s+UUID\s+NOT NULL\s+REFERENCES project_source_import\(id\) ON DELETE RESTRICT/i);
  assert.doesNotMatch(migrationSql, /job_id\s+UUID\b/i);
  assert.match(schemaSource, /export const hbxlResourceBaselines = pgTable\("hbxl_resource_baseline", \{[\s\S]*?jobId: varchar\("job_id"\)/);
  assert.match(schemaSource, /export const hbxlResourceBaselines = pgTable\("hbxl_resource_baseline", \{[\s\S]*?sourceImportId: uuid\("source_import_id"\)/);
});

test("source-row identity is import-scoped and product code is not unique", () => {
  assert.match(migrationSql, /UNIQUE \(source_import_id, source_row_number\)/i);
  assert.match(migrationSql, /source_row_number\s+INTEGER\s+NOT NULL\s+CHECK \(source_row_number > 0\)/i);
  assert.match(migrationSql, /source_row_key\s+TEXT/i);
  assert.match(migrationSql, /source_row_hash\s+VARCHAR\(64\)\s+NOT NULL[\s\S]*?\^\[0-9a-f\]\{64\}\$/i);
  assert.match(migrationSql, /CREATE INDEX hbxl_resource_baseline_product_code_idx[\s\S]*?\(hbxl_product_code\)/i);
  assert.doesNotMatch(migrationSql, /UNIQUE\s*(?:INDEX[^\n]*[\s\S]*?)?\([^)]*hbxl_product_code/i);
});

test("baseline quantity, units, money, schedule, and source fields have approved precision", () => {
  assert.match(migrationSql, /quantity\s+NUMERIC\(18,6\)\s+NOT NULL/i);
  assert.match(migrationSql, /baseline_unit_rate\s+NUMERIC\(18,6\)/i);
  assert.match(migrationSql, /baseline_value\s+NUMERIC\(18,2\)/i);
  assert.match(migrationSql, /canonical_unit_code\s+TEXT/i);
  assert.match(migrationSql, /original_unit_text\s+TEXT/i);
  assert.match(migrationSql, /original_description\s+TEXT/i);
  assert.match(migrationSql, /source_resource_type\s+TEXT/i);
  assert.match(migrationSql, /build_phase\s+TEXT/i);
  assert.match(migrationSql, /supplier\s+TEXT/i);
  assert.match(migrationSql, /order_date\s+DATE/i);
  assert.match(migrationSql, /required_date\s+DATE/i);
  assert.match(migrationSql, /source_metadata\s+JSONB/i);
  assert.match(migrationSql, /currency_code\s+VARCHAR\(3\)\s+DEFAULT 'GBP'/i);
});

test("material, labour, plant, and faithful other remain separate", () => {
  assert.match(migrationSql, /CHECK \(resource_type IN \('MATERIAL', 'LABOUR', 'PLANT', 'OTHER'\)\)/i);
  assert.doesNotMatch(migrationSql, /resource_type\s+TEXT\s+DEFAULT/i);
});

test("all baseline source and commercial values are immutable", () => {
  assert.match(migrationSql, /CREATE FUNCTION prevent_hbxl_resource_baseline_mutation\(\)/i);
  assert.match(migrationSql, /CREATE TRIGGER hbxl_resource_baseline_values_immutable[\s\S]*?BEFORE UPDATE OR DELETE ON hbxl_resource_baseline/i);
  assert.match(migrationSql, /IF TG_OP = 'DELETE' THEN[\s\S]*?RAISE EXCEPTION 'hbxl_resource_baseline rows are immutable'/i);

  for (const immutableColumn of [
    "job_id",
    "source_import_id",
    "source_row_number",
    "source_row_key",
    "source_row_hash",
    "hbxl_product_code",
    "description",
    "original_description",
    "source_resource_type",
    "resource_type",
    "quantity",
    "canonical_unit_code",
    "original_unit_text",
    "baseline_unit_rate",
    "baseline_value",
    "currency_code",
    "build_phase",
    "supplier",
    "order_date",
    "required_date",
    "source_metadata",
    "created_at",
  ]) {
    assert.match(migrationSql, new RegExp(`NEW\\.${immutableColumn} IS DISTINCT FROM OLD\\.${immutableColumn}`, "i"));
  }

  for (const reviewColumn of ["review_status", "reason_code", "review_reason", "confirmed_by", "confirmed_at"]) {
    assert.doesNotMatch(migrationSql, new RegExp(`NEW\\.${reviewColumn} IS DISTINCT FROM OLD\\.${reviewColumn}`, "i"));
  }
});

test("baseline does not mix future quote, purchase, or actual price fields", () => {
  for (const forbiddenField of [
    "supplier_quote",
    "quoted_price",
    "purchase_order",
    "actual_purchase",
    "actual_cost",
    "invoice_price",
    "contractor_rate",
  ]) {
    assert.doesNotMatch(migrationSql, new RegExp(`\\b${forbiddenField}\\b`, "i"));
  }
});

test("Phase C is additive, non-destructive, and has no PostGIS dependency", () => {
  assert.doesNotMatch(migrationSql, /\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i);
  assert.doesNotMatch(migrationSql, /\bTRUNCATE\b/i);
  assert.doesNotMatch(migrationSql, /\bALTER\s+TABLE\b/i);
  assert.doesNotMatch(migrationSql, /CREATE EXTENSION|postgis|geometry\s*\(/i);
});

test("Phase C Drizzle schema exposes the baseline table and insert types", () => {
  assert.match(schemaSource, /export const hbxlResourceBaselines = pgTable\("hbxl_resource_baseline"/);
  assert.match(schemaSource, /numeric\("quantity", \{ precision: 18, scale: 6 \}\)/);
  assert.match(schemaSource, /numeric\("baseline_unit_rate", \{ precision: 18, scale: 6 \}\)/);
  assert.match(schemaSource, /numeric\("baseline_value", \{ precision: 18, scale: 2 \}\)/);
  assert.match(schemaSource, /export const insertHbxlResourceBaselineSchema = createInsertSchema\(hbxlResourceBaselines\)/);
  assert.match(schemaSource, /export type HbxlResourceBaseline = typeof hbxlResourceBaselines\.\$inferSelect/);
});
