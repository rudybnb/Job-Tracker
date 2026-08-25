import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseHbxlWordQuote } from "../shared/hbxl-word-parser.ts";
import {
  parseMaterialsUsedCsv,
  classifyMaterialRow,
  classifyAllRows,
  normalizeProductDescription,
  matchWordProductsToCsv,
  allocateRoomBudgets,
  buildWeeklyPricedBudget,
  type MaterialsUsedRow,
  type ProductMatch,
} from "../shared/procurement-pricing.ts";
import type { ProcurementStructuredResource } from "../shared/weekly-procurement.ts";

// ─── Real Data Fixtures ─────────────────────────────────────────────────────

const CSV_PATH = "G:\\My Drive\\SCULPT PROJECTS LTD\\Maureen orubebe NW9 5YZ\\Job 3 Maureen Orubebe - Materials Used.csv";
const DOCX_PATH = "G:\\My Drive\\SCULPT PROJECTS LTD\\Maureen orubebe NW9 5YZ\\Job 3 Maureen Orubebe - Quote.docx";

let csvRows: MaterialsUsedRow[];
let wordResources: ProcurementStructuredResource[];
let wordProductDescriptions: string[];
let productMatches: ProductMatch[];

test.before(async () => {
  const csvContent = readFileSync(CSV_PATH, "latin1");
  csvRows = parseMaterialsUsedCsv(csvContent);

  const buffer = readFileSync(DOCX_PATH);
  const parsed = await parseHbxlWordQuote(buffer, "Maureen.docx");

  const resources: ProcurementStructuredResource[] = [];
  const products = new Set<string>();
  let order = 1;
  for (const location of parsed.locations) {
    for (const category of location.categories) {
      for (const r of category.structuredResources ?? []) {
        const resource: ProcurementStructuredResource = {
          id: `res-${order}`,
          locationTaskId: `${location.name}|${category.name}`,
          usageDescription: r.usageDescription,
          productDescription: r.productDescription,
          quantity: r.quantity,
          unit: r.unit,
          sourceValueRaw: r.sourceValueRaw,
          sourceValueKind: r.sourceValueKind,
          sourceOrder: order++,
        };
        resources.push(resource);
        if (r.sourceValueKind === "quantity" && r.productDescription) {
          products.add(r.productDescription);
        }
      }
    }
  }
  wordResources = resources;
  wordProductDescriptions = [...products];
  productMatches = matchWordProductsToCsv(wordProductDescriptions, csvRows);
});

// ─── CSV Parsing ────────────────────────────────────────────────────────────

test("Materials Used CSV parses to 70 data rows with correct grand total", () => {
  assert.equal(csvRows.length, 70);
  const grandTotal = csvRows.reduce((sum, r) => sum + r.totalCostIncludingWastage, 0);
  assert.equal(Math.round(grandTotal * 100) / 100, 13186.29);
});

test("CSV parsing handles quoted commas in allowance totals", () => {
  const allowance = csvRows.find((r) => r.description === "Allowance for Carpeting");
  assert.ok(allowance);
  assert.equal(allowance.totalCostIncludingWastage, 2170.69);
  assert.equal(allowance.costExcludingWastage, 2067.33);
});

test("Example row: Trade Emulsion Paint Brilliant White 5 Litre", () => {
  const row = csvRows.find((r) => r.description === "Trade Emulsion Paint Brilliant White 5 Litre");
  assert.ok(row);
  assert.equal(row.unitRate, 23.30);
  assert.equal(row.unit, "Each");
  assert.equal(row.qtyExcludingWastage, 4.40);
  assert.equal(row.wastageQty, 0.44);
  assert.equal(row.orderQtyIncludingWastage, 4.84);
  assert.equal(row.totalCostIncludingWastage, 112.78);
});

// ─── Classification ─────────────────────────────────────────────────────────

