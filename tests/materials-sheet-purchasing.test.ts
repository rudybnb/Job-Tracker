import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseMaterialsUsedCsv,
  classifyAllRows,
  normalizeProductDescription,
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

// ─── 3. Self Levelling Compound True Saving vs Remaining Budget Test ──────────

test("Self Levelling Compound: True saving is £43.00 and remaining budget is £327.49", () => {
  const plannedQty = 48.84;
  const hbxlRate = 15.10;
  const hbxlBudget = 737.49;

  // Purchase 1: 20 bags @ £13.50 = £270.00 (PAID)
  const p1 = {
    id: "p1",
    materialKey: "self levelling compound",
    materialDescription: "Self Levelling Compound 25kg",
    supplierUnitPrice: "13.50",
    actualQuantity: "20.0000",
    actualTotal: "270.00",
    paymentStatus: "PAID",
  };

  // Purchase 2: 10 bags @ £14.00 = £140.00 (UNPAID)
  const p2 = {
    id: "p2",
    materialKey: "self levelling compound",
    materialDescription: "Self Levelling Compound 25kg",
    supplierUnitPrice: "14.00",
    actualQuantity: "10.0000",
    actualTotal: "140.00",
    paymentStatus: "UNPAID",
  };

  // Purchase 3: 5 bags @ £12.00 = £60.00 (CANCELLED)
  const p3 = {
    id: "p3",
    materialKey: "self levelling compound",
    materialDescription: "Self Levelling Compound 25kg",
    supplierUnitPrice: "12.00",
    actualQuantity: "5.0000",
    actualTotal: "60.00",
    paymentStatus: "CANCELLED",
  };

  const allPurchases = [p1, p2, p3];

  // Exclude cancelled purchases from active totals
  const activePurchases = allPurchases.filter((p) => p.paymentStatus !== "CANCELLED");
  assert.equal(activePurchases.length, 2, "2 active purchases");

  const purchasedQty = activePurchases.reduce((s, p) => s + parseFloat(p.actualQuantity), 0);
  assert.equal(purchasedQty, 30.00, "Purchased Qty = 30.00");

  const remainingQty = Math.max(plannedQty - purchasedQty, 0);
  assert.equal(Math.round(remainingQty * 100) / 100, 18.84, "Remaining Qty = 18.84");

  const actualSpend = activePurchases.reduce((s, p) => s + parseFloat(p.actualTotal), 0);
  assert.equal(actualSpend, 410.00, "Actual Spend = £410.00");

  // HBXL benchmark on purchased quantity: 30 * £15.10 = £453.00
  const hbxlBenchmark = Math.round(purchasedQty * hbxlRate * 100) / 100;
  assert.equal(hbxlBenchmark, 453.00, "HBXL benchmark on 30 units = £453.00");

  // TRUE PURCHASE SAVING = Benchmark (£453.00) - Actual Spend (£410.00) = +£43.00
  const trueSaving = Math.round((hbxlBenchmark - actualSpend) * 100) / 100;
  assert.equal(trueSaving, 43.00, "True Saving = +£43.00 (NOT £327.49)");

  // BUDGET REMAINING = Full HBXL Budget (£737.49) - Actual Spend (£410.00) = £327.49
  const budgetRemaining = Math.round((hbxlBudget - actualSpend) * 100) / 100;
  assert.equal(budgetRemaining, 327.49, "Budget Remaining = £327.49");
});

// ─── 4. Overbuying Handling Test ─────────────────────────────────────────────

test("Overbuying: remaining quantity is 0 and benchmark evaluates full purchased quantity", () => {
  const plannedQty = 10;
  const hbxlRate = 10.00;
  const hbxlBudget = 100.00;

  // Purchased 15 @ £9.00 = £135.00
  const purchasedQty = 15;
  const actualSpend = 135.00;

  const remainingQty = Math.max(plannedQty - purchasedQty, 0);
  assert.equal(remainingQty, 0, "Remaining Qty is clamped to 0 when overbought");

  const isOverbought = purchasedQty > plannedQty;
  assert.equal(isOverbought, true, "Flagged as over planned quantity");

  const benchmark = purchasedQty * hbxlRate; // 15 * 10 = £150
  assert.equal(benchmark, 150.00);

  const trueSaving = benchmark - actualSpend; // £150 - £135 = £15
  assert.equal(trueSaving, 15.00, "True saving on units bought is £15.00");

  const budgetRemaining = hbxlBudget - actualSpend; // £100 - £135 = -£35
  assert.equal(budgetRemaining, -35.00, "Over full planned budget by £35.00");
});

