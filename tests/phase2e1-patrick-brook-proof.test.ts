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

function contractValuePennies(quantityMillionths: bigint, rateMillionths: bigint): bigint {
  const productScale = 1_000_000_000_000n;
  return (quantityMillionths * rateMillionths * 100n + productScale / 2n) / productScale;
}

test("fixture electrical package locks project scope independently of Kitchen scope", () => {
  const kitchenItem = model.measurableItems.find((item) =>
    item.workAreaId === "work-area-kitchen" && item.measurableItem === "Double Socket 13A with Twin USB");
  assert.ok(kitchenItem);
  assert.equal(kitchenItem.plannedQuantity, 1);
  assert.equal(kitchenItem.unit, "Each");
  assert.equal(kitchenItem.hbxlProjectQuantity, 11);

  const fixturePackage = {
    packageName: "Electrical Second Fix",
    contractorName: "TEST FIXTURE - ABC Electrical",
    currencyCode: "GBP",
    source: "TEST_FIXTURE_NOT_HBXL",
  };
  const fixtureRate = {
    tenderItemCode: "ELEC-USB-DOUBLE-SOCKET",
    description: "Double Socket 13A with Twin USB",
    agreedQuantity: "11.000000",
    unitCode: "EACH",
    lockedUnitRate: "45.000000",
    lockedContractValue: "495.00",
    tenderRevisionNumber: 1,
    status: "LOCKED",
  };
  const provenLocationLinks = [{
    measurableWorkItemId: kitchenItem.id,
    workAreaId: kitchenItem.workAreaId,
    allocatedQuantity: "1.000000",
    allocationStatus: "MATCHED",
  }];

  assert.match(fixturePackage.contractorName, /^TEST FIXTURE/);
  assert.equal(fixturePackage.source, "TEST_FIXTURE_NOT_HBXL");
  assert.equal(contractValuePennies(11_000_000n, 45_000_000n), 49_500n);
  assert.equal(fixtureRate.lockedContractValue, "495.00");
  assert.notEqual(kitchenItem.plannedQuantity.toString(), fixtureRate.agreedQuantity);
  assert.equal(provenLocationLinks[0].allocatedQuantity, "1.000000");
  assert.equal(provenLocationLinks.reduce((total, link) => total + Number(link.allocatedQuantity), 0), 1);
  assert.equal(Number(fixtureRate.agreedQuantity) - 1, 10);
  assert.equal(provenLocationLinks.length, 1, "only Kitchen has a safely proven USB work area");
});

test("all linked location items use one locked commercial rate without copying it", () => {
  const tenderRate = { id: "fixture-usb-rate", lockedUnitRate: "45.000000", agreedQuantity: "11.000000" };
  const locationLinks = [
    { contractorTenderRateId: tenderRate.id, measurableWorkItemId: "kitchen-usb", allocatedQuantity: "1.000000" },
    { contractorTenderRateId: tenderRate.id, measurableWorkItemId: "future-proven-area-usb", allocatedQuantity: null },
  ];

  assert.ok(locationLinks.every((link) => link.contractorTenderRateId === tenderRate.id));
  assert.ok(locationLinks.every((link) => !("lockedUnitRate" in link)));
  assert.equal(tenderRate.lockedUnitRate, "45.000000");
});

test("fixture tender revision supersedes rather than overwrites accepted commercial facts", () => {
  const revision1 = {
    revision: 1,
    status: "SUPERSEDED",
    quantity: "11.000000",
    unit: "EACH",
    rate: "45.000000",
    value: "495.00",
  };
  const revision1Snapshot = structuredClone(revision1);
  const revision2 = {
    revision: 2,
    status: "LOCKED",
    quantity: "11.000000",
    unit: "EACH",
    rate: "47.500000",
    value: "522.50",
  };

  assert.notEqual(revision1.revision, revision2.revision);
  assert.deepEqual(revision1, revision1Snapshot);
  assert.equal(contractValuePennies(11_000_000n, 47_500_000n), 52_250n);
});

test("same contractor can have separate electrical and masonry packages", () => {
  const packages = [
    { contractorId: "fixture-contractor", packageCode: "ELEC-2F", name: "Electrical Second Fix" },
    { contractorId: "fixture-contractor", packageCode: "MASONRY", name: "Masonry and Partitions" },
  ];
  assert.equal(new Set(packages.map((item) => item.contractorId)).size, 1);
  assert.equal(new Set(packages.map((item) => item.packageCode)).size, 2);
});

