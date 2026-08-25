import type { ProcurementStructuredResource } from "./weekly-procurement";

// ─── CSV Row (Materials Used export) ───────────────────────────────────────

export interface MaterialsUsedRow {
  buildPhase: string;
  description: string;
  unitRate: number;
  unit: string;
  qtyExcludingWastage: number;
  wastageQty: number;
  orderQtyIncludingWastage: number;
  costExcludingWastage: number;
  wastageCost: number;
  totalCostIncludingWastage: number;
}

// ─── Allowance / Provisional Classification ─────────────────────────────────

export type MaterialRowKind = "genuine" | "allowance" | "provisional";

export interface ClassifiedMaterialRow extends MaterialsUsedRow {
  kind: MaterialRowKind;
}

// ─── Matching ───────────────────────────────────────────────────────────────

export type ProductMatchKind = "exact" | "safe_normalized" | "ambiguous" | "no_match";

export interface ProductMatch {
  wordProductDescription: string;
  csvDescription: string;
  kind: ProductMatchKind;
  csvRow: MaterialsUsedRow | null;
}

// ─── Room Allocation ────────────────────────────────────────────────────────

export interface RoomAllocatedProduct {
  locationId: string;
  locationName: string;
  locationTaskId: string;
  workPackage: string;
  wordProductDescription: string;
  wordRoomQuantity: number;
  wordRoomUnit: string;
  csvProjectTotalQty: number;
  csvProjectOrderQty: number;
  csvProjectBudgetTotal: number;
  roomShare: number;
  allocatedOrderQty: number;
  allocatedBudget: number;
  unitRate: number;
  unit: string;
  matchKind: "exact" | "safe_normalized";
}

// ─── Weekly Summary ─────────────────────────────────────────────────────────

export interface WeeklyPricedBudget {
  pricedItems: RoomAllocatedProduct[];
  pricedTotal: number;
  unpricedCount: number;
  allowanceBudgetTotal: number;
  provisionalBudgetTotal: number;
}

// ─── CSV Parsing ────────────────────────────────────────────────────────────

