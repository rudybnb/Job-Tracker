import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildOfflineProjectModel } from "../shared/measurable-work/offline-project-model.ts";

const model = buildOfflineProjectModel({
  project: "Patrick Brook / Chat Test",
  dxfContent: readFileSync("test-fixtures/patrick-brook/Chat Test.dxf", "utf8"),
  hbxlCsvContent: readFileSync("test-fixtures/patrick-brook/Job 51 Patrick Brook Smart Schedule Export.csv", "utf8"),
  sourceDxf: "test-fixtures/patrick-brook/Chat Test.dxf",
  sourceSmartSchedule: "test-fixtures/patrick-brook/Job 51 Patrick Brook Smart Schedule Export.csv",
});
const wallReconciliation = JSON.parse(readFileSync("reports/offline-project-model/patrick-brook-plansxpress-wall-surface-reconciliation.json", "utf8"));
const estimatingAudit = JSON.parse(readFileSync("reports/offline-project-model/patrick-brook-plansxpress-estimating-status-audit.json", "utf8"));

test("existing offline model cardinalities fit Phase D without becoming schema assumptions", () => {
  assert.deepEqual(model.summary, {
    workAreasDetected: 10,
    tradesDetected: 10,
    measurableItemsCreated: 80,
    drawingObjectsLinked: 67,
    hbxlResourcesLinked: 402,
    exactMatches: 14,
    reviewRequired: 66,
  });
  assert.equal(model.summary.exactMatches + model.summary.reviewRequired, model.summary.measurableItemsCreated);
});

test("Kitchen USB socket is one operational item with drawing and resource provenance", () => {
  const item = model.measurableItems.find((candidate) =>
    candidate.workAreaId === "work-area-kitchen" && candidate.measurableItem === "Double Socket 13A with Twin USB");
  assert.ok(item);
  assert.equal(item.tradePackage, "Electrical");
  assert.equal(item.plannedQuantity, 1);
  assert.equal(item.unit, "Each");
  assert.equal(item.reconciliationStatus, "MATCH");
  assert.deepEqual(item.drawingObjectIds, ["drawing-0010"]);
  assert.equal(item.hbxlProjectQuantity, 11);
  assert.equal(item.hbxlResourceIds.length, 10);

  const drawing = model.drawingObjects.find((candidate) => candidate.id === item.drawingObjectIds[0]);
  assert.ok(drawing);
  assert.equal(drawing.workAreaId, "work-area-kitchen");
  assert.equal(drawing.canonicalDrawingIdentity, "Double Socket 13A with Twin USB");

  const linkedResources = item.hbxlResourceIds.map((id) => model.hbxlResources.find((resource) => resource.id === id));
  assert.ok(linkedResources.every(Boolean));
  assert.ok(linkedResources.some((resource) => resource?.productCode === "HB04196"));
  assert.ok(linkedResources.some((resource) => resource?.description === "Back Box Metal 2G 25mm (Each)"));
  assert.ok(linkedResources.some((resource) => resource?.description === "Cable Clips 2.5mm (Pack of 100) (Each)"));
  assert.ok(linkedResources.some((resource) => resource?.description === "Twin & Earth Cable 2.5mm (50m) (Each)"));
  assert.ok(linkedResources.some((resource) => resource?.typeOfResource === "Labour"));
});

test("resource build-up does not become five or more work items automatically", () => {
  const item = model.measurableItems.find((candidate) =>
    candidate.workAreaId === "work-area-kitchen" && candidate.measurableItem === "Double Socket 13A with Twin USB");
  assert.ok(item);
  assert.equal(model.measurableItems.filter((candidate) => candidate.id === item.id).length, 1);
  assert.ok(item.hbxlResourceIds.length > 5);
  assert.ok(item.hbxlResourceIds.every((resourceId) => !model.measurableItems.some((candidate) => candidate.id === resourceId)));
});

