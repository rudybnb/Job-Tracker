import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseMaterialsUsedCsv,
  classifyAllRows,
} from "../shared/procurement-pricing.ts";

const CSV_PATH =
  "G:\\My Drive\\SCULPT PROJECTS LTD\\Maureen orubebe NW9 5YZ\\Job 3 Maureen Orubebe - Materials Used.csv";

// ─── 1. Real Maureen Materials Used Reconciliation ───────────────────────────

test("Maureen Materials Used: 67 physical products (£7,654.50) + 3 allowances (£5,531.79) = £13,186.29", () => {
  const csv = readFileSync(CSV_PATH, "latin1");
  const rows = parseMaterialsUsedCsv(csv);
  const classified = classifyAllRows(rows);

  assert.equal(classified.length, 70, "Total 70 rows");

  const physical = classified.filter((r) => r.kind === "genuine");
  assert.equal(physical.length, 67, "67 physical products");

  const allowances = classified.filter((r) => r.kind === "allowance");
  assert.equal(allowances.length, 3, "3 broad allowances");

  const physicalTotal = Math.round(physical.reduce((s, r) => s + r.totalCostIncludingWastage, 0) * 100) / 100;
  assert.equal(physicalTotal, 7654.50, "Physical material budget must be £7,654.50");

  const allowanceTotal = Math.round(allowances.reduce((s, r) => s + r.totalCostIncludingWastage, 0) * 100) / 100;
  assert.equal(allowanceTotal, 5531.79, "Allowance budget must be £5,531.79");

  const grandTotal = Math.round(classified.reduce((s, r) => s + r.totalCostIncludingWastage, 0) * 100) / 100;
  assert.equal(grandTotal, 13186.29, "Full report total must be £13,186.29");
});

// ─── 2. Key Verified Example Rows ────────────────────────────────────────────

test("Maureen key example material rows are accurate in the flat sheet", () => {
  const csv = readFileSync(CSV_PATH, "latin1");
  const classified = classifyAllRows(parseMaterialsUsedCsv(csv));

  // Trade Emulsion Paint Magnolia 5 Litre
  const magnolia = classified.find((r) => r.description === "Trade Emulsion Paint Magnolia 5 Litre");
  assert.ok(magnolia, "Magnolia paint exists");
  assert.equal(magnolia.unitRate, 38.00);
  assert.equal(magnolia.orderQtyIncludingWastage, 20.69);
  assert.equal(magnolia.totalCostIncludingWastage, 786.33);

  // Self Levelling Compound 25kg
  const compound = classified.find((r) => r.description === "Self Levelling Compound 25kg");
  assert.ok(compound, "Self levelling compound exists");
  assert.equal(compound.unitRate, 15.10);
  assert.equal(compound.orderQtyIncludingWastage, 48.84);
  assert.equal(compound.totalCostIncludingWastage, 737.49);

  // Fire Check Door Casing
  const casing = classified.find((r) => r.description.includes("Fire Check FD30 Door Casing"));
  assert.ok(casing, "Fire check door casing exists");
  assert.equal(casing.unitRate, 8.50);
  assert.equal(casing.orderQtyIncludingWastage, 38.06);
  assert.equal(casing.totalCostIncludingWastage, 323.53);

  // Torus Architrave
  const architrave = classified.find((r) => r.description.includes("Torus Architrave"));
  assert.ok(architrave, "Architrave exists");
  assert.equal(architrave.unitRate, 4.05);
  assert.equal(architrave.orderQtyIncludingWastage, 108.90);
  assert.equal(architrave.totalCostIncludingWastage, 441.01);
});

// ─── 3. Actual Buying & Variance Calculations ────────────────────────────────

test("Supplier purchase calculation: Self Levelling Compound buying saving", () => {
  const hbxlRate = 15.10;
  const hbxlBudget = 737.49; // 48.84 * 15.10
  const supplierRate = 13.50; // Quoted cheaper
  const actualQty = 48.84;

  const actualTotal = Math.round(supplierRate * actualQty * 100) / 100;
  assert.equal(actualTotal, 659.34);

  const variance = Math.round((hbxlBudget - actualTotal) * 100) / 100;
  assert.equal(variance, 78.15, "Positive variance = £78.15 SAVING");
  assert.ok(variance > 0, "Must be classified as SAVING");
});

test("Supplier purchase calculation: overspend scenario", () => {
  const hbxlBudget = 737.49;
  const supplierRate = 16.00; // Quoted higher
  const actualQty = 48.84;

  const actualTotal = Math.round(supplierRate * actualQty * 100) / 100;
  assert.equal(actualTotal, 781.44);

  const variance = Math.round((hbxlBudget - actualTotal) * 100) / 100;
  assert.equal(variance, -43.95, "Negative variance = -£43.95 OVERSPEND");
  assert.ok(variance < 0, "Must be classified as OVERSPEND");
});

// ─── 4. Separate Broad Allowances ────────────────────────────────────────────

test("Broad allowances are isolated from physical supplier lines", () => {
  const csv = readFileSync(CSV_PATH, "latin1");
  const classified = classifyAllRows(parseMaterialsUsedCsv(csv));
  const allowances = classified.filter((r) => r.kind === "allowance");

  const allowanceNames = allowances.map((a) => a.description);
  assert.deepEqual(allowanceNames.sort(), [
    "Allowance for Carpeting",
    "Allowance for Solid Wood Flooring",
    "Allowance for Vinyl Flooring",
  ]);

  const carpet = allowances.find((a) => a.description === "Allowance for Carpeting");
  const wood = allowances.find((a) => a.description === "Allowance for Solid Wood Flooring");
  const vinyl = allowances.find((a) => a.description === "Allowance for Vinyl Flooring");

  assert.equal(carpet?.totalCostIncludingWastage, 2170.69);
  assert.equal(wood?.totalCostIncludingWastage, 2586.67);
  assert.equal(vinyl?.totalCostIncludingWastage, 774.43);
});
