import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWeeklyBuyingList,
  normalizeProductDescription,
  type ProductMatch,
  type MaterialsUsedRow,
} from "../shared/procurement-pricing.ts";

// ─── 1. Quantity Priority Contract Tests ──────────────────────────────────────

test("Reliable Word quantity ALWAYS wins over manual confirmation (Word immutable evidence precedence)", () => {
  // Scenario: Word quote says Bedroom 3 Fire Door needs 1.00 Each @ £126.00
  // Even if a stale or rogue confirmation row exists with quantity 10.00:
  // The system must ALWAYS respect the reliable Word quote allocation.

  const mockAllocations = [
    {
      locationId: "loc-bed3",
      locationName: "Second Floor Bedroom 3",
      locationTaskId: "task-bed3-firedoor",
      workPackage: "Fire Door",
      wordProductDescription: "Internal Fire Door FD30 6 Panel Smooth",
      wordRoomQuantity: 1,
      wordRoomUnit: "Each",
      csvProjectTotalQty: 3,
      csvProjectOrderQty: 3,
      csvProjectBudgetTotal: 378,
      roomShare: 0.3333,
      allocatedOrderQty: 1,
      allocatedBudget: 126,
      unitRate: 126,
      unit: "Each",
      matchKind: "exact" as const,
    },
  ];

  const mockChecklist = [
    {
      locationTaskId: "task-bed3-firedoor",
      locationName: "Second Floor Bedroom 3",
      workPackage: "Fire Door",
      structuredResources: [
        {
          id: "r1",
          locationTaskId: "task-bed3-firedoor",
          usageDescription: "Internal Fire Door FD30",
          productDescription: "Internal Fire Door FD30 6 Panel Smooth",
          quantity: "1.00",
          unit: "Each",
          sourceValueRaw: "1",
          sourceValueKind: "quantity" as const,
          sourceOrder: 1,
        },
      ],
    },
  ];

  const mockMatches: ProductMatch[] = [
    {
      wordProductDescription: "Internal Fire Door FD30 6 Panel Smooth",
      matchedCsvDescription: "Internal Fire Door FD30 6 Panel Smooth 838 x 1981mm",
      kind: "exact",
      csvRow: {
        buildPhase: "Doors",
        description: "Internal Fire Door FD30 6 Panel Smooth 838 x 1981mm",
        unitRate: 126,
        unit: "Each",
        qtyExcludingWastage: 3,
        wastageQty: 0,
        orderQtyIncludingWastage: 3,
        costExcludingWastage: 378,
        wastageCost: 0,
        totalCostIncludingWastage: 378,
      },
      similarityScore: 1.0,
      allocatedWordOccurrences: 1,
      totalWordOccurrences: 1,
    },
  ];

  const rogueConfirmation = [
    {
      id: "conf-rogue",
      jobId: "maureen-job",
      locationTaskId: "task-bed3-firedoor",
      materialKey: normalizeProductDescription("Internal Fire Door FD30 6 Panel Smooth 838 x 1981mm"),
      materialDescription: "Internal Fire Door FD30 6 Panel Smooth 838 x 1981mm",
      confirmedQuantity: "10.0000", // Rogue quantity that should NOT override Word quote
      unit: "Each",
      confirmedBy: "someone",
      confirmedAt: new Date().toISOString(),
    },
  ];

  const summary = buildWeeklyBuyingList(
    mockAllocations,
    mockChecklist,
    mockMatches,
    [],
    [],
    rogueConfirmation
  );

  assert.equal(summary.items.length, 1);
  const item = summary.items[0];

  // Priority 1 verification:
  assert.equal(item.qtyNeeded, 1.00, "Reliable Word quantity 1.00 wins over rogue confirmation 10.00");
  assert.equal(item.hbxlBudget, 126.00, "Budget is £126.00 (NOT £1,260.00)");
  assert.equal(item.needsConfirmation, false, "Not needing confirmation");
  assert.equal(item.quantityConfirmed, false, "Marked as auto-allocated from Word, not manual confirmed");
  assert.equal(summary.plannedSpend, 126.00);
});

// ─── 2. Server Deterministic Key Normalization ─────────────────────────────────

test("Server deterministic key normalization matches product description without client tampering", () => {
  const desc1 = "Undercoat White 5 Litre";
  const desc2 = "  UNDERCOAT   WHITE   5 LITRE  ";
  const desc3 = "Undercoat White";

  const key1 = normalizeProductDescription(desc1).trim().toLowerCase();
  const key2 = normalizeProductDescription(desc2).trim().toLowerCase();
  const key3 = normalizeProductDescription(desc3).trim().toLowerCase();

  assert.equal(key1, key2, "Whitespace and case normalized deterministically");
  assert.ok(key1.length > 0);
  assert.ok(key3.length > 0);
});

// ─── 3. Multi-Tier Quantity Priority Full Matrix ──────────────────────────────

