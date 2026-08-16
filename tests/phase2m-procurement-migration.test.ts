import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getCanonicalMigrationFiles, getCanonicalMigrationJournal } from "../server/canonical-migrations.ts";
import { TABLE_OWNERSHIP_MANIFEST, verifyTableOwnershipManifest } from "../server/table-manifest.ts";

const migrationSql = readFileSync("migrations/0015_phase2m_procurement_requirements_supplier_quotes.sql", "utf8");
const baselineSql = readFileSync("migrations/0009_phase2c_hbxl_resource_baseline.sql", "utf8");
const schemaSource = readFileSync("shared/schema.ts", "utf8");

test("Phase 2M migration is canonical and creates only the three F1 tables", () => {
  const journal = getCanonicalMigrationJournal();
  const entry = journal.entries.find((candidate) => candidate.tag === "0015_phase2m_procurement_requirements_supplier_quotes");
  assert.equal(entry?.idx, 15);
  assert.equal(getCanonicalMigrationFiles().find((candidate) => candidate.tag === entry?.tag)?.filename, "0015_phase2m_procurement_requirements_supplier_quotes.sql");
  assert.deepEqual(Array.from(migrationSql.matchAll(/CREATE TABLE\s+([a-z_]+)/gi), (match) => match[1]), [
    "procurement_requirement",
    "supplier_quote",
    "supplier_quote_line",
  ]);
});

test("F1 tables have one canonical owner and Drizzle schema", () => {
  assert.doesNotThrow(verifyTableOwnershipManifest);
  for (const table of ["procurement_requirement", "supplier_quote", "supplier_quote_line"]) {
    assert.equal(TABLE_OWNERSHIP_MANIFEST.canonical.includes(table), true);
    assert.match(schemaSource, new RegExp(`pgTable\\("${table}"`));
  }
});

test("procurement requirement preserves optional source links and separate operational quantity", () => {
  const table = migrationSql.match(/CREATE TABLE procurement_requirement \([\s\S]*?\n\);/)?.[0];
  assert.ok(table);
  assert.match(table, /job_id VARCHAR NOT NULL REFERENCES jobs\(id\) ON DELETE RESTRICT/i);
  assert.match(table, /hbxl_resource_baseline_id UUID REFERENCES hbxl_resource_baseline\(id\) ON DELETE RESTRICT/i);
  assert.match(table, /measurable_work_item_id UUID REFERENCES measurable_work_item\(id\) ON DELETE RESTRICT/i);
  assert.match(table, /work_area_id UUID REFERENCES work_area\(id\) ON DELETE RESTRICT/i);
  assert.match(table, /required_quantity NUMERIC\(18,6\) NOT NULL/i);
  assert.match(table, /quantity_source IN \('HBXL_BASELINE', 'DRAWING', 'USER_CONFIRMED', 'DERIVED', 'REVISION', 'UNKNOWN'\)/i);
  assert.match(table, /review_metadata JSONB/i);
  assert.doesNotMatch(table, /baseline_quantity|baseline_unit_rate|actual_(?:cost|price)/i);
});

test("materials are the normal approved buying path without auto-converting labour or plant", () => {
  assert.match(migrationSql, /resource_type IN \('MATERIAL', 'LABOUR', 'PLANT', 'OTHER'\)/i);
  assert.match(migrationSql, /status <> 'APPROVED_TO_BUY' OR resource_type = 'MATERIAL'/i);
  assert.match(migrationSql, /review_metadata ->> 'non_material_approved'/i);
  assert.doesNotMatch(migrationSql, /INSERT\s+INTO\s+procurement_requirement|SELECT[\s\S]*FROM hbxl_resource_baseline[\s\S]*INSERT/i);
});

test("supplier quote headers retain competing and revision evidence", () => {
  const table = migrationSql.match(/CREATE TABLE supplier_quote \([\s\S]*?\n\);/)?.[0];
  assert.ok(table);
  assert.match(table, /supplier_name TEXT NOT NULL/i);
  assert.match(table, /supersedes_supplier_quote_id UUID REFERENCES supplier_quote\(id\) ON DELETE RESTRICT/i);
  assert.match(table, /revision_number INTEGER NOT NULL DEFAULT 1/i);
  assert.match(table, /status IN \('DRAFT', 'RECEIVED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'EXPIRED'\)/i);
  assert.match(migrationSql, /supplier quote commercial evidence is immutable; record a new quote revision/i);
  assert.match(migrationSql, /supplier quote revision must supersede an earlier quote for the same job and supplier/i);
  assert.match(migrationSql, /accepted supplier quote evidence is immutable/i);
  assert.doesNotMatch(migrationSql, /UNIQUE[^;]*procurement_requirement_id/i);
});

test("quote lines compare against requirements and reconcile rounded values", () => {
  const table = migrationSql.match(/CREATE TABLE supplier_quote_line \([\s\S]*?\n\);/)?.[0];
  assert.ok(table);
  assert.match(table, /supplier_quote_id UUID NOT NULL REFERENCES supplier_quote\(id\) ON DELETE RESTRICT/i);
  assert.match(table, /procurement_requirement_id UUID REFERENCES procurement_requirement\(id\) ON DELETE RESTRICT/i);
  assert.match(table, /quoted_quantity NUMERIC\(18,6\) NOT NULL/i);
  assert.match(table, /unit_price NUMERIC\(18,6\) NOT NULL/i);
  assert.match(table, /line_value NUMERIC\(18,2\) NOT NULL/i);
  assert.match(table, /line_value = round\(quoted_quantity \* unit_price, 2\)/i);
  assert.match(migrationSql, /supplier quote line must match its quote currency/i);
  assert.match(migrationSql, /supplier quote line requirement must belong to the quote job/i);
  assert.match(migrationSql, /supplier quote lines are immutable evidence; record a new quote revision/i);
});

test("HBXL baseline remains untouched and separate from quotes", () => {
  assert.match(baselineSql, /baseline_unit_rate NUMERIC\(18,6\)/i);
  assert.match(baselineSql, /hbxl_resource_baseline source and commercial fields are immutable/i);
  assert.doesNotMatch(migrationSql, /(?:ALTER|UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+(?:TABLE\s+)?hbxl_resource_baseline\b/i);
  assert.doesNotMatch(migrationSql, /UPDATE\s+procurement_requirement|UPDATE\s+supplier_quote_line/i);
});

test("F1 excludes later procurement, actual cost, scraping, and spatial scope", () => {
  assert.doesNotMatch(migrationSql, /CREATE TABLE\s+(?:purchase_order|delivery|invoice|actual_cost|supplier\b)/i);
  assert.doesNotMatch(migrationSql, /\b(web_scrap|scraping|pricing_agent|postgis|geometry|geography)\b/i);
  assert.doesNotMatch(migrationSql, /DROP\s+(?:TABLE|COLUMN)|ALTER\s+TABLE|TRUNCATE/i);
});