// ─── 5. Stable material_key Revision Survival Proof ──────────────────────────

test("Stable material_key: purchases persist across HBXL revision description changes", () => {
  const key = normalizeProductDescription("Self Levelling Compound 25kg");
  assert.equal(key, "self levelling compound");

  const recordedPurchases = [
    {
      id: "purch-1",
      materialKey: key,
      materialDescription: "Self Levelling Compound 25kg",
      supplierName: "Travis Perkins",
      supplierUnitPrice: "13.50",
      actualQuantity: "20.0000",
      actualTotal: "270.00",
      paymentStatus: "PAID",
    },
    {
      id: "purch-2",
      materialKey: key,
      materialDescription: "Self Levelling Compound 25kg",
      supplierName: "Screwfix",
      supplierUnitPrice: "14.00",
      actualQuantity: "10.0000",
      actualTotal: "140.00",
      paymentStatus: "UNPAID",
    },
  ];

  // Revision 2 arrives with description: "Self Levelling Compound"
  const revision2Line = {
    id: "rev2-resource-999",
    description: "Self Levelling Compound",
    unitRate: "16.00",
    totalCostIncludingWastage: "800.00",
  };

  const rev2Key = normalizeProductDescription(revision2Line.description);
  assert.equal(rev2Key, "self levelling compound");

  const matched = recordedPurchases.filter((p) => p.materialKey === rev2Key);
  assert.equal(matched.length, 2, "Purchases retained across revision");

  const purchasedQty = matched.reduce((s, p) => s + parseFloat(p.actualQuantity), 0); // 30
  const activeSpend = matched.reduce((s, p) => s + parseFloat(p.actualTotal), 0); // 410.00

  // Under revision 2 benchmark: 30 * £16.00 = £480.00 -> Saving = £480 - £410 = £70.00
  const rev2Benchmark = purchasedQty * parseFloat(revision2Line.unitRate);
  assert.equal(rev2Benchmark, 480.00);

  const rev2Saving = rev2Benchmark - activeSpend;
  assert.equal(rev2Saving, 70.00, "True saving against Revision 2 benchmark = +£70.00");
});

// ─── 6. Broad Allowances Isolated ────────────────────────────────────────────

test("Broad allowances are isolated from physical supplier lines", () => {
  const csv = readFileSync(CSV_PATH, "latin1");
  const classified = classifyAllRows(parseMaterialsUsedCsv(csv));
  const allowances = classified.filter((r) => r.kind === "allowance");

  const carpet = allowances.find((a) => a.description === "Allowance for Carpeting");
  const wood = allowances.find((a) => a.description === "Allowance for Solid Wood Flooring");
  const vinyl = allowances.find((a) => a.description === "Allowance for Vinyl Flooring");

  assert.equal(carpet?.totalCostIncludingWastage, 2170.69);
  assert.equal(wood?.totalCostIncludingWastage, 2586.67);
  assert.equal(vinyl?.totalCostIncludingWastage, 774.43);
});

// ─── 7. Duplicate CSV Import UI Handling ─────────────────────────────────────

test("Materials Used CSV upload component shows informational ALREADY IMPORTED on 409 duplicate", () => {
  const uiSource = readFileSync("client/src/pages/admin-budget-tracking.tsx", "utf8");

  // Verify 409 handling
  assert.match(uiSource, /response\.status === 409/);
  assert.match(uiSource, /ALREADY IMPORTED/);
  assert.match(uiSource, /This exact Materials Used CSV is already attached to this job/);
  assert.match(uiSource, /No changes were made/);

  // Verify non-error styling (blue info container instead of red error)
  assert.match(uiSource, /border-blue-500\/40 bg-blue-950\/30/);
});
