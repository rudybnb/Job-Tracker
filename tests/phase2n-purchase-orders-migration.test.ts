import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getCanonicalMigrationFiles, getCanonicalMigrationJournal } from "../server/canonical-migrations.ts";
import { TABLE_OWNERSHIP_MANIFEST, verifyTableOwnershipManifest } from "../server/table-manifest.ts";

const migrationSql = readFileSync("migrations/0016_phase2n_purchase_orders.sql", "utf8");
const schemaSource = readFileSync("shared/schema.ts", "utf8");
const baselineSql = readFileSync("migrations/0009_phase2c_hbxl_resource_baseline.sql", "utf8");
const quoteSql = readFileSync("migrations/0015_phase2m_procurement_requirements_supplier_quotes.sql", "utf8");
const originalSql = readFileSync("migrations/0000_handy_harrier.sql", "utf8");

test("Phase 2N migration is canonical and creates only the two F2A tables", () => {
  const entry = getCanonicalMigrationJournal().entries.find((candidate) => candidate.tag === "0016_phase2n_purchase_orders");
  assert.equal(entry?.idx, 16);
  assert.equal(getCanonicalMigrationFiles().find((candidate) => candidate.tag === entry?.tag)?.filename, "0016_phase2n_purchase_orders.sql");
  assert.deepEqual(Array.from(migrationSql.matchAll(/CREATE TABLE\s+([a-z_]+)/gi), (match) => match[1]), ["purchase_order", "purchase_order_line"]);
});

test("purchase order tables have one canonical owner and Drizzle definitions", () => {
  assert.doesNotThrow(verifyTableOwnershipManifest);
  for (const table of ["purchase_order", "purchase_order_line"]) {
    assert.equal(TABLE_OWNERSHIP_MANIFEST.canonical.includes(table), true);
    assert.match(schemaSource, new RegExp(`pgTable\\("${table}"`));
  }
});

test("purchase order header preserves supplier, quote, identity, schedule, and audit", () => {
  const table = migrationSql.match(/CREATE TABLE purchase_order \([\s\S]*?\n\);/)?.[0];
  assert.ok(table);
  assert.match(table, /job_id VARCHAR NOT NULL REFERENCES jobs\(id\) ON DELETE RESTRICT/i);
  assert.match(table, /accepted_supplier_quote_id UUID REFERENCES supplier_quote\(id\) ON DELETE RESTRICT/i);
  assert.match(table, /supersedes_purchase_order_id UUID REFERENCES purchase_order\(id\) ON DELETE RESTRICT/i);
  assert.match(table, /po_number TEXT NOT NULL/i);
  assert.match(table, /expected_delivery_date DATE/i);
  assert.match(table, /status IN \('DRAFT', 'APPROVED', 'SENT', 'PART_ORDERED', 'ORDERED', 'CANCELLED', 'COMPLETED'\)/i);
  assert.match(table, /currency_code VARCHAR\(3\) NOT NULL DEFAULT 'GBP'/i);
  assert.match(table, /created_at TIMESTAMPTZ NOT NULL DEFAULT now\(\)/i);
  assert.match(table, /updated_at TIMESTAMPTZ NOT NULL DEFAULT now\(\)/i);
});

test("purchase order lines retain independent authorised quantity and agreed price", () => {
  const table = migrationSql.match(/CREATE TABLE purchase_order_line \([\s\S]*?\n\);/)?.[0];
  assert.ok(table);
  assert.match(table, /purchase_order_id UUID NOT NULL REFERENCES purchase_order\(id\) ON DELETE RESTRICT/i);
  assert.match(table, /procurement_requirement_id UUID REFERENCES procurement_requirement\(id\) ON DELETE RESTRICT/i);
  assert.match(table, /supplier_quote_line_id UUID REFERENCES supplier_quote_line\(id\) ON DELETE RESTRICT/i);
  assert.match(table, /ordered_quantity NUMERIC\(18,6\) NOT NULL/i);
  assert.match(table, /agreed_unit_price NUMERIC\(18,6\) NOT NULL/i);
  assert.match(table, /ordered_line_value NUMERIC\(18,2\) NOT NULL/i);
  assert.match(table, /ordered_line_value = round\(ordered_quantity \* agreed_unit_price, 2\)/i);
  assert.doesNotMatch(table, /baseline_(?:unit_rate|quantity)|quoted_quantity|actual_(?:cost|price)/i);
});

