import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseHbxlWordQuote } from "../shared/hbxl-word-parser.ts";
import {
  parseMaterialsUsedCsv,
  classifyAllRows,
  matchWordProductsToCsv,
  allocateRoomBudgets,
  buildWeeklyBuyingList,
  normalizeProductDescription,
  type MaterialsUsedRow,
  type ProductMatch,
  type ActualPurchaseInput,
} from "../shared/procurement-pricing.ts";
import {
  buildRoomPackageProcurementChecklist,
  type ProcurementAssignment,
  type ProcurementLocation,
  type ProcurementLocationTask,
  type ProcurementStructuredResource,
} from "../shared/weekly-procurement.ts";

const CSV_PATH = "G:\\My Drive\\SCULPT PROJECTS LTD\\Maureen orubebe NW9 5YZ\\Job 3 Maureen Orubebe - Materials Used.csv";
const DOCX_PATH = "G:\\My Drive\\SCULPT PROJECTS LTD\\Maureen orubebe NW9 5YZ\\Job 3 Maureen Orubebe - Quote.docx";

let csvRows: MaterialsUsedRow[];
let wordResources: ProcurementStructuredResource[];
let locations: ProcurementLocation[];
let tasks: ProcurementLocationTask[];
let productMatches: ProductMatch[];
const jobId = "maureen-job";

