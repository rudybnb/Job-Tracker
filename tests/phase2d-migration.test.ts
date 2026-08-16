import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getCanonicalMigrationFiles, getCanonicalMigrationJournal } from "../server/canonical-migrations.ts";

const migrationPath = "migrations/0010_phase2d_measurable_work_provenance.sql";
const migrationSql = readFileSync(migrationPath, "utf8");
const schemaSource = readFileSync("shared/schema.ts", "utf8");

test("Phase D migration is canonical and creates only the three approved tables", () => {
  const journal = getCanonicalMigrationJournal();
  const entry = journal.entries.find((candidate) => candidate.tag === "0010_phase2d_measurable_work_provenance");
  assert.ok(entry);
  assert.equal(entry.idx, 10);

  const canonical = getCanonicalMigrationFiles().find((candidate) => candidate.tag === entry.tag);
  assert.ok(canonical);
  assert.equal(canonical.filename, "0010_phase2d_measurable_work_provenance.sql");

  const createdTables = Array.from(migrationSql.matchAll(/CREATE TABLE\s+([a-z_]+)/gi), (match) => match[1].toLowerCase());
  assert.deepEqual(createdTables, ["measurable_work_item", "work_item_source_link", "work_item_hbxl_resource_link"]);

  for (const forbidden of [
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

test("measurable work has varchar job provenance and optional work area", () => {
  assert.match(migrationSql, /job_id\s+VARCHAR\s+NOT NULL\s+REFERENCES jobs\(id\) ON DELETE RESTRICT/i);
  assert.doesNotMatch(migrationSql, /job_id\s+UUID\b/i);
  assert.match(migrationSql, /work_area_id\s+UUID\s+REFERENCES work_area\(id\) ON DELETE RESTRICT/i);
  assert.doesNotMatch(migrationSql, /work_area_id\s+UUID\s+NOT NULL/i);
  assert.match(schemaSource, /export const measurableWorkItems = pgTable\("measurable_work_item", \{[\s\S]*?jobId: varchar\("job_id"\)/);
});

test("work item descriptions and trade codes are not globally unique", () => {
  const workItemTable = migrationSql.match(/CREATE TABLE measurable_work_item \([\s\S]*?\n\);/)?.[0];
  assert.ok(workItemTable);
  assert.doesNotMatch(workItemTable, /description\s+TEXT\s+NOT NULL\s+UNIQUE/i);
  assert.doesNotMatch(workItemTable, /trade_code\s+TEXT\s+UNIQUE/i);
  assert.doesNotMatch(migrationSql, /CREATE UNIQUE INDEX measurable_work_item/i);
});

test("operational quantity remains separate and explains its provenance", () => {
  assert.match(migrationSql, /planned_quantity\s+NUMERIC\(18,6\)/i);
  assert.match(migrationSql, /canonical_unit_code\s+TEXT/i);
  assert.match(migrationSql, /original_unit_text\s+TEXT/i);
  assert.match(migrationSql, /CHECK \(quantity_source IS NULL OR quantity_source IN \('DRAWING', 'HBXL_BASELINE', 'USER_CONFIRMED', 'DERIVED', 'UNKNOWN'\)\)/i);
  assert.match(migrationSql, /CHECK \(reconciliation_status IN \('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE'\)\)/i);
  assert.match(migrationSql, /lifecycle_status\s+TEXT\s+NOT NULL\s+DEFAULT 'UNKNOWN'/i);
});

test("source links require exactly one real drawing target", () => {
  assert.match(migrationSql, /measurable_work_item_id\s+UUID\s+NOT NULL\s+REFERENCES measurable_work_item\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /drawing_object_id\s+UUID\s+REFERENCES drawing_object\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /physical_wall_id\s+UUID\s+REFERENCES physical_wall\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /wall_surface_id\s+UUID\s+REFERENCES wall_surface\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /opening_id\s+UUID\s+REFERENCES opening\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /CHECK \(num_nonnulls\(drawing_object_id, physical_wall_id, wall_surface_id, opening_id\) = 1\)/i);
});

test("source target uniqueness prevents duplicate wall construction and permits separate surfaces", () => {
  assert.match(migrationSql, /CREATE UNIQUE INDEX work_item_source_link_wall_unique[\s\S]*?\(measurable_work_item_id, physical_wall_id, source_role\)[\s\S]*?WHERE physical_wall_id IS NOT NULL/i);
  assert.match(migrationSql, /CREATE UNIQUE INDEX work_item_source_link_surface_unique[\s\S]*?\(measurable_work_item_id, wall_surface_id, source_role\)[\s\S]*?WHERE wall_surface_id IS NOT NULL/i);
  assert.doesNotMatch(migrationSql, /UNIQUE[^\n]*wall_surface_id\s*,\s*source_role\)/i);
});

test("HBXL links reference immutable rows without copying baseline values", () => {
  const hbxlLinkTable = migrationSql.match(/CREATE TABLE work_item_hbxl_resource_link \([\s\S]*?\n\);/)?.[0];
  assert.ok(hbxlLinkTable);
  assert.match(hbxlLinkTable, /hbxl_resource_baseline_id\s+UUID\s+NOT NULL\s+REFERENCES hbxl_resource_baseline\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /CREATE UNIQUE INDEX work_item_hbxl_resource_link_unique[\s\S]*?measurable_work_item_id,[\s\S]*?hbxl_resource_baseline_id/i);
  for (const copiedField of ["hbxl_product_code", "description", "baseline_unit_rate", "baseline_value", "supplier", "resource_type"]) {
    assert.doesNotMatch(hbxlLinkTable, new RegExp(`\\b${copiedField}\\b`, "i"));
  }
});

test("HBXL relationship cardinality supports many resources per item and explicit resource reuse", () => {
  assert.doesNotMatch(migrationSql, /UNIQUE\s*\(measurable_work_item_id\)/i);
  assert.doesNotMatch(migrationSql, /UNIQUE\s*\(hbxl_resource_baseline_id\)/i);
  assert.match(migrationSql, /COALESCE\(resource_role, ''\)/i);
});

test("work creation requires explicit inserts and visual-only evidence has no automatic trigger", () => {
  assert.doesNotMatch(migrationSql, /CREATE TRIGGER/i);
  assert.doesNotMatch(migrationSql, /INSERT\s+INTO\s+measurable_work_item/i);
  assert.doesNotMatch(migrationSql, /NON_ESTIMATED_VISUAL_ONLY[\s\S]*?measurable_work_item/i);
});

test("Phase D is additive, non-destructive, and has no PostGIS dependency", () => {
  assert.doesNotMatch(migrationSql, /\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i);
  assert.doesNotMatch(migrationSql, /\bTRUNCATE\b/i);
  assert.doesNotMatch(migrationSql, /\bALTER\s+TABLE\b/i);
  assert.doesNotMatch(migrationSql, /CREATE EXTENSION|postgis|geometry\s*\(/i);
});

test("Phase D Drizzle schema exposes all tables and insert types", () => {
  assert.match(schemaSource, /export const measurableWorkItems = pgTable\("measurable_work_item"/);
  assert.match(schemaSource, /export const workItemSourceLinks = pgTable\("work_item_source_link"/);
  assert.match(schemaSource, /export const workItemHbxlResourceLinks = pgTable\("work_item_hbxl_resource_link"/);
  assert.match(schemaSource, /export const insertMeasurableWorkItemSchema = createInsertSchema\(measurableWorkItems\)/);
  assert.match(schemaSource, /export type WorkItemSourceLink = typeof workItemSourceLinks\.\$inferSelect/);
});