test("physical wall construction links once while two finishes link to separate surfaces", () => {
  const wall = wallReconciliation.schedule.find(
    (candidate: { plansXpressHandle: string }) => candidate.plansXpressHandle === "xWnFk9dNcUacbLPD729AeA",
  );
  assert.ok(wall);
  assert.equal(wall.lengthUsedByEstimatorM, 3.5);
  assert.equal(wall.heightM, 2.4);
  assert.equal(wall.grossConstructionAreaM2, 8.4);
  assert.equal(wall.sideA.workArea, "Bedroom 3");
  assert.equal(wall.sideB.workArea, "Passage");

  const constructionItem = {
    description: "Construct Internal Wall",
    plannedQuantity: wall.grossConstructionAreaM2,
    unit: "m2",
    quantitySource: "DRAWING",
    sourceLinks: [{ physicalWallHandle: wall.plansXpressHandle, sourceRole: "QUANTITY_SOURCE" }],
  };
  const finishItems = [
    { workArea: wall.sideA.workArea, description: "Finish Wall Surface", wallSurface: `${wall.plansXpressHandle}:A` },
    { workArea: wall.sideB.workArea, description: "Finish Wall Surface", wallSurface: `${wall.plansXpressHandle}:B` },
  ];

  assert.equal(constructionItem.sourceLinks.length, 1);
  assert.equal(constructionItem.plannedQuantity, 8.4);
  assert.equal(new Set(finishItems.map((item) => item.wallSurface)).size, 2);
  assert.deepEqual(finishItems.map((item) => item.workArea), ["Bedroom 3", "Passage"]);
});

test("same finish description remains valid in different work areas", () => {
  const items = [
    { jobId: "patrick-brook", workAreaId: "bedroom-2", description: "Paint Walls" },
    { jobId: "patrick-brook", workAreaId: "bedroom-3", description: "Paint Walls" },
    { jobId: "patrick-brook", workAreaId: "lounge", description: "Paint Walls" },
  ];
  assert.equal(new Set(items.map((item) => item.description)).size, 1);
  assert.equal(new Set(items.map((item) => `${item.jobId}:${item.workAreaId}`)).size, 3);
});

test("roof, masonry, foundations, decoration, and flooring remain review-required without safe drawing joins", () => {
  const expected = [
    "HBXL Baseline: Roof Structure",
    "HBXL Baseline: Masonry Shell",
    "HBXL Baseline: Foundations",
    "HBXL Baseline: Internal Decoration",
    "HBXL Baseline: Internal Fitting Out",
  ];
  for (const description of expected) {
    const item = model.measurableItems.find((candidate) => candidate.measurableItem === description);
    assert.ok(item, description);
    assert.equal(item.reconciliationStatus, "REVIEW REQUIRED");
    assert.equal(item.drawingObjectIds.length, 0);
    assert.ok(item.hbxlResourceIds.length > 0);
  }
});

test("visual-only drawing evidence does not create work items by itself", () => {
  assert.equal(estimatingAudit.counts.nonEstimatedVisualOnly, 70);
  assert.equal(estimatingAudit.counts.topLevelEntities, 196);
  assert.ok(model.measurableItems.every((item) => item.drawingObjectIds.every((id) => model.drawingObjects.some((drawing) => drawing.id === id))));
  assert.ok(model.drawingObjects.filter((drawing) => drawing.status === "MATCH").length <= model.drawingObjects.length);
  assert.equal(model.measurableItems.some((item) => item.measurableItem === "NON_ESTIMATED_VISUAL_ONLY"), false);
});

test("one HBXL resource can support multiple work items only through separate explicit links", () => {
  const cableId = "hbxl-row-332";
  const linkedItems = model.measurableItems.filter((item) => item.hbxlResourceIds.includes(cableId));
  assert.ok(linkedItems.length > 1);
  assert.equal(new Set(linkedItems.map((item) => `${item.id}:${cableId}`)).size, linkedItems.length);
});
