import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildOfflineProjectModel, parseHbxlSmartSchedule } from "../shared/measurable-work/offline-project-model.ts";

const dxfContent = readFileSync("test-fixtures/patrick-brook/Chat Test.dxf", "utf8");
const hbxlCsvContent = readFileSync("test-fixtures/patrick-brook/Job 51 Patrick Brook Smart Schedule Export.csv", "utf8");

test("parses real Patrick Brook Smart Schedule resources without collapsing resource kinds", () => {
  const resources = parseHbxlSmartSchedule(hbxlCsvContent);

  assert.equal(resources.length, 417);
  assert.ok(resources.some((resource) => resource.typeOfResource === "Material"));
  assert.ok(resources.some((resource) => resource.typeOfResource === "Labour"));
  assert.ok(resources.some((resource) => resource.typeOfResource === "Plant"));

  const usbSocket = resources.find((resource) => resource.productCode === "HB04196");
  assert.ok(usbSocket);
  assert.equal(usbSocket.description, "Double Socket 13A with Twin USB (Each)");
  assert.equal(usbSocket.quantity, 11);
  assert.equal(usbSocket.unit, "Each");
  assert.equal(usbSocket.rate, 9.9);
  assert.equal(usbSocket.rateUnit, "Each");
});

test("builds offline project model from real Patrick Brook DXF and Smart Schedule", () => {
  const model = buildOfflineProjectModel({
    project: "Patrick Brook / Chat Test",
    dxfContent,
    hbxlCsvContent,
    sourceDxf: "test-fixtures/patrick-brook/Chat Test.dxf",
    sourceSmartSchedule: "test-fixtures/patrick-brook/Job 51 Patrick Brook Smart Schedule Export.csv",
  });

  assert.ok(model.workAreas.some((area) => area.name === "Kitchen"));
  assert.ok(model.workAreas.some((area) => area.name === "Lounge"));
  assert.ok(model.workAreas.some((area) => area.name === "Main Bedroom"));
  assert.ok(model.workAreas.some((area) => area.name === "Foundation"));
  assert.ok(model.workAreas.some((area) => area.name === "Roof"));
  assert.ok(model.physicalWorkAreas.some((area) => area.name === "Lounge"));
  assert.ok(model.derivedPackageZones.some((area) => area.name === "Foundation"));
  assert.ok(model.trades.includes("Electrical"));
  assert.ok(model.trades.includes("Roofing"));
  assert.ok(model.trades.includes("Groundworks"));
  assert.ok(model.summary.drawingObjectsLinked >= 48);
  assert.ok(model.summary.hbxlResourcesLinked > 100);
});

test("proves official Wall Decoration treatment but keeps per-room quantity review-required", () => {
  const model = buildOfflineProjectModel({
    project: "Patrick Brook / Chat Test",
    dxfContent,
    hbxlCsvContent,
    sourceDxf: "test-fixtures/patrick-brook/Chat Test.dxf",
    sourceSmartSchedule: "test-fixtures/patrick-brook/Job 51 Patrick Brook Smart Schedule Export.csv",
  });
  const loungeDecoration = model.measurableItems.find((item) => item.workAreaId === "work-area-lounge" && item.measurableItem === "Wall Decoration");

  assert.equal(model.wallDecorationProof.officialPlansXpressTreatment.treatmentName, "Wall Decoration");
  assert.ok(model.wallDecorationProof.dxfEvidence.roomLabels.includes("Lounge"));
  assert.equal(model.wallDecorationProof.dxfEvidence.wallDecorationTreatmentDetectedInProjectDxf, false);
  assert.ok(loungeDecoration);
  assert.equal(loungeDecoration.plannedQuantity, null);
  assert.equal(loungeDecoration.unit, "m2");
  assert.equal(loungeDecoration.reconciliationStatus, "REVIEW REQUIRED");
  assert.ok(loungeDecoration.hbxlResourceIds.length > 0);
});

test("keeps measurable electrical items separate from HBXL resource build-up", () => {
  const model = buildOfflineProjectModel({
    project: "Patrick Brook / Chat Test",
    dxfContent,
    hbxlCsvContent,
    sourceDxf: "test-fixtures/patrick-brook/Chat Test.dxf",
    sourceSmartSchedule: "test-fixtures/patrick-brook/Job 51 Patrick Brook Smart Schedule Export.csv",
  });
  const kitchenSocket = model.measurableItems.find((item) => item.workAreaId === "work-area-kitchen" && item.measurableItem === "Double Socket 13A with Twin USB");

  assert.ok(kitchenSocket);
  assert.equal(kitchenSocket.tradePackage, "Electrical");
  assert.equal(kitchenSocket.reconciliationStatus, "MATCH");
  assert.ok(kitchenSocket.drawingObjectIds.length > 0);
  assert.ok(kitchenSocket.hbxlResourceIds.length > 1, "resource build-up should remain linked as resource rows, not become separate measurable items");
});

test("marks non-electrical HBXL phase baselines as review required when no safe DXF join exists", () => {
  const model = buildOfflineProjectModel({
    project: "Patrick Brook / Chat Test",
    dxfContent,
    hbxlCsvContent,
    sourceDxf: "test-fixtures/patrick-brook/Chat Test.dxf",
    sourceSmartSchedule: "test-fixtures/patrick-brook/Job 51 Patrick Brook Smart Schedule Export.csv",
  });
  const roof = model.measurableItems.find((item) => item.measurableItem === "HBXL Baseline: Roof Structure");
  const masonry = model.measurableItems.find((item) => item.measurableItem === "HBXL Baseline: Masonry Shell");
  const flooring = model.measurableItems.find((item) => item.measurableItem === "HBXL Baseline: Internal Fitting Out");

  assert.ok(roof);
  assert.equal(roof.reconciliationStatus, "REVIEW REQUIRED");
  assert.equal(roof.drawingObjectIds.length, 0);
  assert.ok(roof.hbxlResourceIds.length > 0);
  assert.ok(masonry);
  assert.ok(flooring);
});
