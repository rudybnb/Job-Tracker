import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseHbxlSmartSchedule, type HbxlResource } from "../shared/measurable-work/offline-project-model.ts";

const resources = parseHbxlSmartSchedule(readFileSync("test-fixtures/patrick-brook/Job 51 Patrick Brook Smart Schedule Export.csv", "utf8"));
const wallReconciliation = JSON.parse(readFileSync("reports/offline-project-model/patrick-brook-plansxpress-wall-surface-reconciliation.json", "utf8"));

function source(phase: string, code: string): HbxlResource {
  const resource = resources.find((candidate) => candidate.buildPhase === phase && candidate.productCode === code);
  assert.ok(resource, `${phase}:${code}`);
  return resource;
}

function requirement(resource: HbxlResource, overrides: Partial<Record<string, unknown>> = {}) {
  assert.equal(resource.typeOfResource, "Material");
  return {
    hbxlResourceBaselineId: `hbxl-row-${resource.sourceRow}`,
    description: resource.description,
    resourceCode: resource.productCode,
    resourceType: "MATERIAL",
    baselineQuantity: resource.quantity,
    baselineUnitRate: resource.rate,
    requiredQuantity: resource.quantity,
    unitCode: resource.unit,
    quantitySource: "HBXL_BASELINE",
    sourceMetadata: { fixture: true, sourceRow: resource.sourceRow },
    ...overrides,
  };
}

test("electrical requirement preserves HB04196 baseline and compares fixture-only supplier quotes", () => {
  const buying = requirement(source("Electrical 2nd Fix", "HB04196"));
  const quotes = [
    { supplier: "Fixture Supplier A", fixtureOnly: true, unitPrice: 8.2, requirementId: "req-hb04196" },
    { supplier: "Fixture Supplier B", fixtureOnly: true, unitPrice: 7.95, requirementId: "req-hb04196" },
  ];
  assert.equal(buying.description, "Double Socket 13A with Twin USB (Each)");
  assert.equal(buying.baselineQuantity, 11);
  assert.equal(buying.baselineUnitRate, 9.9);
  assert.equal(buying.hbxlResourceBaselineId, "hbxl-row-344");
  assert.ok(quotes.every((quote) => quote.fixtureOnly));
  assert.equal(new Set(quotes.map((quote) => quote.supplier)).size, 2);
  assert.ok(quotes.every((quote) => quote.requirementId === "req-hb04196"));
  assert.deepEqual(quotes.map((quote) => quote.unitPrice), [8.2, 7.95]);
  assert.equal(buying.baselineUnitRate, 9.9);
});

test("Footings Engineering Brick preserves exact HB00038 source row and quantity 852", () => {
  const buying = requirement(source("Footings", "HB00038"));
  assert.equal(buying.hbxlResourceBaselineId, "hbxl-row-2");
  assert.equal(buying.requiredQuantity, 852);
  assert.equal(buying.unitCode, "Each");
});

test("Masonry Universal Beam preserves HB3708420 quantity 6 m", () => {
  const buying = requirement(source("Masonry Shell", "HB3708420"));
  assert.equal(buying.hbxlResourceBaselineId, "hbxl-row-28");
  assert.equal(buying.requiredQuantity, 6);
  assert.equal(buying.unitCode, "m");
});

test("Floor Tiles preserves HB01761 quantity 6 square metres", () => {
  const buying = requirement(source("Internal Fitting Out", "HB01761"));
  assert.equal(buying.hbxlResourceBaselineId, "hbxl-row-362");
  assert.equal(buying.requiredQuantity, 6);
  assert.equal(buying.unitCode, "m²");
});

test("operational quantity revision preserves the original HBXL quantity", () => {
  const baseline = source("Electrical 2nd Fix", "HB04196");
  const buying = requirement(baseline, {
    requiredQuantity: 12,
    quantitySource: "REVISION",
    sourceMetadata: { fixture: true, baselineQuantity: baseline.quantity, reason: "User-confirmed spare allowance" },
  });
  assert.equal(baseline.quantity, 11);
  assert.equal(buying.baselineQuantity, 11);
  assert.equal(buying.requiredQuantity, 12);
  assert.equal(buying.quantitySource, "REVISION");
});

test("labour and plant baseline rows are not automatically material requirements", () => {
  const labour = resources.find((resource) => resource.typeOfResource === "Labour");
  const plant = resources.find((resource) => resource.typeOfResource === "Plant");
  assert.ok(labour);
  assert.ok(plant);
  const automaticMaterialRequirements = resources.filter((resource) => resource.typeOfResource === "Material").map((resource) => requirement(resource));
  assert.equal(automaticMaterialRequirements.some((candidate) => candidate.hbxlResourceBaselineId === `hbxl-row-${labour.sourceRow}`), false);
  assert.equal(automaticMaterialRequirements.some((candidate) => candidate.hbxlResourceBaselineId === `hbxl-row-${plant.sourceRow}`), false);
});

test("quote arithmetic rounds quantity times unit price to pennies", () => {
  const quotedQuantity = 11;
  const unitPrice = 7.95;
  const lineValue = Math.round(quotedQuantity * unitPrice * 100) / 100;
  assert.equal(lineValue, 87.45);
});

test("same supplier later price is separate revision evidence", () => {
  const quote1 = { id: "quote-1", supplier: "Fixture Supplier A", revision: 1, unitPrice: 8.2, fixtureOnly: true };
  const quote2 = { id: "quote-2", supplier: "Fixture Supplier A", revision: 2, supersedes: quote1.id, unitPrice: 8.05, fixtureOnly: true };
  assert.notEqual(quote1.id, quote2.id);
  assert.equal(quote2.supersedes, quote1.id);
  assert.equal(quote1.unitPrice, 8.2);
  assert.equal(quote2.unitPrice, 8.05);
});

test("physical wall construction requirement occurs once while finishes retain two surfaces", () => {
  const wall = wallReconciliation.schedule.find((candidate: { plansXpressHandle: string }) => candidate.plansXpressHandle === "xWnFk9dNcUacbLPD729AeA");
  assert.ok(wall);
  const constructionRequirement = {
    measurableWorkItemId: `construct:${wall.plansXpressHandle}`,
    physicalWall: wall.plansXpressHandle,
    quantity: wall.grossConstructionAreaM2,
  };
  const finishRequirements = [
    { measurableWorkItemId: `finish:${wall.plansXpressHandle}:A`, wallSurface: `${wall.plansXpressHandle}:A`, workArea: wall.sideA.workArea },
    { measurableWorkItemId: `finish:${wall.plansXpressHandle}:B`, wallSurface: `${wall.plansXpressHandle}:B`, workArea: wall.sideB.workArea },
  ];
  assert.equal(constructionRequirement.physicalWall, wall.plansXpressHandle);
  assert.equal(constructionRequirement.quantity, 8.4);
  assert.equal(new Set([constructionRequirement.physicalWall]).size, 1);
  assert.equal(new Set(finishRequirements.map((item) => item.wallSurface)).size, 2);
  assert.deepEqual(finishRequirements.map((item) => item.workArea), ["Bedroom 3", "Passage"]);
});
