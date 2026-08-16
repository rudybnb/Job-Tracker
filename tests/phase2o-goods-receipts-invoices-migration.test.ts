import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getCanonicalMigrationFiles, getCanonicalMigrationJournal } from "../server/canonical-migrations.ts";
import { TABLE_OWNERSHIP_MANIFEST, verifyTableOwnershipManifest } from "../server/table-manifest.ts";

const migrationSql = readFileSync("migrations/0017_phase2o_goods_receipts_supplier_invoices.sql", "utf8");
const schemaSource = readFileSync("shared/schema.ts", "utf8");
const poSql = readFileSync("migrations/0016_phase2n_purchase_orders.sql", "utf8");
const baselineSql = readFileSync("migrations/0009_phase2c_hbxl_resource_baseline.sql", "utf8");
const quoteSql = readFileSync("migrations/0015_phase2m_procurement_requirements_supplier_quotes.sql", "utf8");
const legacySql = readFileSync("migrations/0000_handy_harrier.sql", "utf8");
const financialSource = readFileSync("server/financial-tables-core.ts", "utf8");

test("Phase 2O migration is canonical and creates only four F2B tables", () => {
  const entry = getCanonicalMigrationJournal().entries.find((candidate) => candidate.tag === "0017_phase2o_goods_receipts_supplier_invoices");
  assert.equal(entry?.idx, 17);
  assert.equal(getCanonicalMigrationFiles().find((candidate) => candidate.tag === entry?.tag)?.filename, "0017_phase2o_goods_receipts_supplier_invoices.sql");
  assert.deepEqual(Array.from(migrationSql.matchAll(/CREATE TABLE\s+([a-z_]+)/gi), (match) => match[1]), [
    "goods_receipt", "goods_receipt_line", "supplier_invoice", "supplier_invoice_line",
  ]);
});

test("F2B tables have one canonical owner and Drizzle definitions", () => {
  assert.doesNotThrow(verifyTableOwnershipManifest);
  for (const table of ["goods_receipt", "goods_receipt_line", "supplier_invoice", "supplier_invoice_line"]) {
    assert.equal(TABLE_OWNERSHIP_MANIFEST.canonical.includes(table), true);
    assert.match(schemaSource, new RegExp(`pgTable\\("${table}"`));
  }
});

test("goods receipts preserve delivered accepted and rejected quantities", () => {
  const header = migrationSql.match(/CREATE TABLE goods_receipt \([\s\S]*?\n\);/)?.[0];
  const line = migrationSql.match(/CREATE TABLE goods_receipt_line \([\s\S]*?\n\);/)?.[0];
  assert.ok(header && line);
  assert.match(header, /purchase_order_id UUID NOT NULL REFERENCES purchase_order\(id\) ON DELETE RESTRICT/i);
  assert.match(header, /status IN \('DRAFT', 'RECEIVED', 'PART_RECEIVED', 'REJECTED', 'CANCELLED'\)/i);
  assert.match(line, /purchase_order_line_id UUID NOT NULL REFERENCES purchase_order_line\(id\) ON DELETE RESTRICT/i);
  assert.match(line, /received_quantity NUMERIC\(18,6\) NOT NULL/i);
  assert.match(line, /accepted_quantity NUMERIC\(18,6\) NOT NULL/i);
  assert.match(line, /rejected_quantity NUMERIC\(18,6\) NOT NULL DEFAULT 0/i);
  assert.match(line, /accepted_quantity \+ rejected_quantity <= received_quantity/i);
  assert.doesNotMatch(migrationSql, /UNIQUE[^;]*purchase_order_line_id/i);
});

test("partial receipts are serializable and cumulative accepted quantity is capped", () => {
  assert.match(migrationSql, /goods receipt posting and cancellation require a SERIALIZABLE transaction/i);
  assert.match(migrationSql, /FROM purchase_order_line order_line[\s\S]*ORDER BY order_line\.id FOR UPDATE/i);
  assert.match(migrationSql, /header\.status IN \('RECEIVED', 'PART_RECEIVED'\)/i);
  assert.match(migrationSql, /other_accepted \+ this_accepted > line_record\.ordered_quantity/i);
  assert.match(migrationSql, /cumulative accepted quantity exceeds purchase order quantity/i);
});

