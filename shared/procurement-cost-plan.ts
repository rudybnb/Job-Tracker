import { parseCurrencyAmount } from "./job-upload-import";

export type ProcurementSectionKey = "materials" | "plant" | "subcontractors" | "labour";

export interface ProcurementCostPlanLine {
  description: string;
  quantity: number;
  unit: string;
  budgetRate: number;
  budgetTotal: number;
  supplier: string;
  productCode: string;
  requiredDate: string;
  orderDate: string;
  phase: string;
}

export interface ProcurementCostPlanSection {
  key: ProcurementSectionKey;
  title: string;
  total: number;
  lines: ProcurementCostPlanLine[];
}

export interface ProcurementCostPlan {
  materials: ProcurementCostPlanSection;
  plant: ProcurementCostPlanSection;
  subcontractors: ProcurementCostPlanSection;
  labour: ProcurementCostPlanSection;
  totalEstimatedCost: number;
}

const SECTION_TITLES: Record<ProcurementSectionKey, string> = {
  materials: "Materials To Buy",
  plant: "Plant / Hire",
  subcontractors: "Subcontractors",
  labour: "Labour Cost Plan",
};

export function buildProcurementCostPlan(phaseTaskData: unknown): ProcurementCostPlan {
  const parsed = parsePhaseTaskData(phaseTaskData);
  const resources = Array.isArray(parsed.resources) ? parsed.resources : [];
  const sections: Record<ProcurementSectionKey, ProcurementCostPlanSection> = {
    materials: emptySection("materials"),
    plant: emptySection("plant"),
    subcontractors: emptySection("subcontractors"),
    labour: emptySection("labour"),
  };

  for (const resource of resources) {
    if (!isRecord(resource)) continue;
    const sectionKey = procurementSectionForResourceType(resource.resourceType);
    if (!sectionKey) continue;

    const budgetTotal = money(resource.totalCost);
    const quantity = numberValue(resource.quantity);
    if (budgetTotal === 0 && quantity === 0) continue;

    sections[sectionKey].lines.push({
      description: text(resource.resourceDescriptionWithoutPrice) || text(resource.descriptionWithoutPrice) || text(resource.resourceDescription) || text(resource.description) || "Unnamed resource",
      quantity,
      unit: text(resource.unit) || "Each",
      budgetRate: money(resource.unitPrice),
      budgetTotal,
      supplier: text(resource.supplier),
      productCode: text(resource.productCode),
      requiredDate: text(resource.requiredDate),
      orderDate: text(resource.orderDate),
      phase: text(resource.buildPhase) || text(resource.phase),
    });
  }

  for (const section of Object.values(sections)) {
    section.total = roundMoney(section.lines.reduce((sum, line) => sum + line.budgetTotal, 0));
  }

  return {
    ...sections,
    totalEstimatedCost: roundMoney(sections.materials.total + sections.plant.total + sections.subcontractors.total + sections.labour.total),
  };
}

function emptySection(key: ProcurementSectionKey): ProcurementCostPlanSection {
  return { key, title: SECTION_TITLES[key], total: 0, lines: [] };
}

function parsePhaseTaskData(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function procurementSectionForResourceType(resourceType: unknown): ProcurementSectionKey | null {
  const normalized = text(resourceType).toLowerCase().replace(/[\s_-]+/g, " ").trim();
  if (/\blabou?r\b/.test(normalized)) return "labour";
  if (/\bmaterials?\b/.test(normalized)) return "materials";
  if (/\bplant\b/.test(normalized)) return "plant";
  if (/\bsub\s*contract(or|ors)?\b|\bsubcontract(or|ors)?\b/.test(normalized)) return "subcontractors";
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const amount = Number.parseFloat(value);
    return Number.isFinite(amount) ? amount : 0;
  }
  return 0;
}

function money(value: unknown): number {
  return roundMoney(parseCurrencyAmount(value) ?? 0);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
