import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getCanonicalMigrationFiles, getCanonicalMigrationJournal } from "../server/canonical-migrations.ts";

const migrationPath = "migrations/0007_phase2a_source_import_work_area.sql";
const migrationSql = readFileSync(migrationPath, "utf8");
const schemaSource = readFileSync("shared/schema.ts", "utf8");

test("Phase A migration is canonical and creates only the two approved tables", () => {
  const journal = getCanonicalMigrationJournal();
  const entry = journal.entries.find((candidate) => candidate.tag === "0007_phase2a_source_import_work_area");
  assert.ok(entry);
  assert.equal(entry.idx, 7);

  const canonical = getCanonicalMigrationFiles().find((candidate) => candidate.tag === entry.tag);
  assert.ok(canonical);
  assert.equal(canonical.filename, "0007_phase2a_source_import_work_area.sql");

  const createdTables = Array.from(migrationSql.matchAll(/CREATE TABLE\s+([a-z_]+)/gi), (match) => match[1].toLowerCase());
  assert.deepEqual(createdTables, ["project_source_import", "work_area"]);

  for (const forbidden of [
    "drawing_object",
    "physical_wall",
    "wall_surface",
    "opening",
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

test("Phase A job foreign keys use the existing jobs varchar ID type", () => {
  assert.match(migrationSql, /job_id\s+VARCHAR\s+NOT NULL\s+REFERENCES jobs\(id\)/gi);
  assert.equal((migrationSql.match(/job_id\s+VARCHAR\s+NOT NULL\s+REFERENCES jobs\(id\)/gi) ?? []).length, 2);
  assert.doesNotMatch(migrationSql, /job_id\s+UUID\b/i);

  assert.match(schemaSource, /export const jobs = pgTable\("jobs", \{[\s\S]*?id: varchar\("id"\)/);
  assert.match(schemaSource, /export const projectSourceImports = pgTable\("project_source_import", \{[\s\S]*?jobId: varchar\("job_id"\)/);
  assert.match(schemaSource, /export const workAreas = pgTable\("work_area", \{[\s\S]*?jobId: varchar\("job_id"\)/);
});

test("source import revision identity and current revision are protected", () => {
  assert.match(migrationSql, /revision_number\s+INTEGER\s+NOT NULL\s+CHECK \(revision_number > 0\)/i);
  assert.match(migrationSql, /supersedes_import_id\s+UUID\s+REFERENCES project_source_import\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /UNIQUE \(job_id, source_stream_key, revision_number\)/i);
  assert.match(migrationSql, /UNIQUE \(job_id, source_stream_key, source_hash\)/i);
  assert.match(migrationSql, /CREATE UNIQUE INDEX project_source_import_current_revision_unique[\s\S]*?WHERE is_current_revision = true AND status = 'IMPORTED'/i);
  assert.match(migrationSql, /source_hash\s+VARCHAR\(64\)[\s\S]*?\^\[0-9a-f\]\{64\}\$/i);
  assert.match(migrationSql, /CREATE FUNCTION prevent_project_source_import_evidence_update\(\)/i);
  assert.match(migrationSql, /CREATE TRIGGER project_source_import_evidence_immutable[\s\S]*?BEFORE UPDATE ON project_source_import/i);
  for (const immutableColumn of ["job_id", "source_type", "source_stream_key", "original_filename", "source_hash", "revision_number", "supersedes_import_id", "parser_version", "imported_at", "source_metadata"]) {
    assert.match(migrationSql, new RegExp(`NEW\\.${immutableColumn} IS DISTINCT FROM OLD\\.${immutableColumn}`, "i"));
  }
});

test("work_area supports generic area types and optional lifecycle metadata", () => {
  for (const areaType of ["ROOM", "FOUNDATION", "ROOF", "ELEVATION", "STRUCTURAL_ZONE", "EXTERNAL_WORKS", "FLOOR", "OTHER"]) {
    assert.match(migrationSql, new RegExp(`'${areaType}'`));
  }
  assert.match(migrationSql, /source_import_id\s+UUID\s+REFERENCES project_source_import\(id\) ON DELETE RESTRICT/i);
  assert.match(migrationSql, /lifecycle_status\s+TEXT\s+NOT NULL\s+DEFAULT 'UNKNOWN'/i);
  assert.match(migrationSql, /CHECK \(source IN \('PLANSEXPRESS_AREA', 'DXF', 'HBXL_PHASE', 'USER_DEFINED', 'DERIVED', 'OTHER'\)\)/i);
  assert.match(migrationSql, /CREATE UNIQUE INDEX work_area_root_identity_unique[\s\S]*?WHERE parent_work_area_id IS NULL/i);
  assert.match(migrationSql, /CREATE UNIQUE INDEX work_area_child_identity_unique[\s\S]*?WHERE parent_work_area_id IS NOT NULL/i);
  assert.match(migrationSql, /CHECK \(lifecycle_status IN \('UNKNOWN', 'EXISTING', 'PROPOSED', 'DEMOLITION'\)\)/i);
  assert.doesNotMatch(migrationSql, /room_id/i);
});

test("Phase A uses JSONB geometry and has no PostGIS dependency", () => {
  assert.match(migrationSql, /geometry\s+JSONB/i);
  assert.match(migrationSql, /source_origin_metadata\s+JSONB/i);
  assert.match(migrationSql, /source_metadata\s+JSONB/i);
  assert.match(schemaSource, /geometry: jsonb\("geometry"\)/);
  assert.doesNotMatch(migrationSql, /CREATE EXTENSION|postgis|geometry\s*\(/i);
  assert.doesNotMatch(schemaSource, /postgis/i);
});

test("Phase A preserves the approved review states and deferred confirmer identity", () => {
  for (const status of ["MATCHED", "REVIEW_REQUIRED", "USER_CONFIRMED", "UNRESOLVED", "NOT_APPLICABLE"]) {
    assert.match(migrationSql, new RegExp(`'${status}'`));
  }
  assert.match(migrationSql, /reason_code\s+TEXT/i);
  assert.match(migrationSql, /review_reason\s+TEXT/i);
  assert.match(migrationSql, /confirmed_by\s+TEXT/i);
  assert.match(migrationSql, /confirmed_at\s+TIMESTAMPTZ/i);
  assert.doesNotMatch(migrationSql, /confirmed_by\s+[^,\n]*REFERENCES/i);
});

test("Phase A migration is additive and non-destructive", () => {
  assert.doesNotMatch(migrationSql, /\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i);
  assert.doesNotMatch(migrationSql, /\bTRUNCATE\b/i);
  assert.doesNotMatch(migrationSql, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(migrationSql, /\bALTER\s+TABLE\s+(jobs|phase_assignments|job_assignments)\b/i);
});