test("Full 4-tier matrix: Priority 1 (Word), Priority 2 (Confirmed), Priority 3 (Unconfirmed Priced), Priority 4 (Unpriced)", () => {
  const mockAllocations = [
    {
      locationId: "loc-1",
      locationName: "Room A",
      locationTaskId: "task-1",
      workPackage: "Package 1",
      wordProductDescription: "Word Auto Material",
      wordRoomQuantity: 4,
      wordRoomUnit: "m",
      csvProjectTotalQty: 10,
      csvProjectOrderQty: 10,
      csvProjectBudgetTotal: 100,
      roomShare: 0.4,
      allocatedOrderQty: 4,
      allocatedBudget: 40,
      unitRate: 10,
      unit: "m",
      matchKind: "exact" as const,
    },
  ];

  const mockChecklist = [
    {
      locationTaskId: "task-1",
      locationName: "Room A",
      workPackage: "Package 1",
      structuredResources: [
        {
          id: "r1",
          locationTaskId: "task-1",
          usageDescription: "Word Auto Material",
          productDescription: "Word Auto Material",
          quantity: "4.00",
          unit: "m",
          sourceValueRaw: "4",
          sourceValueKind: "quantity" as const,
          sourceOrder: 1,
        },
        {
          id: "r2",
          locationTaskId: "task-1",
          usageDescription: "Manual Confirmed Material",
          productDescription: "Manual Confirmed Material",
          quantity: null,
          unit: null,
          sourceValueRaw: null,
          sourceValueKind: "blank" as const,
          sourceOrder: 2,
        },
        {
          id: "r3",
          locationTaskId: "task-1",
          usageDescription: "Unconfirmed Priced Material",
          productDescription: "Unconfirmed Priced Material",
          quantity: null,
          unit: null,
          sourceValueRaw: null,
          sourceValueKind: "blank" as const,
          sourceOrder: 3,
        },
        {
          id: "r4",
          locationTaskId: "task-1",
          usageDescription: "Genuinely Unpriced Material",
          productDescription: "Genuinely Unpriced Material",
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
      wordProductDescription: "Word Auto Material",
      matchedCsvDescription: "Word Auto Material",
      kind: "exact",
      csvRow: {
        buildPhase: "Phase 1",
        description: "Word Auto Material",
        unitRate: 10,
        unit: "m",
        qtyExcludingWastage: 10,
        wastageQty: 0,
        orderQtyIncludingWastage: 10,
        costExcludingWastage: 100,
        wastageCost: 0,
        totalCostIncludingWastage: 100,
      },
      similarityScore: 1.0,
      allocatedWordOccurrences: 1,
      totalWordOccurrences: 1,
    },
    {
      wordProductDescription: "Manual Confirmed Material",
      matchedCsvDescription: "Manual Confirmed Material",
      kind: "exact",
      csvRow: {
        buildPhase: "Phase 1",
        description: "Manual Confirmed Material",
        unitRate: 20,
        unit: "Each",
        qtyExcludingWastage: 5,
        wastageQty: 0,
        orderQtyIncludingWastage: 5,
        costExcludingWastage: 100,
        wastageCost: 0,
        totalCostIncludingWastage: 100,
      },
      similarityScore: 1.0,
      allocatedWordOccurrences: 0,
      totalWordOccurrences: 0,
    },
    {
      wordProductDescription: "Unconfirmed Priced Material",
      matchedCsvDescription: "Unconfirmed Priced Material",
      kind: "exact",
      csvRow: {
        buildPhase: "Phase 1",
        description: "Unconfirmed Priced Material",
        unitRate: 15,
        unit: "Each",
        qtyExcludingWastage: 2,
        wastageQty: 0,
        orderQtyIncludingWastage: 2,
        costExcludingWastage: 30,
        wastageCost: 0,
        totalCostIncludingWastage: 30,
      },
      similarityScore: 1.0,
      allocatedWordOccurrences: 0,
      totalWordOccurrences: 0,
    },
    {
      wordProductDescription: "Genuinely Unpriced Material",
      matchedCsvDescription: null,
      kind: "no_match",
      csvRow: null,
      similarityScore: 0,
      allocatedWordOccurrences: 0,
      totalWordOccurrences: 0,
    },
  ];

  const confirmations = [
    {
      id: "conf-2",
      jobId: "job-1",
      locationTaskId: "task-1",
      materialKey: normalizeProductDescription("Manual Confirmed Material"),
      materialDescription: "Manual Confirmed Material",
      confirmedQuantity: "2.0000",
      unit: "Each",
      confirmedBy: "admin-1",
    },
  ];

  const summary = buildWeeklyBuyingList(
    mockAllocations,
    mockChecklist,
    mockMatches,
    [],
    [],
    confirmations
  );

  assert.equal(summary.totalMaterialsCount, 4);

  // P1: Word Auto
  const p1 = summary.items.find(i => i.description === "Word Auto Material")!;
  assert.equal(p1.qtyNeeded, 4);
  assert.equal(p1.hbxlBudget, 40);
  assert.equal(p1.isPriced, true);
  assert.equal(p1.needsConfirmation, false);
  assert.equal(p1.quantityConfirmed, false);

  // P2: Manual Confirmed
  const p2 = summary.items.find(i => i.description === "Manual Confirmed Material")!;
  assert.equal(p2.qtyNeeded, 2);
  assert.equal(p2.hbxlBudget, 40); // 2 * £20 = £40
  assert.equal(p2.isPriced, true);
  assert.equal(p2.needsConfirmation, false);
  assert.equal(p2.quantityConfirmed, true);

  // P3: Unconfirmed Priced
  const p3 = summary.items.find(i => i.description === "Unconfirmed Priced Material")!;
  assert.equal(p3.isPriced, true);
  assert.equal(p3.needsConfirmation, true);
  assert.equal(p3.hbxlBudget, 0); // £0 pending
  assert.equal(p3.unitRate, 15);

  // P4: Unpriced
  const p4 = summary.items.find(i => i.description === "Genuinely Unpriced Material")!;
  assert.equal(p4.isPriced, false);
  assert.equal(p4.needsConfirmation, false);
  assert.equal(p4.hbxlBudget, 0);

  // Total Planned Spend: £40 (P1) + £40 (P2) = £80
  assert.equal(summary.plannedSpend, 80);
  assert.equal(summary.remainingToBuyBudget, 80);
  assert.equal(summary.pricedMaterialsCount, 2);
  assert.equal(summary.needsConfirmationCount, 1);
  assert.equal(summary.unpricedMaterialsCount, 1);
});
