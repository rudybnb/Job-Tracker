import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProcurementCostPlan } from "../shared/procurement-cost-plan.ts";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("builds separate procurement sections from retained Smart Schedule resources", () => {
  const plan = buildProcurementCostPlan(JSON.stringify({
    resources: [
      {
        resourceType: "Material",
        resourceDescriptionWithoutPrice: "Trade Emulsion Paint Brilliant White 5L",
        quantity: 10,
        unit: "Each",
        unitPrice: 23.3,
        totalCost: 233,
        supplier: "HBXL Price Tracker+",
        productCode: "HB00114",
        requiredDate: "07/09/2026",
        buildPhase: "Internal Decoration",
      },
      { resourceType: "Plant", resourceDescriptionWithoutPrice: "Skip - 6 Yard", quantity: 1, unit: "Each", unitPrice: 265, totalCost: 265 },
      { resourceType: "Subcontractors", resourceDescriptionWithoutPrice: "Scaffold", quantity: 1, unit: "Item", unitPrice: 500, totalCost: 500 },
      { resourceType: "Labour", resourceDescriptionWithoutPrice: "Decorator", quantity: 8, unit: "Hours", unitPrice: 29, totalCost: 232 },
      { resourceType: "Material", resourceDescriptionWithoutPrice: "Zero quantity option", quantity: 0, unit: "Each", unitPrice: 10, totalCost: 0 },
    ],
  }));

  assert.equal(plan.materials.lines.length, 1);
  assert.equal(plan.materials.lines[0].description, "Trade Emulsion Paint Brilliant White 5L");
  assert.equal(plan.materials.lines[0].budgetRate, 23.3);
  assert.equal(plan.materials.lines[0].budgetTotal, 233);
  assert.equal(plan.materials.lines[0].supplier, "HBXL Price Tracker+");
  assert.equal(plan.materials.lines[0].productCode, "HB00114");
  assert.equal(plan.materials.lines[0].requiredDate, "07/09/2026");
  assert.equal(plan.materials.lines[0].phase, "Internal Decoration");
  assert.equal(plan.plant.total, 265);
  assert.equal(plan.subcontractors.total, 500);
  assert.equal(plan.labour.total, 232);
  assert.equal(plan.totalEstimatedCost, 1230);
});

test("Maureen procurement section totals reconcile to Smart Schedule commercial summary", () => {
  const plan = buildProcurementCostPlan({
    resources: [
      { resourceType: "Labour", totalCost: 17537, quantity: 1, unitPrice: 17537, resourceDescriptionWithoutPrice: "Labour plan" },
      { resourceType: "Material", totalCost: 14794.22, quantity: 1, unitPrice: 14794.22, resourceDescriptionWithoutPrice: "Materials plan" },
      { resourceType: "Plant", totalCost: 1820, quantity: 1, unitPrice: 1820, resourceDescriptionWithoutPrice: "Plant plan" },
      { resourceType: "Subcontractors", totalCost: 15450, quantity: 1, unitPrice: 15450, resourceDescriptionWithoutPrice: "Subcontractor plan" },
    ],
  });

  assert.equal(plan.labour.total, 17537);
  assert.equal(plan.materials.total, 14794.22);
  assert.equal(plan.plant.total, 1820);
  assert.equal(plan.subcontractors.total, 15450);
  assert.equal(plan.totalEstimatedCost, 49601.22);
});

test("budget tracking procurement UI uses tabs and budget wording", () => {
  const source = readFileSync(path.join(repoRoot, "client", "src", "pages", "admin-budget-tracking.tsx"), "utf8");

  assert.match(source, /MATERIALS/);
  assert.match(source, /LABOUR/);
  assert.match(source, /PLANT \/ HIRE/);
  assert.match(source, /SUBCONTRACTORS/);
  assert.match(source, /Budget Rate/);
  assert.match(source, /Budget Total/);
  assert.doesNotMatch(source, /Purchase Price/i);
});