test.before(async () => {
  const csvContent = readFileSync(CSV_PATH, "latin1");
  csvRows = parseMaterialsUsedCsv(csvContent);

  const buffer = readFileSync(DOCX_PATH);
  const parsed = await parseHbxlWordQuote(buffer, "Maureen.docx");

  const locs: ProcurementLocation[] = [];
  const tsks: ProcurementLocationTask[] = [];
  const resources: ProcurementStructuredResource[] = [];
  const products = new Set<string>();

  let order = 1;
  for (const loc of parsed.locations) {
    const locId = `loc-${loc.name}`;
    locs.push({ id: locId, jobId, name: loc.name });

    for (const cat of loc.categories) {
      const taskId = `task-${loc.name}-${cat.name}`;
      tsks.push({
        id: taskId,
        jobId,
        locationId: locId,
        workCategory: cat.name,
        taskName: cat.name,
        taskDescription: null,
      });

      for (const r of cat.structuredResources ?? []) {
        const resource: ProcurementStructuredResource = {
          id: `res-${order}`,
          locationTaskId: taskId,
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

  locations = locs;
  tasks = tsks;
  wordResources = resources;
  productMatches = matchWordProductsToCsv([...products], csvRows);
});

// ─── 1. Real Maureen Assignments Verification ─────────────────────────────────

test("Maureen NEXT 7 DAYS: 3 scheduled packages, £436.92 planned spend, 7 materials to buy", () => {
  const bed3Loc = locations.find((l) => l.name.includes("Bedroom 3"))!;
  const bed3Tasks = tasks.filter((t) => t.locationId === bed3Loc.id);

  const assignments: ProcurementAssignment[] = [
    {
      id: "a1",
      jobId,
      locationId: bed3Loc.id,
      locationTaskId: bed3Tasks.find((t) => t.workCategory === "Fire Door")!.id,
      startDate: "2026-10-06",
      endDate: "2026-10-08",
    },
    {
      id: "a2",
      jobId,
      locationId: bed3Loc.id,
      locationTaskId: bed3Tasks.find((t) => t.workCategory === "Room Decoration")!.id,
      startDate: "2026-10-12",
      endDate: "2026-10-13",
    },
    {
      id: "a3",
      jobId,
      locationId: bed3Loc.id,
      locationTaskId: bed3Tasks.find((t) => t.workCategory === "Solid Wood Flooring")!.id,
      startDate: "2026-10-12",
      endDate: "2026-10-16",
    },
  ];

  const checklist = buildRoomPackageProcurementChecklist({
    jobId,
    assignments,
    locations,
    tasks,
    structuredResources: wordResources,
    filter: "next-7-days",
    today: "2026-10-06",
  });

  assert.equal(checklist.length, 3, "3 packages scheduled in next 7 days");

  const scheduledTaskIds = new Set(checklist.map((i) => i.locationTaskId));
  const allocations = allocateRoomBudgets(wordResources, productMatches, scheduledTaskIds);
  const weeklySummary = buildWeeklyBuyingList(allocations, checklist, productMatches, csvRows, []);

  assert.equal(weeklySummary.plannedSpend, 436.92, "Planned spend is £436.92");
  assert.equal(weeklySummary.actualPurchased, 0, "No purchases made yet");
  assert.equal(weeklySummary.remainingToBuyBudget, 436.92, "Remaining to buy is £436.92");
  assert.equal(weeklySummary.totalMaterialsCount, 10, "10 total materials");
  assert.equal(weeklySummary.pricedMaterialsCount, 7, "7 priced materials");
  assert.equal(weeklySummary.unpricedMaterialsCount, 3, "3 unpriced materials");
  assert.equal(weeklySummary.remainingMaterialsCount, 10, "All 10 remain to buy");

  // Check key rows
  const magnolia = weeklySummary.items.find((i) => i.description.includes("Magnolia"));
  assert.ok(magnolia, "Magnolia paint present");
  assert.equal(magnolia.qtyNeeded, 2.96);
  assert.equal(magnolia.hbxlBudget, 112.33);
  assert.equal(magnolia.isPriced, true);
  assert.equal(magnolia.stillToBuyQty, 2.96);
  assert.equal(magnolia.stillToBuyBudget, 112.33);
  assert.ok(magnolia.neededForRooms.some((r) => r.includes("Room Decoration")));

  const levelling = weeklySummary.items.find((i) => i.description.includes("Self Levelling Compound"));
  assert.ok(levelling, "Self levelling compound present");
  assert.equal(levelling.qtyNeeded, 3.76);
  assert.equal(levelling.hbxlBudget, 56.73);
  assert.equal(levelling.isPriced, true);
  assert.equal(levelling.stillToBuyQty, 3.76);
  assert.equal(levelling.stillToBuyBudget, 56.73);
  assert.ok(levelling.neededForRooms.some((r) => r.includes("Solid Wood Flooring")));

  const architrave = weeklySummary.items.find((i) => i.description.includes("Torus Architrave"));
  assert.ok(architrave, "Torus Architrave present");
  assert.equal(architrave.qtyNeeded, 11.46, "Architrave qtyNeeded is 11.46");
  assert.equal(architrave.hbxlBudget, 46.42, "Architrave hbxlBudget is 46.42");
  assert.equal(architrave.qtyBought, 0, "Architrave qtyBought is 0");
  assert.equal(architrave.stillToBuyQty, 11.46, "Architrave stillToBuyQty is 11.46 (NOT 46.42!)");
  assert.equal(architrave.stillToBuyBudget, 46.42, "Architrave stillToBuyBudget is 46.42");
  assert.equal(architrave.unit, "m", "Architrave unit is m");

  const fireDoor = weeklySummary.items.find((i) => i.description.includes("Internal Fire Door"));
  assert.ok(fireDoor, "Internal Fire Door present");
  assert.equal(fireDoor.qtyNeeded, 1.00);
  assert.equal(fireDoor.hbxlBudget, 126.00);
  assert.equal(fireDoor.qtyBought, 0);
  assert.equal(fireDoor.stillToBuyQty, 1.00);
  assert.equal(fireDoor.stillToBuyBudget, 126.00);

  const doorCasing = weeklySummary.items.find((i) => i.description.includes("Door Casing"));
  assert.ok(doorCasing, "Door Casing present");
  assert.equal(doorCasing.qtyNeeded, 6.14);
  assert.equal(doorCasing.hbxlBudget, 52.18);
  assert.equal(doorCasing.qtyBought, 0);
  assert.equal(doorCasing.stillToBuyQty, 6.14);
  assert.equal(doorCasing.stillToBuyBudget, 52.18);

  const doorHandle = weeklySummary.items.find((i) => i.description.includes("Door Handle"));
  assert.ok(doorHandle, "Door Handle present");
  assert.equal(doorHandle.qtyNeeded, 2.00);
  assert.equal(doorHandle.hbxlBudget, 25.60);
  assert.equal(doorHandle.qtyBought, 0);
  assert.equal(doorHandle.stillToBuyQty, 2.00);
  assert.equal(doorHandle.stillToBuyBudget, 25.60);

  const softwood = weeklySummary.items.find((i) => i.description.includes("Sawn Softwood"));
  assert.ok(softwood, "Sawn Softwood present");
  assert.equal(softwood.qtyNeeded, 6.54);
  assert.equal(softwood.hbxlBudget, 17.66);
  assert.equal(softwood.qtyBought, 0);
  assert.equal(softwood.stillToBuyQty, 6.54);
  assert.equal(softwood.stillToBuyBudget, 17.66);

  const sealant = weeklySummary.items.find((i) => i.description.includes("Sealant"));
  assert.ok(sealant, "Sealant present");
  assert.equal(sealant.isPriced, false);
  assert.equal(sealant.qtyNeeded, 3);
  assert.equal(sealant.stillToBuyQty, 3);

  const thresholdBar = weeklySummary.items.find((i) => i.description.includes("Threshold Door Bar"));
  assert.ok(thresholdBar, "Threshold Door Bar present");
  assert.equal(thresholdBar.isPriced, false);
  assert.equal(thresholdBar.qtyNeeded, 1);
  assert.equal(thresholdBar.stillToBuyQty, 1);

  const doorCloser = weeklySummary.items.find((i) => i.description.includes("Door Closer"));
  assert.ok(doorCloser, "Door Closer present");
  assert.equal(doorCloser.isPriced, false);
  assert.equal(doorCloser.hbxlBudget, 0);
  assert.equal(doorCloser.qtyNeeded, 1);
  assert.equal(doorCloser.stillToBuyQty, 1);
});

test("Maureen NEXT WEEK: 2 scheduled packages, £169.06 planned spend, 3 materials to buy", () => {
  const bed3Loc = locations.find((l) => l.name.includes("Bedroom 3"))!;
  const bed3Tasks = tasks.filter((t) => t.locationId === bed3Loc.id);

  const assignments: ProcurementAssignment[] = [
    {
      id: "a1",
      jobId,
      locationId: bed3Loc.id,
      locationTaskId: bed3Tasks.find((t) => t.workCategory === "Fire Door")!.id,
      startDate: "2026-10-06",
      endDate: "2026-10-08",
    },
    {
      id: "a2",
      jobId,
      locationId: bed3Loc.id,
      locationTaskId: bed3Tasks.find((t) => t.workCategory === "Room Decoration")!.id,
      startDate: "2026-10-12",
      endDate: "2026-10-13",
    },
    {
      id: "a3",
      jobId,
      locationId: bed3Loc.id,
      locationTaskId: bed3Tasks.find((t) => t.workCategory === "Solid Wood Flooring")!.id,
      startDate: "2026-10-12",
      endDate: "2026-10-16",
    },
  ];

  const checklist = buildRoomPackageProcurementChecklist({
    jobId,
    assignments,
    locations,
    tasks,
    structuredResources: wordResources,
    filter: "next-week",
    today: "2026-10-06",
  });

  assert.equal(checklist.length, 2, "2 packages scheduled next week (Fire Door ended Oct 08)");

  const scheduledTaskIds = new Set(checklist.map((i) => i.locationTaskId));
  const allocations = allocateRoomBudgets(wordResources, productMatches, scheduledTaskIds);
  const weeklySummary = buildWeeklyBuyingList(allocations, checklist, productMatches, csvRows, []);

  assert.equal(weeklySummary.plannedSpend, 169.06, "Planned spend is £169.06 (Magnolia £112.33 + Compound £56.73)");
  assert.equal(weeklySummary.totalMaterialsCount, 3, "3 total materials (2 priced + 1 unpriced door bar)");
  assert.equal(weeklySummary.pricedMaterialsCount, 2, "2 priced materials");
  assert.equal(weeklySummary.unpricedMaterialsCount, 1, "1 unpriced material (Threshold Door Bar)");
  assert.equal(weeklySummary.remainingMaterialsCount, 3);
});

// ─── 2. Remaining to Buy Formula Clarification ────────────────────────────────

test("Remaining to Buy Formula: STILL_TO_BUY_QTY * HBXL_UNIT_RATE preserves baseline rate and does NOT mix supplier savings", () => {
  // Example from prompt:
  // Need 10 @ HBXL £10. Planned spend = £100.
  // Already bought: 5 @ supplier £8 = £40.
  // Display:
  // PLANNED MATERIAL SPEND = £100
  // ACTUAL PURCHASED = £40
  // REMAINING TO BUY = £50 (NOT £60!)

  const mockAllocations = [
    {
      locationId: "loc-1",
      locationName: "Room 1",
      locationTaskId: "task-1",
      workPackage: "Painting",
      wordProductDescription: "Special Paint",
      wordRoomQuantity: 10,
      wordRoomUnit: "Each",
      csvProjectTotalQty: 10,
      csvProjectOrderQty: 10,
      csvProjectBudgetTotal: 100,
      roomShare: 1,
      allocatedOrderQty: 10,
      allocatedBudget: 100,
      unitRate: 10,
      unit: "Each",
      matchKind: "exact" as const,
    },
  ];

  const mockChecklist = [
    {
      locationTaskId: "task-1",
      locationName: "Room 1",
      workPackage: "Painting",
    },
  ];

  const mockPurchases: ActualPurchaseInput[] = [
    {
      id: "p1",
      jobId: "test-job",
      materialKey: "special paint",
      materialDescription: "Special Paint",
      supplierName: "Discount Supplier",
      supplierUnitPrice: "8.00",
      actualQuantity: "5.00",
      actualTotal: "40.00",
      paymentStatus: "PAID",
    },
  ];

  const summary = buildWeeklyBuyingList(mockAllocations, mockChecklist, [], [], mockPurchases);

  assert.equal(summary.plannedSpend, 100.00, "Planned spend is £100");
  assert.equal(summary.actualPurchased, 40.00, "Actual purchased is £40");
  assert.equal(summary.remainingToBuyBudget, 50.00, "Remaining to buy is £50 (5 * £10), NOT £60!");
  assert.equal(summary.unpricedMaterialsCount, 0, "Zero unpriced materials");
  assert.equal(summary.pricedMaterialsCount, 1, "1 priced material");

  const item = summary.items[0];
  assert.equal(item.qtyNeeded, 10);
  assert.equal(item.hbxlBudget, 100);
  assert.equal(item.isPriced, true);
  assert.equal(item.qtyBought, 5);
  assert.equal(item.stillToBuyQty, 5);
  assert.equal(item.stillToBuyBudget, 50);
  assert.equal(item.isFullyBought, false);
});

// ─── 3. Pre-bought Material Attribution & Cancelled Exclusion ─────────────────

test("Pre-bought materials match by job + material_key without filtering by purchase date", () => {
  const mockAllocations = [
    {
      locationId: "loc-1",
      locationName: "Room 1",
      locationTaskId: "task-1",
      workPackage: "Flooring",
      wordProductDescription: "Underlay 15m²",
      wordRoomQuantity: 2,
      wordRoomUnit: "Each",
      csvProjectTotalQty: 2,
      csvProjectOrderQty: 2,
      csvProjectBudgetTotal: 50,
      roomShare: 1,
      allocatedOrderQty: 2,
      allocatedBudget: 50,
      unitRate: 25,
      unit: "Each",
      matchKind: "exact" as const,
    },
  ];

  const mockChecklist = [
    {
      locationTaskId: "task-1",
      locationName: "Room 1",
      workPackage: "Flooring",
    },
  ];

  // Purchased 2 weeks ago (outside scheduled period)
  const mockPurchases: ActualPurchaseInput[] = [
    {
      id: "p1",
      jobId: "test-job",
      materialKey: "underlay",
      materialDescription: "Underlay 15m²",
      supplierUnitPrice: "22.00",
      actualQuantity: "2.00",
      actualTotal: "44.00",
      purchaseDate: "2026-08-01",
      paymentStatus: "PAID",
    },
    {
      id: "p2",
      jobId: "test-job",
      materialKey: "underlay",
      materialDescription: "Underlay 15m²",
      supplierUnitPrice: "22.00",
      actualQuantity: "5.00",
      actualTotal: "110.00",
      purchaseDate: "2026-08-02",
      paymentStatus: "CANCELLED", // Must be ignored!
    },
  ];

  const summary = buildWeeklyBuyingList(mockAllocations, mockChecklist, [], [], mockPurchases);

  assert.equal(summary.plannedSpend, 50);
  assert.equal(summary.actualPurchased, 44);
  assert.equal(summary.remainingToBuyBudget, 0, "Fully bought pre-schedule");
  assert.equal(summary.items[0].qtyBought, 2);
  assert.equal(summary.items[0].stillToBuyQty, 0);
  assert.equal(summary.items[0].isFullyBought, true);
});

// ─── 4. Multi-Room Aggregation ────────────────────────────────────────────────

test("Multi-room aggregation sums quantities, budgets, and gathers room names", () => {
  const mockAllocations = [
    {
      locationId: "loc-bed2",
      locationName: "Bedroom 2",
      locationTaskId: "task-bed2-dec",
      workPackage: "Decoration",
      wordProductDescription: "Trade Emulsion Paint Magnolia",
      wordRoomQuantity: 2,
      wordRoomUnit: "Each",
      csvProjectTotalQty: 10,
      csvProjectOrderQty: 10,
      csvProjectBudgetTotal: 380,
      roomShare: 0.2,
      allocatedOrderQty: 2,
      allocatedBudget: 76,
      unitRate: 38,
      unit: "Each",
      matchKind: "exact" as const,
    },
    {
      locationId: "loc-bed3",
      locationName: "Bedroom 3",
      locationTaskId: "task-bed3-dec",
      workPackage: "Decoration",
      wordProductDescription: "Trade Emulsion Paint Magnolia",
      wordRoomQuantity: 3,
      wordRoomUnit: "Each",
      csvProjectTotalQty: 10,
      csvProjectOrderQty: 10,
      csvProjectBudgetTotal: 380,
      roomShare: 0.3,
      allocatedOrderQty: 3,
      allocatedBudget: 114,
      unitRate: 38,
      unit: "Each",
      matchKind: "exact" as const,
    },
  ];

  const mockChecklist = [
    {
      locationTaskId: "task-bed2-dec",
      locationName: "Bedroom 2",
      workPackage: "Decoration",
    },
    {
      locationTaskId: "task-bed3-dec",
      locationName: "Bedroom 3",
      workPackage: "Decoration",
    },
  ];

  const summary = buildWeeklyBuyingList(mockAllocations, mockChecklist, [], [], []);

  assert.equal(summary.items.length, 1, "Aggregated to single material row");
  const magnolia = summary.items[0];
  assert.equal(magnolia.qtyNeeded, 5, "2 + 3 = 5 Each");
  assert.equal(magnolia.hbxlBudget, 190, "£76 + £114 = £190");
  assert.deepEqual(magnolia.neededForRooms.sort(), [
    "Bedroom 2 — Decoration",
    "Bedroom 3 — Decoration",
  ]);
});
