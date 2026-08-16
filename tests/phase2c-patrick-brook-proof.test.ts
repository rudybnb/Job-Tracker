import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseHbxlSmartSchedule, type HbxlResource } from "../shared/measurable-work/offline-project-model.ts";

const fixturePath = "test-fixtures/patrick-brook/Job 51 Patrick Brook Smart Schedule Export.csv";
const resources = parseHbxlSmartSchedule(readFileSync(fixturePath, "utf8"));

function baselineRepresentation(resource: HbxlResource, sourceImportId: string) {
  const sourceValues = {
    orderDate: resource.orderDate,
    requiredDate: resource.dateRequired,
    buildPhase: resource.buildPhase,
    sourceResourceClass: resource.typeOfResource,
    sourceResourceType: resource.resourceType,
    supplier: resource.supplier,
    productCode: resource.productCode,
    originalDescription: resource.descriptionWithPrice,
    description: resource.description,
    quantity: resource.quantity,
  };

  return {
    sourceImportId,
    sourceRowNumber: resource.sourceRow,
    sourceRowKey: `csv-row-${resource.sourceRow}`,
    sourceRowHash: createHash("sha256").update(JSON.stringify(sourceValues)).digest("hex"),
    hbxlProductCode: resource.productCode || null,
    description: resource.description,
    originalDescription: resource.descriptionWithPrice,
    sourceResourceType: resource.resourceType,
    resourceType: ["Material", "Labour", "Plant"].includes(resource.typeOfResource)
      ? resource.typeOfResource.toUpperCase()
      : "OTHER",
    quantity: resource.quantity,
    canonicalUnitCode: null,
    originalUnitText: resource.unit || null,
    baselineUnitRate: resource.rate,
    baselineValue: null,
    currencyCode: resource.rate === null ? null : "GBP",
    buildPhase: resource.buildPhase || null,
    supplier: resource.supplier || null,
    orderDate: resource.orderDate || null,
    requiredDate: resource.dateRequired || null,
    sourceMetadata: sourceValues,
  };
}

test("Patrick Brook preserves all Smart Schedule rows by deterministic source identity", () => {
  const rows = resources.map((resource) => baselineRepresentation(resource, "revision-1"));
  assert.equal(rows.length, 417);
  assert.equal(new Set(rows.map((row) => `${row.sourceImportId}:${row.sourceRowNumber}`)).size, 417);
  assert.ok(rows.every((row) => /^[0-9a-f]{64}$/.test(row.sourceRowHash)));
  assert.equal(rows[0].sourceRowNumber, 2);
  assert.equal(rows.at(-1)?.sourceRowNumber, 418);
});

test("Patrick Brook resource classes remain separate with exact counts", () => {
  const counts = resources.reduce<Record<string, number>>((result, resource) => {
    const type = ["Material", "Labour", "Plant"].includes(resource.typeOfResource)
      ? resource.typeOfResource.toUpperCase()
      : "OTHER";
    result[type] = (result[type] ?? 0) + 1;
    return result;
  }, {});

  assert.deepEqual(counts, {
    MATERIAL: 323,
    LABOUR: 59,
    PLANT: 34,
    OTHER: 1,
  });
  assert.equal(Object.values(counts).reduce((total, count) => total + count, 0), 417);

  const subcontractor = resources.find((resource) => resource.typeOfResource === "Subcontractor");
  assert.ok(subcontractor);
  assert.equal(baselineRepresentation(subcontractor, "revision-1").resourceType, "OTHER");
  assert.equal(baselineRepresentation(subcontractor, "revision-1").sourceResourceType, "Sundry Subcontractor");
});

test("Patrick Brook representation preserves commercial, unit, supplier, and schedule evidence", () => {
  const rows = resources.map((resource) => baselineRepresentation(resource, "revision-1"));
  assert.equal(rows.filter((row) => row.hbxlProductCode).length, 304);
  assert.equal(rows.filter((row) => row.supplier).length, 417);
  assert.equal(rows.filter((row) => row.baselineUnitRate !== null).length, 417);
  assert.equal(rows.filter((row) => row.orderDate && row.requiredDate).length, 417);
  assert.ok(rows.every((row) => row.description && row.originalDescription));
  assert.ok(rows.every((row) => row.originalUnitText));
  assert.ok(rows.every((row) => row.buildPhase));
  assert.ok(rows.every((row) => row.baselineValue === null));
});

test("Patrick Brook proves representative resources across required trades", () => {
  const examples = [
    { phase: "Electrical 2nd Fix", code: "HB04196", description: "Double Socket 13A with Twin USB (Each)", type: "Material", quantity: 11, unit: "Each", rate: 9.9 },
    { phase: "Footings", code: "HB00038", description: "Engineering Brick - Class A Blue 65mm (Each)", type: "Material", quantity: 852, unit: "Each", rate: 1.68 },
    { phase: "Masonry Shell", code: "HB3708420", description: "Universal Beam 610 x 305 x 238kg per m (m)", type: "Material", quantity: 6, unit: "m", rate: 670 },
    { phase: "Structural Openings", code: "", description: "Acrow Props 1, 2 & 3 (Week)", type: "Plant", quantity: 6, unit: "Week", rate: 6 },
    { phase: "Roof Structure", code: "HB00568", description: "Truss Roof Assembly (Each)", type: "Material", quantity: 26643, unit: "Each", rate: 1 },
    { phase: "Internal Decoration", code: "", description: "Decorator (Hours)", type: "Labour", quantity: 181, unit: "Hours", rate: 29 },
    { phase: "Internal Fitting Out", code: "HB01761", description: "Floor Tiles (Allowance £30 per m²) (m²)", type: "Material", quantity: 6, unit: "m²", rate: 30 },
  ];

  for (const expected of examples) {
    const resource = resources.find((candidate) => candidate.buildPhase === expected.phase && candidate.productCode === expected.code && candidate.description === expected.description);
    assert.ok(resource, `${expected.phase}: ${expected.description}`);
    assert.equal(resource.typeOfResource, expected.type);
    if ("quantity" in expected) assert.equal(resource.quantity, expected.quantity);
    if ("unit" in expected) assert.equal(resource.unit, expected.unit);
    if ("rate" in expected) assert.equal(resource.rate, expected.rate);
  }
});

test("duplicate product codes are preserved as distinct source rows", () => {
  const engineeringBricks = resources.filter((resource) => resource.productCode === "HB00038");
  assert.equal(engineeringBricks.length, 3);
  assert.deepEqual(engineeringBricks.map((resource) => resource.buildPhase), ["Footings", "Masonry Shell", "Structural Openings"]);
  assert.equal(new Set(engineeringBricks.map((resource) => resource.sourceRow)).size, 3);
});

test("hypothetical revision 2 can repeat product codes without changing revision 1", () => {
  const source = resources.find((resource) => resource.productCode === "HB04196");
  assert.ok(source);

  const revision1 = baselineRepresentation(source, "revision-1");
  const revision1Snapshot = structuredClone(revision1);
  const revision2 = {
    ...baselineRepresentation({ ...source, quantity: source.quantity + 2 }, "revision-2"),
  };

  assert.equal(revision1.hbxlProductCode, revision2.hbxlProductCode);
  assert.notEqual(`${revision1.sourceImportId}:${revision1.sourceRowNumber}`, `${revision2.sourceImportId}:${revision2.sourceRowNumber}`);
  assert.notEqual(revision1.sourceRowHash, revision2.sourceRowHash);
  assert.deepEqual(revision1, revision1Snapshot);
  assert.equal(revision1.quantity, 11);
  assert.equal(revision2.quantity, 13);
});
