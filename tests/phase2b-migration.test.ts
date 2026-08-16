import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getCanonicalMigrationFiles, getCanonicalMigrationJournal } from "../server/canonical-migrations.ts";

const migrationPath = "migrations/0008_phase2b_drawing_structure.sql";
const migrationSql = readFileSync(migrationPath, "utf8");
const schemaSource = readFileSync("shared/schema.ts", "utf8");

test("Phase B migration is canonical and creates only the four approved tables", () => {
  const journal = getCanonicalMigrationJournal();
  const entry = journal.entries.find((candidate) => candidate.tag === "0008_phase2b_drawing_structure");
  assert.ok(entry);
  assert.equal(entry.idx, 8);

  const canonical = getCanonicalMigrationFiles().find((candidate) => candidate.tag === entry.tag);
  assert.ok(canonical);
  assert.equal(canonical.filename, "0008_phase2b_drawing_structure.sql");

  const createdTables = Array.from(migrationSql.matchAll(/CREATE TABLE\s+([a-z_]+)/gi), (match) => match[1].toLowerCase());
  assert.deepEqual(createdTables, ["drawing_object", "physical_wall", "wall_surface", "opening"]);

  for (const forbidden of [
    "hbxl_resource_baseline",
    "measurable_work_item",
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

test("Phase B preserves source and project provenance", () => {
  assert.equal((migrationSql.match(/job_id\s+VARCHAR\s+NOT NULL\s+REFERENCES jobs\(id\) ON DELETE RESTRICT/gi) ?? []).length, 3);
  assert.equal((migrationSql.match(/source_import_id\s+UUID\s+NOT NULL\s+REFERENCES project_source_import\(id\) ON DELETE RESTRICT/gi) ?? []).length, 3);
  assert.doesNotMatch(migrationSql, /job_id\s+UUID\b/i);
  assert.match(migrationSql, /work_area_id\s+UUID\s+REFERENCES work_area\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /adjacent_work_area_id\s+UUID\s+REFERENCES work_area\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /CREATE UNIQUE INDEX drawing_object_source_handle_unique[\s\S]*?\(source_import_id, plansxpress_handle\)[\s\S]*?WHERE plansxpress_handle IS NOT NULL/i);
  assert.match(migrationSql, /CREATE UNIQUE INDEX opening_source_handle_unique[\s\S]*?\(source_import_id, plansxpress_handle\)[\s\S]*?WHERE plansxpress_handle IS NOT NULL/i);

  for (const table of ["drawingObjects", "physicalWalls", "openings"]) {
    assert.match(schemaSource, new RegExp(`export const ${table} = pgTable\\([\\s\\S]*?jobId: varchar\\("job_id"\\)`));
  }
});

test("drawing objects retain generic source evidence and explicit estimating status", () => {
  for (const status of ["ESTIMATED", "NON_ESTIMATED_VISUAL_ONLY", "UNKNOWN_REVIEW"]) {
    assert.match(migrationSql, new RegExp(`'${status}'`));
  }
  assert.match(migrationSql, /estimating_status\s+TEXT\s+NOT NULL\s+DEFAULT 'UNKNOWN_REVIEW'/i);
  assert.match(migrationSql, /geometry\s+JSONB/i);
  assert.match(migrationSql, /plansxpress_handle\s+TEXT/i);
  assert.match(migrationSql, /source_entity_index\s+INTEGER/i);
  assert.match(migrationSql, /CHECK \(plansxpress_handle IS NOT NULL OR source_entity_index IS NOT NULL\)/i);
  assert.doesNotMatch(migrationSql, /CREATE EXTENSION|postgis|geometry\s*\(/i);
});

test("physical walls keep raw geometry and estimator quantities separate", () => {
  assert.match(migrationSql, /drawing_object_id\s+UUID\s+NOT NULL\s+UNIQUE\s+REFERENCES drawing_object\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /raw_centreline_length\s+NUMERIC\(18,6\)\s+NOT NULL/i);
  assert.match(migrationSql, /estimator_length\s+NUMERIC\(18,6\)\s+NOT NULL/i);
  assert.match(migrationSql, /gross_construction_area\s+NUMERIC\(18,6\)\s+NOT NULL/i);
  assert.match(migrationSql, /opening_deduction_area\s+NUMERIC\(18,6\)\s+NOT NULL\s+DEFAULT 0/i);
  assert.match(migrationSql, /net_construction_area\s+NUMERIC\(18,6\)\s+NOT NULL/i);
  assert.match(migrationSql, /start_point\s+JSONB\s+NOT NULL/i);
  assert.match(migrationSql, /end_point\s+JSONB\s+NOT NULL/i);
  assert.match(migrationSql, /CREATE UNIQUE INDEX physical_wall_source_handle_unique[\s\S]*?\(source_import_id, plansxpress_handle\)/i);
});

test("wall surfaces model two independently allocated sides", () => {
  assert.match(migrationSql, /side\s+TEXT\s+NOT NULL\s+CHECK \(side IN \('A', 'B'\)\)/i);
  assert.match(migrationSql, /UNIQUE \(physical_wall_id, side\)/i);
  assert.match(migrationSql, /adjacent_work_area_id\s+UUID\s+REFERENCES work_area\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /CHECK \(allocation_source IN \('PLANSEXPRESS_AREA', 'DXF_GEOMETRY', 'EXTERIOR_SIDE', 'USER_CONFIRMED', 'UNRESOLVED'\)\)/i);
});

test("openings support approved types and a nullable wall relationship", () => {
  const openingTableSql = migrationSql.match(/CREATE TABLE opening \([\s\S]*?\n\);/)?.[0];
  assert.ok(openingTableSql);
  assert.match(migrationSql, /physical_wall_id\s+UUID\s+REFERENCES physical_wall\(id\) ON DELETE RESTRICT/i);
  assert.doesNotMatch(openingTableSql, /physical_wall_id\s+UUID\s+NOT NULL/i);
  assert.match(migrationSql, /CHECK \(opening_type IN \('DOOR', 'WINDOW', 'OPENING', 'OTHER'\)\)/i);
  assert.match(migrationSql, /CHECK \(drawing_object_id IS NOT NULL OR physical_wall_id IS NOT NULL\)/i);
});

test("Phase B defaults lifecycle to unknown and retains review evidence", () => {
  assert.equal((migrationSql.match(/lifecycle_status\s+TEXT\s+NOT NULL\s+DEFAULT 'UNKNOWN'/gi) ?? []).length, 3);
  for (const status of ["MATCHED", "REVIEW_REQUIRED", "USER_CONFIRMED", "UNRESOLVED", "NOT_APPLICABLE"]) {
    assert.match(migrationSql, new RegExp(`'${status}'`));
  }
  assert.match(migrationSql, /reason_code\s+TEXT/i);
  assert.match(migrationSql, /review_reason\s+TEXT/i);
  assert.match(migrationSql, /confirmed_by\s+TEXT/i);
  assert.match(migrationSql, /confirmed_at\s+TIMESTAMPTZ/i);
  assert.doesNotMatch(migrationSql, /lifecycle_status\s+TEXT\s+NOT NULL\s+DEFAULT '(EXISTING|PROPOSED|DEMOLITION)'/i);
});

test("Phase B migration is additive and non-destructive", () => {
  assert.doesNotMatch(migrationSql, /\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i);
  assert.doesNotMatch(migrationSql, /\bTRUNCATE\b/i);
  assert.doesNotMatch(migrationSql, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(migrationSql, /\bALTER\s+TABLE\b/i);
});

test("Phase B Drizzle schema exposes all four tables and numeric precision", () => {
  assert.match(schemaSource, /export const drawingObjects = pgTable\("drawing_object"/);
  assert.match(schemaSource, /export const physicalWalls = pgTable\("physical_wall"/);
  assert.match(schemaSource, /export const wallSurfaces = pgTable\("wall_surface"/);
  assert.match(schemaSource, /export const openings = pgTable\("opening"/);
  assert.match(schemaSource, /numeric\("raw_centreline_length", \{ precision: 18, scale: 6 \}\)/);
  assert.match(schemaSource, /numeric\("gross_surface_area", \{ precision: 18, scale: 6 \}\)/);
  assert.match(schemaSource, /numeric\("area", \{ precision: 18, scale: 6 \}\)/);
});