test("Allowance/provisional classification separates genuine from budget placeholders", () => {
  const classified = classifyAllRows(csvRows);
  const genuine = classified.filter((r) => r.kind === "genuine");
  const allowance = classified.filter((r) => r.kind === "allowance");
  const provisional = classified.filter((r) => r.kind === "provisional");

  assert.equal(genuine.length, 67);
  assert.equal(allowance.length, 3);
  assert.equal(provisional.length, 0);

  const genuineTotal = genuine.reduce((s, r) => s + r.totalCostIncludingWastage, 0);
  const allowanceTotal = allowance.reduce((s, r) => s + r.totalCostIncludingWastage, 0);

  assert.equal(Math.round(genuineTotal * 100) / 100, 7654.50);
  assert.equal(Math.round(allowanceTotal * 100) / 100, 5531.79);
  assert.equal(Math.round((genuineTotal + allowanceTotal) * 100) / 100, 13186.29);
});

// ─── Normalization ──────────────────────────────────────────────────────────

test("Product normalization strips dimensions for safe matching", () => {
  assert.equal(normalizeProductDescription("Trade Emulsion Paint Brilliant White 5 Litre"), "trade emulsion paint brilliant white");
  assert.equal(normalizeProductDescription("3mm Combi Underlay 15m²"), "combi underlay");
  assert.equal(normalizeProductDescription("Self Levelling Compound 25kg"), "self levelling compound");
  assert.equal(normalizeProductDescription("Fire Check FD30 Door Casing Material 32 x 138mm"), "fire check fd30 door casing material");
  assert.equal(normalizeProductDescription("Torus Architrave 25 x 75mm (Redwood)"), "torus architrave");
});

// ─── Matching ───────────────────────────────────────────────────────────────

test("Majority of Word products match CSV (EXACT + SAFE_NORMALIZED)", () => {
  const exact = productMatches.filter((m) => m.kind === "exact");
  const safe = productMatches.filter((m) => m.kind === "safe_normalized");
  const ambiguous = productMatches.filter((m) => m.kind === "ambiguous");
  const noMatch = productMatches.filter((m) => m.kind === "no_match");

  const totalMatched = exact.length + safe.length;
  assert.ok(totalMatched >= 25, `Matched ${totalMatched} products should be >= 25`);
  assert.ok(totalMatched > ambiguous.length + noMatch.length, "More matched than unmatched");
  assert.equal(ambiguous.length, 1);
  assert.equal(noMatch.length, 9);
  assert.equal(productMatches.length, totalMatched + ambiguous.length + noMatch.length);
});

test("Every SAFE_NORMALIZED match resolves to exactly 1 CSV row (no collisions)", () => {
  const safeNormalized = productMatches.filter((m) => m.kind === "safe_normalized");
  for (const m of safeNormalized) {
    assert.ok(m.csvRow, `SAFE_NORMALIZED "${m.wordProductDescription}" must have a csvRow`);
    assert.equal(m.csvDescription, m.csvRow!.description, `csvDescription must be the single matched CSV row`);
  }

  // Threshold Door Bar is correctly classified AMBIGUOUS (3 sizes collapse to 1 normalized key)
  const threshold = productMatches.find((m) => m.wordProductDescription === "Threshold Door Bar");
  assert.ok(threshold);
  assert.equal(threshold.kind, "ambiguous");
  assert.equal(threshold.csvRow, null);
});

test("Every allocation has allocatedOrderQty and allocatedBudget fields", () => {
  const allTaskIds = new Set(wordResources.map((r) => r.locationTaskId));
  const allocations = allocateRoomBudgets(wordResources, productMatches, allTaskIds);
  assert.ok(allocations.length > 0, "Some allocations exist");
  for (const a of allocations) {
    assert.ok(typeof a.allocatedOrderQty === "number" && a.allocatedOrderQty > 0, `allocatedOrderQty must be > 0 for ${a.wordProductDescription}`);
    assert.ok(typeof a.allocatedBudget === "number" && a.allocatedBudget > 0, `allocatedBudget must be > 0 for ${a.wordProductDescription}`);
    assert.ok(typeof a.unitRate === "number", `unitRate must be a number for ${a.wordProductDescription}`);
    assert.ok(a.csvProjectOrderQty > 0, `csvProjectOrderQty must be > 0 for ${a.wordProductDescription}`);
  }
});

