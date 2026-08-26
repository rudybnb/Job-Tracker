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
        if (r.productDescription) {
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
  assert.equal(weeklySummary.totalMaterialsCount, 20, "20 total physical materials (7 auto-quantified + 9 needing confirmation + 4 unpriced)");
  assert.equal(weeklySummary.pricedMaterialsCount, 7, "7 auto-quantified priced materials");
  assert.equal(weeklySummary.needsConfirmationCount, 9, "9 priced physical materials needing confirmation");
  assert.equal(weeklySummary.unpricedMaterialsCount, 4, "4 genuinely unpriced/ambiguous materials");
  assert.equal(weeklySummary.remainingMaterialsCount, 20, "All 20 remain to buy");

  // Verify Solid Wood Flooring allowance token and Sundry Materials (£) are excluded from physical weekly buying
  assert.equal(
    weeklySummary.items.some((i) => i.description.toLowerCase() === "solid wood flooring"),
    false,
    "Solid Wood Flooring allowance token must NOT appear in physical Weekly Buying"
  );
  assert.equal(
    weeklySummary.items.some((i) => i.description.toLowerCase().includes("sundry materials")),
    false,
    "Sundry Materials (£) must NOT appear in physical Weekly Buying"
  );

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

test("Maureen NEXT WEEK: 2 scheduled packages, £169.06 planned spend, 8 physical materials in scope", () => {
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
  assert.equal(weeklySummary.totalMaterialsCount, 8, "8 total materials (2 auto-quantified + 5 needing confirmation + 1 unpriced)");
  assert.equal(weeklySummary.pricedMaterialsCount, 2, "2 priced materials");
  assert.equal(weeklySummary.needsConfirmationCount, 5, "5 priced materials needing confirmation");
  assert.equal(weeklySummary.unpricedMaterialsCount, 1, "1 unpriced material (Threshold Door Bar)");
  assert.equal(weeklySummary.remainingMaterialsCount, 8);
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

// ─── 5. Manual Quantity Confirmation Priority Tests ───────────────────────────

test("Quantity confirmation priority: Priority 1 (Word auto-quantified), Priority 2 (Confirmed missing-qty), Priority 3 (Unconfirmed priced missing-qty -> CONFIRM QTY), Priority 4 (Unpriced/Ambiguous -> PRICE NEEDED)", () => {
  const mockAllocations = [
    {
      locationId: "loc-1",
      locationName: "Living Room",
      locationTaskId: "task-1",
      workPackage: "Fire Door",
      wordProductDescription: "Fire Door 30 Min",
      wordRoomQuantity: 1,
      wordRoomUnit: "Each",
      csvProjectTotalQty: 5,
      csvProjectOrderQty: 5,
      csvProjectBudgetTotal: 500,
      roomShare: 0.2,
      allocatedOrderQty: 1,
      allocatedBudget: 100,
      unitRate: 100,
      unit: "Each",
      matchKind: "exact" as const,
    },
  ];

  const mockChecklist = [
    {
      locationTaskId: "task-1",
      locationName: "Living Room",
      workPackage: "Fire Door",
      structuredResources: [
        {
          id: "r1",
          locationTaskId: "task-1",
          usageDescription: "Fire Door 30 Min",
          productDescription: "Fire Door 30 Min",
          quantity: "1.00",
          unit: "Each",
          sourceValueRaw: "1",
          sourceValueKind: "quantity" as const,
          sourceOrder: 1,
        },
        {
          id: "r2",
          locationTaskId: "task-1",
          usageDescription: "Undercoat White 5L",
          productDescription: "Undercoat White 5L",
          quantity: null,
          unit: null,
          sourceValueRaw: null,
          sourceValueKind: "blank" as const,
          sourceOrder: 2,
        },
        {
          id: "r3",
          locationTaskId: "task-1",
          usageDescription: "Satinwood Paint",
          productDescription: "Satinwood Paint",
          quantity: null,
          unit: null,
          sourceValueRaw: null,
          sourceValueKind: "blank" as const,
          sourceOrder: 3,
        },
        {
          id: "r4",
          locationTaskId: "task-1",
          usageDescription: "Bespoke Antique Brass Hinges",
          productDescription: "Bespoke Antique Brass Hinges",
          quantity: null,
          unit: null,
          sourceValueRaw: null,
          sourceValueKind: "blank" as const,
          sourceOrder: 4,
        },
      ],
    },
  ];

  const mockMatches: ProductMatch[] = [
    {
      wordProductDescription: "Fire Door 30 Min",
      matchedCsvDescription: "Fire Door 30 Min",
      kind: "exact",
      csvRow: {
        buildPhase: "Joinery",
        description: "Fire Door 30 Min",
        unitRate: 100,
        unit: "Each",
        qtyExcludingWastage: 5,
        wastageQty: 0,
        orderQtyIncludingWastage: 5,
        costExcludingWastage: 500,
        wastageCost: 0,
        totalCostIncludingWastage: 500,
      },
      similarityScore: 1.0,
      allocatedWordOccurrences: 1,
      totalWordOccurrences: 1,
    },
    {
      wordProductDescription: "Undercoat White 5L",
      matchedCsvDescription: "Undercoat White 5 Litre",
      kind: "exact",
      csvRow: {
        buildPhase: "Decoration",
        description: "Undercoat White 5 Litre",
        unitRate: 38.00,
        unit: "Each",
        qtyExcludingWastage: 2,
        wastageQty: 0,
        orderQtyIncludingWastage: 2,
        costExcludingWastage: 76,
        wastageCost: 0,
        totalCostIncludingWastage: 76,
      },
      similarityScore: 0.95,
      allocatedWordOccurrences: 0,
      totalWordOccurrences: 0,
    },
    {
      wordProductDescription: "Satinwood Paint",
      matchedCsvDescription: "Satinwood Pure Brilliant White 2.5L",
      kind: "exact",
      csvRow: {
        buildPhase: "Decoration",
        description: "Satinwood Pure Brilliant White 2.5L",
        unitRate: 25.00,
        unit: "Each",
        qtyExcludingWastage: 3,
        wastageQty: 0,
        orderQtyIncludingWastage: 3,
        costExcludingWastage: 75,
        wastageCost: 0,
        totalCostIncludingWastage: 75,
      },
      similarityScore: 0.9,
      allocatedWordOccurrences: 0,
      totalWordOccurrences: 0,
    },
    {
      wordProductDescription: "Bespoke Antique Brass Hinges",
      matchedCsvDescription: null,
      kind: "no_match",
      csvRow: null,
      similarityScore: 0,
      allocatedWordOccurrences: 0,
      totalWordOccurrences: 0,
    },
  ];

  const mockConfirmations = [
    {
      id: "conf-1",
      jobId: "job-1",
      locationTaskId: "task-1",
      materialKey: normalizeProductDescription("Undercoat White 5 Litre"),
      materialDescription: "Undercoat White 5 Litre",
      confirmedQuantity: "1.0000",
      unit: "Each",
      confirmedBy: "admin",
      confirmedAt: new Date().toISOString(),
    },
  ];

  const summary = buildWeeklyBuyingList(
    mockAllocations,
    mockChecklist,
    mockMatches,
    [],
    [],
    mockConfirmations
  );

  // Priority 1: Fire Door (Word auto-quantified) -> £100.00
  const fireDoor = summary.items.find((i) => i.description.includes("Fire Door"))!;
  assert.equal(fireDoor.qtyNeeded, 1.00);
  assert.equal(fireDoor.hbxlBudget, 100.00);
  assert.equal(fireDoor.isPriced, true);
  assert.equal(fireDoor.needsConfirmation, false);
  assert.equal(fireDoor.quantityConfirmed, false);

  // Priority 2: Undercoat White 5L (Missing Word qty + Confirmed 1 Each @ £38.00)
  const undercoat = summary.items.find((i) => i.description.includes("Undercoat White"))!;
  assert.equal(undercoat.qtyNeeded, 1.00);
  assert.equal(undercoat.hbxlBudget, 38.00);
  assert.equal(undercoat.isPriced, true);
  assert.equal(undercoat.needsConfirmation, false);
  assert.equal(undercoat.quantityConfirmed, true);
  assert.equal(undercoat.stillToBuyQty, 1.00);
  assert.equal(undercoat.stillToBuyBudget, 38.00);

  // Priority 3: Satinwood Paint (Missing Word qty + Safe priced match + No confirmation -> CONFIRM QTY)
  const satinwood = summary.items.find((i) => i.description.includes("Satinwood"))!;
  assert.equal(satinwood.isPriced, true);
  assert.equal(satinwood.needsConfirmation, true);
  assert.equal(satinwood.quantityConfirmed, false);
  assert.equal(satinwood.hbxlBudget, 0); // Pending budget is £0 until confirmed
  assert.equal(satinwood.unitRate, 25.00);

  // Priority 4: Bespoke Antique Brass Hinges (No match -> PRICE NEEDED)
  const hinges = summary.items.find((i) => i.description.includes("Brass Hinges"))!;
  assert.equal(hinges.isPriced, false);
  assert.equal(hinges.needsConfirmation, false);
  assert.equal(hinges.hbxlBudget, 0);

  // Summary planned spend includes Priority 1 (£100) + Priority 2 (£38) = £138
  assert.equal(summary.plannedSpend, 138.00);
  assert.equal(summary.remainingToBuyBudget, 138.00);
  assert.equal(summary.needsConfirmationCount, 1);
  assert.equal(summary.unpricedMaterialsCount, 1);
});

test("Updating confirmation from 1 to 2 Each updates budget from £38.00 to £76.00 and updates planned spend", () => {
  const mockAllocations = [
    {
      locationId: "loc-1",
      locationName: "Living Room",
      locationTaskId: "task-1",
      workPackage: "Decoration",
      wordProductDescription: "Magnolia Paint",
      wordRoomQuantity: 1,
      wordRoomUnit: "Each",
      csvProjectTotalQty: 5,
      csvProjectOrderQty: 5,
      csvProjectBudgetTotal: 190,
      roomShare: 0.2,
      allocatedOrderQty: 1,
      allocatedBudget: 38,
      unitRate: 38,
      unit: "Each",
      matchKind: "exact" as const,
    },
  ];

  const mockChecklist = [
    {
      locationTaskId: "task-1",
      locationName: "Living Room",
      workPackage: "Decoration",
      structuredResources: [
        {
          id: "r1",
          locationTaskId: "task-1",
          usageDescription: "Undercoat White",
          productDescription: "Undercoat White",
          quantity: null,
          unit: null,
          sourceValueRaw: null,
          sourceValueKind: "blank" as const,
          sourceOrder: 1,
        },
      ],
    },
  ];

  const mockMatches: ProductMatch[] = [
    {
      wordProductDescription: "Undercoat White",
      matchedCsvDescription: "Undercoat White 5 Litre",
      kind: "exact",
      csvRow: {
        buildPhase: "Decoration",
        description: "Undercoat White 5 Litre",
        unitRate: 38.00,
        unit: "Each",
        qtyExcludingWastage: 5,
        wastageQty: 0,
        orderQtyIncludingWastage: 5,
        costExcludingWastage: 190,
        wastageCost: 0,
        totalCostIncludingWastage: 190,
      },
      similarityScore: 1.0,
      allocatedWordOccurrences: 0,
      totalWordOccurrences: 0,
    },
  ];

  // State 1: 1 Each confirmed -> £38.00 budget
  const conf1 = [
    {
      id: "conf-1",
      jobId: "job-1",
      locationTaskId: "task-1",
      materialKey: normalizeProductDescription("Undercoat White 5 Litre"),
      materialDescription: "Undercoat White 5 Litre",
      confirmedQuantity: "1.0000",
      unit: "Each",
    },
  ];

  const summary1 = buildWeeklyBuyingList(mockAllocations, mockChecklist, mockMatches, [], [], conf1);
  const undercoat1 = summary1.items.find((i) => i.description.includes("Undercoat"))!;
  assert.equal(undercoat1.qtyNeeded, 1.00);
  assert.equal(undercoat1.hbxlBudget, 38.00);
  assert.equal(summary1.plannedSpend, 76.00); // £38 allocated + £38 confirmed

  // State 2: Edit confirmation to 2 Each -> £76.00 budget
  const conf2 = [
    {
      id: "conf-1",
      jobId: "job-1",
      locationTaskId: "task-1",
      materialKey: normalizeProductDescription("Undercoat White 5 Litre"),
      materialDescription: "Undercoat White 5 Litre",
      confirmedQuantity: "2.0000",
      unit: "Each",
    },
  ];

  const summary2 = buildWeeklyBuyingList(mockAllocations, mockChecklist, mockMatches, [], [], conf2);
  const undercoat2 = summary2.items.find((i) => i.description.includes("Undercoat"))!;
  assert.equal(undercoat2.qtyNeeded, 2.00);
  assert.equal(undercoat2.hbxlBudget, 76.00);
  assert.equal(summary2.plannedSpend, 114.00); // £38 allocated + £76 confirmed
  assert.equal(summary2.remainingToBuyBudget, 114.00);
});

test("Maureen NEXT 7 DAYS with Undercoat White confirmed (1 -> 2 Each) reflects in summary metrics", () => {
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

  const scheduledTaskIds = new Set(checklist.map((i) => i.locationTaskId));
  const allocations = allocateRoomBudgets(wordResources, productMatches, scheduledTaskIds);

  // Unconfirmed initial state
  const unconfirmedSummary = buildWeeklyBuyingList(allocations, checklist, productMatches, csvRows, []);
  assert.equal(unconfirmedSummary.plannedSpend, 436.92);
  assert.equal(unconfirmedSummary.pricedMaterialsCount, 7);
  assert.equal(unconfirmedSummary.needsConfirmationCount, 9);

  // Confirm Undercoat White: 1 Each @ £38.00
  const fireDoorTask = bed3Tasks.find((t) => t.workCategory === "Fire Door")!;
  const conf1 = [
    {
      id: "conf-1",
      jobId,
      locationTaskId: fireDoorTask.id,
      materialKey: normalizeProductDescription("Undercoat White 5 Litre"),
      materialDescription: "Undercoat White 5 Litre",
      confirmedQuantity: "1.0000",
      unit: "Each",
      confirmedBy: "admin",
    },
  ];

  const confirmedSummary1 = buildWeeklyBuyingList(allocations, checklist, productMatches, csvRows, [], conf1);
  assert.equal(confirmedSummary1.plannedSpend, 474.92); // 436.92 + 38.00 = 474.92
  assert.equal(confirmedSummary1.remainingToBuyBudget, 474.92);
  assert.equal(confirmedSummary1.pricedMaterialsCount, 8); // 7 + 1 confirmed
  assert.equal(confirmedSummary1.needsConfirmationCount, 8); // 9 - 1 confirmed

  // Update confirmation: 2 Each @ £38.00 = £76.00
  const conf2 = [
    {
      id: "conf-1",
      jobId,
      locationTaskId: fireDoorTask.id,
      materialKey: normalizeProductDescription("Undercoat White 5 Litre"),
      materialDescription: "Undercoat White 5 Litre",
      confirmedQuantity: "2.0000",
      unit: "Each",
      confirmedBy: "admin",
    },
  ];

  const confirmedSummary2 = buildWeeklyBuyingList(allocations, checklist, productMatches, csvRows, [], conf2);
  assert.equal(confirmedSummary2.plannedSpend, 512.92); // 436.92 + 76.00 = 512.92
  assert.equal(confirmedSummary2.remainingToBuyBudget, 512.92);
  assert.equal(confirmedSummary2.pricedMaterialsCount, 8);
  assert.equal(confirmedSummary2.needsConfirmationCount, 8);
});