test("multiple effective lines may fulfill one requirement with concurrency-safe cap", () => {
  assert.doesNotMatch(migrationSql, /UNIQUE[^;]*procurement_requirement_id/i);
  assert.match(migrationSql, /current_setting\('transaction_isolation'\) <> 'serializable'/i);
  assert.match(migrationSql, /FROM procurement_requirement requirement[\s\S]*ORDER BY requirement\.id[\s\S]*FOR UPDATE/i);
  assert.match(migrationSql, /header\.status IN \('APPROVED', 'SENT', 'PART_ORDERED', 'ORDERED', 'COMPLETED'\)/i);
  assert.doesNotMatch(migrationSql, /header\.status IN \([^)]*(?:DRAFT|CANCELLED)/i);
  assert.match(migrationSql, /existing_ordered \+ this_ordered > requirement_record\.required_quantity/i);
  assert.match(migrationSql, /over_order_reason/i);
  assert.match(migrationSql, /over_order_approved_by/i);
});

test("requirement status and quantity remain reconciled to effective orders", () => {
  assert.match(migrationSql, /WHEN effective_ordered = 0 THEN 'APPROVED_TO_BUY'/i);
  assert.match(migrationSql, /WHEN effective_ordered < required THEN 'PART_ORDERED'/i);
  assert.match(migrationSql, /ELSE 'FULLY_ORDERED'/i);
  assert.match(migrationSql, /quantity cannot be reduced below effective ordered quantity/i);
  assert.match(migrationSql, /ordered status must reconcile to effective purchase orders/i);
  assert.match(migrationSql, /OLD\.status IN \('APPROVED', 'SENT', 'PART_ORDERED', 'ORDERED', 'COMPLETED'\)[\s\S]*NEW\.status IN \('APPROVED', 'SENT', 'PART_ORDERED', 'ORDERED', 'COMPLETED'\)/i);
});

test("quote and PO remain separate validated evidence", () => {
  assert.match(migrationSql, /quote\.status <> 'ACCEPTED'/i);
  assert.match(migrationSql, /quote_line\.supplier_quote_id <> quote\.id/i);
  assert.match(migrationSql, /quote_line\.procurement_requirement_id IS DISTINCT FROM NEW\.procurement_requirement_id/i);
  assert.doesNotMatch(migrationSql, /UPDATE\s+supplier_quote|UPDATE\s+supplier_quote_line/i);
  assert.match(quoteSql, /quoted_quantity NUMERIC\(18,6\) NOT NULL/i);
});

test("sent and effective order history cannot silently change or disappear", () => {
  assert.match(migrationSql, /purchase order lines can only change while the order is DRAFT/i);
  assert.match(migrationSql, /approved or sent purchase order commercial evidence is immutable/i);
  assert.match(migrationSql, /effective purchase order status cannot move backwards/i);
  assert.match(migrationSql, /purchase order history cannot be deleted; cancel and replace the order/i);
  assert.match(migrationSql, /supersedes_purchase_order_id/i);
});

test("legacy material_purchases, HBXL, and quote tables remain untouched", () => {
  assert.match(originalSql, /CREATE TABLE "material_purchases"/i);
  assert.match(baselineSql, /baseline_unit_rate NUMERIC\(18,6\)/i);
  for (const table of ["material_purchases", "hbxl_resource_baseline", "supplier_quote", "supplier_quote_line"]) {
    assert.doesNotMatch(migrationSql, new RegExp(`(?:ALTER|UPDATE|DELETE\\s+FROM|INSERT\\s+INTO)\\s+(?:TABLE\\s+)?${table}\\b`, "i"));
  }
});

test("F2A excludes deliveries, invoices, actual cost, supplier master, and PostGIS", () => {
  assert.doesNotMatch(migrationSql, /CREATE TABLE\s+(?:delivery|invoice|actual_purchase_cost|supplier\b)/i);
  assert.doesNotMatch(migrationSql, /\b(postgis|geometry|geography)\b/i);
  assert.doesNotMatch(migrationSql, /DROP\s+(?:TABLE|COLUMN)|ALTER\s+TABLE|TRUNCATE/i);
});