test("Specific matched products", () => {
  const byDesc = new Map(productMatches.map((m) => [m.wordProductDescription, m]));

  // Exact
  const carpetUnderlay = byDesc.get("Carpet Underlay");
  assert.ok(carpetUnderlay);
  assert.equal(carpetUnderlay.kind, "exact");
  assert.equal(carpetUnderlay.csvRow?.totalCostIncludingWastage, 279.01);

  // Safe normalized
  const emulsionBrilliant = byDesc.get("Trade Emulsion Paint Brilliant White");
  assert.ok(emulsionBrilliant);
  assert.equal(emulsionBrilliant.kind, "safe_normalized");
  assert.ok(emulsionBrilliant.csvRow);
  assert.equal(emulsionBrilliant.csvRow.totalCostIncludingWastage, 112.78);
});

// ─── Proportional Allocation ────────────────────────────────────────────────

test("Magnolia £786.33 allocates once across all rooms, sum preserves project total", () => {
  const allTaskIds = new Set(wordResources.map((r) => r.locationTaskId));
  const allocations = allocateRoomBudgets(wordResources, productMatches, allTaskIds);

  const magnolia = allocations.filter((a) => a.wordProductDescription === "Trade Emulsion Paint Magnolia");
  assert.ok(magnolia.length > 1, "Magnolia appears in multiple rooms");

  // Budget reconciliation
  const sumOfBudgets = magnolia.reduce((s, a) => s + a.allocatedBudget, 0);
  const csvBudgetTotal = magnolia[0].csvProjectBudgetTotal;
  assert.equal(csvBudgetTotal, 786.33);
  assert.ok(Math.abs(sumOfBudgets - csvBudgetTotal) < 0.03, `Budget sum ${sumOfBudgets} ≈ ${csvBudgetTotal}`);

  // Order qty reconciliation
  const sumOfOrderQty = magnolia.reduce((s, a) => s + a.allocatedOrderQty, 0);
  const csvOrderQty = magnolia[0].csvProjectOrderQty;
  assert.equal(csvOrderQty, 20.69);
  assert.ok(Math.abs(sumOfOrderQty - csvOrderQty) < 0.05, `Order qty sum ${sumOfOrderQty} ≈ ${csvOrderQty}`);

  // Every room's allocated order qty = CSV order qty × room share
  const totalWordQty = magnolia[0].csvProjectTotalQty;
  for (const room of magnolia) {
    const expectedOrderQty = Math.round(csvOrderQty * room.roomShare * 100) / 100;
    const expectedBudget = Math.round(csvBudgetTotal * room.roomShare * 100) / 100;
    assert.ok(Math.abs(room.allocatedOrderQty - expectedOrderQty) < 0.01, `Order qty ${room.allocatedOrderQty} ≈ ${expectedOrderQty} for share ${room.roomShare}`);
    assert.ok(Math.abs(room.allocatedBudget - expectedBudget) < 0.01, `Budget ${room.allocatedBudget} ≈ ${expectedBudget} for share ${room.roomShare}`);
  }
});

test("All matched product allocations sum to genuine priced material total (±rounding)", () => {
  const allTaskIds = new Set(wordResources.map((r) => r.locationTaskId));
  const allocations = allocateRoomBudgets(wordResources, productMatches, allTaskIds);

  const totalAllocated = allocations.reduce((s, a) => s + a.allocatedBudget, 0);
  const classified = classifyAllRows(csvRows);
  const genuineTotal = classified.filter((r) => r.kind === "genuine").reduce((s, r) => s + r.totalCostIncludingWastage, 0);

  // Can't reach full genuine total because some products have NO_MATCH or AMBIGUOUS
  // but the sum of matched allocations should be a significant portion
  assert.ok(totalAllocated > 2000, `Allocated ${totalAllocated} should be > £2000`);
  assert.ok(totalAllocated <= genuineTotal + 0.01, `Allocated ${totalAllocated} ≤ genuine ${genuineTotal}`);
});