function parseMoney(value: string): number {
  const cleaned = value.replace(/[£",]/g, "").trim();
  if (!cleaned) return 0;
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function parseNumber(value: string): number {
  const cleaned = value.replace(/[",]/g, "").trim();
  if (!cleaned) return 0;
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Parse the HBXL "Materials Used" CSV (Latin-1 encoded).
 * Column layout (0-indexed):
 *   0  Build Phase
 *   5  Unit Rate (with £)
 *   8  Unit
 *   9  Qty excluding wastage
 *  10  Wastage quantity
 *  11  Order qty including wastage
 *  12  Cost excluding wastage
 *  13  Wastage cost
 *  14  Total cost including wastage
 *
 * NOTE: Some cells contain quoted commas (e.g. "£2,067.33") which split into
 * multiple comma-separated fragments. We must handle this.
 */
export function parseMaterialsUsedCsv(csvContent: string): MaterialsUsedRow[] {
  const lines = csvContent.split(/\r?\n/).filter((line) => line.trim());
  const dataLines = lines.slice(2).filter((line) => !line.startsWith("Grand Total") && line.trim());

  const rows: MaterialsUsedRow[] = [];
  for (const line of dataLines) {
    const description = extractColumn(line, 2);
    if (!description) continue;

    rows.push({
      buildPhase: extractColumn(line, 0),
      description,
      unitRate: parseMoney(extractColumn(line, 5)),
      unit: extractColumn(line, 8),
      qtyExcludingWastage: parseNumber(extractColumn(line, 9)),
      wastageQty: parseNumber(extractColumn(line, 10)),
      orderQtyIncludingWastage: parseNumber(extractColumn(line, 11)),
      costExcludingWastage: parseMoney(extractColumn(line, 12)),
      wastageCost: parseMoney(extractColumn(line, 13)),
      totalCostIncludingWastage: parseMoney(extractColumn(line, 14)),
    });
  }
  return rows;
}

/**
 * Extract a column value from a CSV line, handling quoted commas.
 * The HBXL CSV wraps some values in double quotes when they contain commas
 * (e.g. "£2,067.33"). We must not split those.
 */
function extractColumn(line: string, targetIndex: number): string {
  let idx = 0;
  let i = 0;
  while (i < line.length && idx < targetIndex) {
    if (line[i] === '"') {
      i++;
      while (i < line.length && line[i] !== '"') i++;
      i++; // skip closing quote
    }
    if (line[i] === ",") {
      idx++;
    }
    i++;
  }
  // Now extract the value at idx
  let start = i;
  if (i < line.length && line[i] === '"') {
    i++;
    start = i;
    while (i < line.length && line[i] !== '"') i++;
    return line.slice(start, i);
  }
  let end = i;
  while (end < line.length && line[end] !== ",") end++;
  return line.slice(start, end);
}

// ─── Classification ─────────────────────────────────────────────────────────

export function classifyMaterialRow(row: MaterialsUsedRow): MaterialRowKind {
  const desc = row.description.toLowerCase();
  if (desc.startsWith("provisional")) return "provisional";
  if (desc.startsWith("allowance for")) return "allowance";
  return "genuine";
}

export function classifyAllRows(rows: MaterialsUsedRow[]): ClassifiedMaterialRow[] {
  return rows.map((row) => ({ ...row, kind: classifyMaterialRow(row) }));
}

// ─── Product Normalization ──────────────────────────────────────────────────

/** Strip dimensions, sizes, pack sizes — keep core product name for matching. */
export function normalizeProductDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/\d+(\.\d+)?\s*x\s*\d+(\.\d+)?\s*(mm²|m²|cm²|mm|m|cm)?/gi, "")
    .replace(/\d+(\.\d+)?\s*(mm²|m²|cm²)/gi, "")
    .replace(/\d+(\.\d+)?\s*(mm|m|cm|kg|litre|l|each|pairs?|weeks?|hours?)\b/gi, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Matching ───────────────────────────────────────────────────────────────

export function matchWordProductsToCsv(
  wordProductDescriptions: string[],
  csvRows: MaterialsUsedRow[],
): ProductMatch[] {
  const csvByNormalized = new Map<string, MaterialsUsedRow[]>();
  const csvByExact = new Map<string, MaterialsUsedRow>();

  for (const row of csvRows) {
    csvByExact.set(row.description.toLowerCase().trim(), row);
    const norm = normalizeProductDescription(row.description);
    const list = csvByNormalized.get(norm) ?? [];
    list.push(row);
    csvByNormalized.set(norm, list);
  }

  const seen = new Set<string>();
  const results: ProductMatch[] = [];

  for (const wordDesc of wordProductDescriptions) {
    const key = wordDesc.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);

    // 1. Exact match
    const exactRow = csvByExact.get(key);
    if (exactRow) {
      results.push({ wordProductDescription: wordDesc, csvDescription: exactRow.description, kind: "exact", csvRow: exactRow });
      continue;
    }

    // 2. Normalized match
    const wordNorm = normalizeProductDescription(wordDesc);
    const normalizedMatches = csvByNormalized.get(wordNorm);
    if (normalizedMatches) {
      if (normalizedMatches.length === 1) {
        results.push({ wordProductDescription: wordDesc, csvDescription: normalizedMatches[0].description, kind: "safe_normalized", csvRow: normalizedMatches[0] });
      } else {
        results.push({ wordProductDescription: wordDesc, csvDescription: normalizedMatches.map((r) => r.description).join(" | "), kind: "ambiguous", csvRow: null });
      }
      continue;
    }

    // 3. No match
    results.push({ wordProductDescription: wordDesc, csvDescription: "", kind: "no_match", csvRow: null });
  }

  return results;
}

// ─── Proportional Room Allocation ───────────────────────────────────────────

/**
 * For each scheduled room/work-package resource, compute the proportional
 * share of the project-level CSV budget total.
 *
 * ALLOCATED_BUDGET = CSV project total × (room word qty / total word qty across all rooms)
 *
 * This preserves the single project-level CSV total with only penny rounding.
 */
export function allocateRoomBudgets(
  structuredResources: ProcurementStructuredResource[],
  productMatches: ProductMatch[],
  scheduledLocationTaskIds: Set<string>,
): RoomAllocatedProduct[] {
  const matchByWordDesc = new Map<string, ProductMatch>();
  for (const m of productMatches) {
    matchByWordDesc.set(m.wordProductDescription.toLowerCase().trim(), m);
  }

  // Group resources by product description across ALL rooms
  const productTotals = new Map<string, { totalQty: number; byTask: Map<string, { qty: number; resource: ProcurementStructuredResource }> }>();

  for (const resource of structuredResources) {
    if (resource.sourceValueKind !== "quantity" || !resource.quantity || !resource.unit) continue;
    const key = resource.productDescription.toLowerCase().trim();
    const match = matchByWordDesc.get(key);
    if (!match || !match.csvRow) continue;
    if (match.kind !== "exact" && match.kind !== "safe_normalized") continue;

    let product = productTotals.get(key);
    if (!product) {
      product = { totalQty: 0, byTask: new Map() };
      productTotals.set(key, product);
    }

    const qty = parseFloat(resource.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    product.totalQty += qty;
    const existing = product.byTask.get(resource.locationTaskId);
    if (existing) {
      existing.qty += qty;
    } else {
      product.byTask.set(resource.locationTaskId, { qty, resource });
    }
  }

  // Allocate to scheduled tasks
  const allocations: RoomAllocatedProduct[] = [];

  for (const [productKey, product] of productTotals) {
    const match = matchByWordDesc.get(productKey)!;
    if (!match.csvRow || product.totalQty <= 0) continue;

    for (const [taskId, entry] of product.byTask) {
      if (!scheduledLocationTaskIds.has(taskId)) continue;

      const roomShare = entry.qty / product.totalQty;
      const allocatedOrderQty = Math.round(match.csvRow.orderQtyIncludingWastage * roomShare * 100) / 100;
      const allocatedBudget = Math.round(match.csvRow.totalCostIncludingWastage * roomShare * 100) / 100;

      allocations.push({
        locationId: entry.resource.locationTaskId,
        locationName: "",
        locationTaskId: taskId,
        workPackage: "",
        wordProductDescription: match.wordProductDescription,
        wordRoomQuantity: entry.qty,
        wordRoomUnit: entry.resource.unit ?? "",
        csvProjectTotalQty: product.totalQty,
        csvProjectOrderQty: match.csvRow.orderQtyIncludingWastage,
        csvProjectBudgetTotal: match.csvRow.totalCostIncludingWastage,
        roomShare,
        allocatedOrderQty,
        allocatedBudget,
        unitRate: match.csvRow.unitRate,
        unit: match.csvRow.unit,
        matchKind: match.kind === "exact" ? "exact" : "safe_normalized",
      });
    }
  }

  return allocations;
}

// ─── Weekly Budget Assembly ─────────────────────────────────────────────────

export function buildWeeklyPricedBudget(
  allocations: RoomAllocatedProduct[],
  allProductMatches: ProductMatch[],
  classifiedCsvRows: ClassifiedMaterialRow[],
): WeeklyPricedBudget {
  const pricedTotal = allocations.reduce((sum, a) => sum + a.allocatedBudget, 0);

  const unpricedCount = allProductMatches.filter((m) => m.kind === "ambiguous" || m.kind === "no_match").length;

  const allowanceBudgetTotal = classifiedCsvRows
    .filter((r) => r.kind === "allowance")
    .reduce((sum, r) => sum + r.totalCostIncludingWastage, 0);

  const provisionalBudgetTotal = classifiedCsvRows
    .filter((r) => r.kind === "provisional")
    .reduce((sum, r) => sum + r.totalCostIncludingWastage, 0);

  return {
    pricedItems: allocations.sort((a, b) => b.allocatedBudget - a.allocatedBudget),
    pricedTotal: Math.round(pricedTotal * 100) / 100,
    unpricedCount,
    allowanceBudgetTotal: Math.round(allowanceBudgetTotal * 100) / 100,
    provisionalBudgetTotal: Math.round(provisionalBudgetTotal * 100) / 100,
  };
}