test("one physical-wall construction item contracts once despite two finish surfaces", () => {
  const wall = wallReconciliation.schedule.find(
    (candidate: { plansXpressHandle: string }) => candidate.plansXpressHandle === "xWnFk9dNcUacbLPD729AeA",
  );
  assert.ok(wall);
  assert.equal(wall.grossConstructionAreaM2, 8.4);
  assert.equal(wall.sideA.workArea, "Bedroom 3");
  assert.equal(wall.sideB.workArea, "Passage");

  const masonryTenderLine = {
    id: "fixture-partition-rate",
    tenderItemCode: "MASONRY-INTERNAL-WALL",
    description: "Construct Internal Wall",
    agreedQuantity: "8.400000",
    unitCode: "M2",
  };
  const wallWorkItemLinks = [{
    contractorTenderRateId: masonryTenderLine.id,
    measurableWorkItemId: `construct:${wall.plansXpressHandle}`,
    physicalWallHandle: wall.plansXpressHandle,
    allocatedQuantity: "8.400000",
  }];
  const futureFinishLines = [
    { workArea: "Bedroom 3", wallSurface: `${wall.plansXpressHandle}:A` },
    { workArea: "Passage", wallSurface: `${wall.plansXpressHandle}:B` },
  ];

  assert.equal(masonryTenderLine.agreedQuantity, "8.400000");
  assert.equal(wallWorkItemLinks.length, 1);
  assert.equal(new Set(wallWorkItemLinks.map((link) => link.physicalWallHandle)).size, 1);
  assert.equal(new Set(futureFinishLines.map((line) => line.wallSurface)).size, 2);
});

test("one masonry or decoration commercial line can serve multiple location work items", () => {
  const masonryRateId = "masonry-wall-rate";
  const wallLinks = ["physical-wall-1", "physical-wall-2"].map((id) => ({ contractorTenderRateId: masonryRateId, measurableWorkItemId: id }));
  const decorationRateId = "paint-wall-rate";
  const surfaceLinks = ["bedroom-3-side-a", "passage-side-b"].map((id) => ({ contractorTenderRateId: decorationRateId, measurableWorkItemId: id }));
  assert.equal(new Set(wallLinks.map((link) => link.contractorTenderRateId)).size, 1);
  assert.equal(new Set(surfaceLinks.map((link) => link.contractorTenderRateId)).size, 1);
  assert.equal(new Set(wallLinks.map((link) => link.measurableWorkItemId)).size, 2);
  assert.equal(new Set(surfaceLinks.map((link) => link.measurableWorkItemId)).size, 2);
});

test("HBXL allowance and fixture contractor rate remain separate facts", () => {
  const usbBaseline = model.hbxlResources.find((resource) => resource.productCode === "HB04196");
  assert.ok(usbBaseline);
  assert.equal(usbBaseline.rate, 9.9);
  assert.equal(usbBaseline.quantity, 11);

  const fixtureContractorRate = "45.000000";
  assert.notEqual(usbBaseline.rate.toFixed(6), fixtureContractorRate);
  assert.equal(usbBaseline.rate, 9.9, "fixture contractor pricing must not mutate HBXL baseline pricing");
});

test("same work description across areas remains separate from tender identity", () => {
  const workItems = [
    { id: "bedroom-2-paint", workArea: "Bedroom 2", description: "Paint Walls" },
    { id: "bedroom-3-paint", workArea: "Bedroom 3", description: "Paint Walls" },
  ];
  const tenderRate = { id: "paint-rate", tenderItemCode: "DECORATION-PAINT-WALLS", revision: 1 };
  const tenderLinks = workItems.map((item) => ({ contractorTenderRateId: tenderRate.id, measurableWorkItemId: item.id }));
  assert.equal(new Set(workItems.map((item) => item.description)).size, 1);
  assert.equal(new Set(tenderLinks.map((line) => line.measurableWorkItemId)).size, 2);
  assert.equal(new Set(tenderLinks.map((line) => line.contractorTenderRateId)).size, 1);
});