test("supplier invoices represent billed actual cost with duplicate protection", () => {
  const header = migrationSql.match(/CREATE TABLE supplier_invoice \([\s\S]*?\n\);/)?.[0];
  const line = migrationSql.match(/CREATE TABLE supplier_invoice_line \([\s\S]*?\n\);/)?.[0];
  assert.ok(header && line);
  assert.match(header, /purchase_order_id UUID REFERENCES purchase_order\(id\) ON DELETE RESTRICT/i);
  assert.match(header, /status IN \('RECEIVED', 'UNDER_REVIEW', 'APPROVED', 'DISPUTED', 'CANCELLED'\)/i);
  assert.match(migrationSql, /supplier_invoice_identity_unique[\s\S]*lower\(BTRIM\(supplier_name\)\)[\s\S]*lower\(BTRIM\(invoice_number\)\)/i);
  assert.match(line, /invoiced_quantity NUMERIC\(18,6\) NOT NULL/i);
  assert.match(line, /actual_unit_price NUMERIC\(18,6\) NOT NULL/i);
  assert.match(line, /actual_line_value NUMERIC\(18,2\) NOT NULL/i);
  assert.match(line, /actual_line_value = round\(invoiced_quantity \* actual_unit_price, 2\)/i);
});

test("partial invoices are serializable and reconcile to accepted and ordered quantities", () => {
  assert.doesNotMatch(migrationSql, /UNIQUE[^;]*purchase_order_line_id/i);
  assert.match(migrationSql, /supplier invoice approval and cancellation require a SERIALIZABLE transaction/i);
  assert.match(migrationSql, /other_invoiced \+ this_invoiced > accepted/i);
  assert.match(migrationSql, /invoiced quantity exceeds accepted quantity and requires review confirmation/i);
  assert.match(migrationSql, /other_invoiced \+ this_invoiced > line_record\.ordered_quantity/i);
  assert.match(migrationSql, /cumulative approved invoiced quantity exceeds purchase order quantity/i);
});

test("rejected delivery and invoice discrepancy remain explicit review evidence", () => {
  assert.match(migrationSql, /reconciliation_status IN \('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED'\)/i);
  assert.match(migrationSql, /reconciliation_status <> 'MATCHED' OR \(rejected_quantity = 0 AND accepted_quantity = received_quantity\)/i);
  assert.match(migrationSql, /goods receipt discrepancies require review confirmation before posting/i);
  assert.match(migrationSql, /supplier invoice discrepancies require review confirmation before approval/i);
  assert.match(migrationSql, /supplier invoice price variance requires review confirmation/i);
  assert.match(migrationSql, /must still reconcile to purchase order facts or confirmed variance/i);
});

test("effective receipt and approved invoice history is immutable", () => {
  assert.match(migrationSql, /effective goods receipt evidence is immutable/i);
  assert.match(migrationSql, /goods receipt history cannot be deleted/i);
  assert.match(migrationSql, /approved supplier invoice evidence is immutable/i);
  assert.match(migrationSql, /supplier invoice history cannot be deleted/i);
  assert.match(migrationSql, /purchase order cannot be cancelled while effective receipts or invoices exist/i);
});

test("earlier commercial facts and legacy ledgers remain untouched", () => {
  assert.match(baselineSql, /baseline_unit_rate NUMERIC\(18,6\)/i);
  assert.match(quoteSql, /unit_price NUMERIC\(18,6\) NOT NULL/i);
  assert.match(poSql, /agreed_unit_price NUMERIC\(18,6\) NOT NULL/i);
  assert.match(legacySql, /CREATE TABLE "material_purchases"/i);
  assert.match(financialSource, /CREATE TABLE IF NOT EXISTS expenses/i);
  for (const table of ["hbxl_resource_baseline", "supplier_quote", "supplier_quote_line", "purchase_order", "purchase_order_line", "material_purchases", "expenses", "project_cashflow_weekly"]) {
    assert.doesNotMatch(migrationSql, new RegExp(`(?:ALTER|UPDATE|DELETE\\s+FROM|INSERT\\s+INTO)\\s+(?:TABLE\\s+)?${table}\\b`, "i"));
  }
});

test("F2B excludes supplier payment tax credits accounting and PostGIS", () => {
  assert.doesNotMatch(migrationSql, /CREATE TABLE\s+(?:supplier_payment|payment|credit_note|accounting|vat|cis)\b/i);
  assert.doesNotMatch(migrationSql, /^\s*(?:vat|cis|credit_note|payment_amount|paid_at|payment_reference)\s+/im);
  assert.doesNotMatch(migrationSql, /CREATE EXTENSION|postgis|geometry\s*\(|geography\s*\(/i);
  assert.doesNotMatch(migrationSql, /DROP\s+(?:TABLE|COLUMN)|ALTER\s+TABLE|TRUNCATE/i);
});
