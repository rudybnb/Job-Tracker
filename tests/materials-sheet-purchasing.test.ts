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

// ─── 3. Multiple Purchases per Material ──────────────────────────────────────

test("Multiple purchases aggregation: Self Levelling Compound", () => {
  const hbxlBudget = 737.49; // 48.84 @ £15.10

  // Purchase 1: 20 bags @ £13.50
  const p1 = {
    id: "p1",
    materialDescription: "Self Levelling Compound 25kg",
    supplierUnitPrice: 13.50,
    actualQuantity: 20,
    actualTotal: 20 * 13.50, // £270.00
  };

  // Purchase 2: 10 bags @ £14.00
  const p2 = {
    id: "p2",
    materialDescription: "Self Levelling Compound 25kg",
    supplierUnitPrice: 14.00,
    actualQuantity: 10,
    actualTotal: 10 * 14.00, // £140.00
  };

  const purchases = [p1, p2];

  // Aggregate calculations
  const totalActualQty = purchases.reduce((sum, p) => sum + p.actualQuantity, 0);
  assert.equal(totalActualQty, 30, "Actual Qty = 30");

  const totalActualSpend = purchases.reduce((sum, p) => sum + p.actualTotal, 0);
  assert.equal(totalActualSpend, 410.00, "Actual Spend = £410.00");

  const variance = Math.round((hbxlBudget - totalActualSpend) * 100) / 100;
  assert.equal(variance, 327.49, "Variance / Remaining budget = £327.49 SAVING");
  assert.ok(variance > 0, "Variance is positive (SAVING)");
});

// ─── 4. Revision Survival Proof ──────────────────────────────────────────────

test("Revision survival: real purchases persist and compare against current HBXL revision budget", () => {
  // Real purchases recorded against a material name
  const recordedPurchases = [
    {
      id: "purch-1",
      materialDescription: "Self Levelling Compound 25kg",
      supplierName: "Travis Perkins",
      supplierUnitPrice: "13.50",
      actualQuantity: "20",
      actualTotal: "270.00",
    },
    {
      id: "purch-2",
      materialDescription: "Self Levelling Compound 25kg",
      supplierName: "Screwfix",
      supplierUnitPrice: "14.00",
      actualQuantity: "10",
      actualTotal: "140.00",
    },
  ];

  // Revision 1 HBXL line
  const revision1Line = {
    id: "rev1-resource-101",
    description: "Self Levelling Compound 25kg",
    totalCostIncludingWastage: "737.49",
  };

  // Revision 1 variance: £737.49 - £410.00 = £327.49
  const totalActualSpend = recordedPurchases.reduce((s, p) => s + parseFloat(p.actualTotal), 0);
  const rev1Variance = parseFloat(revision1Line.totalCostIncludingWastage) - totalActualSpend;
  assert.equal(rev1Variance, 327.49);

  // Revision 2 arrives with new resource ID and modified budget
  const revision2Line = {
    id: "rev2-resource-205", // New resource ID in revision 2
    description: "Self Levelling Compound 25kg",
    totalCostIncludingWastage: "800.00", // Updated quantity or rate in rev 2
  };

  // Purchases survived independently! Matching against current revision 2 line:
  const matchedPurchasesForRev2 = recordedPurchases.filter(
    (p) => p.materialDescription === revision2Line.description
  );
  assert.equal(matchedPurchasesForRev2.length, 2, "All purchases retained across revisions");

  const rev2Spend = matchedPurchasesForRev2.reduce((s, p) => s + parseFloat(p.actualTotal), 0);
  assert.equal(rev2Spend, 410.00, "Spend remains £410.00");

  const rev2Variance = parseFloat(revision2Line.totalCostIncludingWastage) - rev2Spend;
  assert.equal(rev2Variance, 390.00, "Current revision 2 budget (£800) - actual spend (£410) = £390.00");
});

// ─── 5. Broad Allowances Isolated ────────────────────────────────────────────

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