test("Weekly subset includes only scheduled rooms' shares", () => {
  // Simulate: only Bedroom 3 tasks are scheduled this week
  const bedroom3TaskIds = new Set(
    wordResources
      .filter((r) => r.locationTaskId.startsWith("Second Floor Bedroom 3"))
      .map((r) => r.locationTaskId),
  );

  const weekAllocations = allocateRoomBudgets(wordResources, productMatches, bedroom3TaskIds);
  const allAllocations = allocateRoomBudgets(
    wordResources,
    productMatches,
    new Set(wordResources.map((r) => r.locationTaskId)),
  );

  assert.ok(weekAllocations.length > 0, "Some Bedroom 3 products are priced");
  assert.ok(weekAllocations.length < allAllocations.length, "Weekly is a strict subset of all-job");
  assert.ok(weekAllocations.every((a) => bedroom3TaskIds.has(a.locationTaskId)), "Only scheduled rooms appear");
});

test("Unscheduled rooms are excluded from weekly total", () => {
  const emptyTaskIds = new Set<string>();
  const emptyAllocations = allocateRoomBudgets(wordResources, productMatches, emptyTaskIds);
  assert.equal(emptyAllocations.length, 0);
});

test("Ambiguous and no-match products are NOT priced automatically", () => {
  const allTaskIds = new Set(wordResources.map((r) => r.locationTaskId));
  const allocations = allocateRoomBudgets(wordResources, productMatches, allTaskIds);

  const ambiguousNoMatch = productMatches.filter((m) => m.kind === "ambiguous" || m.kind === "no_match");
  for (const m of ambiguousNoMatch) {
    const found = allocations.find((a) => a.wordProductDescription === m.wordProductDescription);
    assert.equal(found, undefined, `Unpriced: ${m.wordProductDescription}`);
  }
});

test("Allowance and provisional totals are separated from physical order totals", () => {
  const classified = classifyAllRows(csvRows);
  const weekly = buildWeeklyPricedBudget([], productMatches, classified);

  assert.equal(weekly.allowanceBudgetTotal, 5531.79);
  assert.equal(weekly.provisionalBudgetTotal, 0);

  // Allowance items have unit rate £1.00 — not physical products
  const allowances = classified.filter((r) => r.kind === "allowance");
  assert.ok(allowances.every((r) => r.unitRate === 1.0));
});

// ─── Full Integration ───────────────────────────────────────────────────────

test("Full weekly budget assembly with Magnolia example", () => {
  const classified = classifyAllRows(csvRows);

  // Simulate all tasks scheduled (ALL JOB filter)
  const allTaskIds = new Set(wordResources.map((r) => r.locationTaskId));
  const allocations = allocateRoomBudgets(wordResources, productMatches, allTaskIds);
  const budget = buildWeeklyPricedBudget(allocations, productMatches, classified);

  assert.ok(budget.pricedTotal > 0);
  assert.ok(budget.pricedItems.length > 0);
  assert.equal(budget.unpricedCount, 10);
  assert.equal(budget.allowanceBudgetTotal, 5531.79);
  assert.equal(budget.provisionalBudgetTotal, 0);

  // Show Magnolia allocation
  const magnoliaItems = budget.pricedItems.filter((i) => i.wordProductDescription.includes("Magnolia"));
  assert.ok(magnoliaItems.length > 0);
  const magnoliaSum = magnoliaItems.reduce((s, i) => s + i.allocatedBudget, 0);
  assert.ok(Math.abs(magnoliaSum - 786.33) < 0.03, `Magnolia sum ${magnoliaSum} ≈ £786.33`);
});
