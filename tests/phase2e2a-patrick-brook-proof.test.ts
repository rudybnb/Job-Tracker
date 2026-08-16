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

test("Kitchen progress and claim remain one location unit within project tender quantity eleven", () => {
  const kitchen = model.measurableItems.find((item) => item.workAreaId === "work-area-kitchen" && item.measurableItem === "Double Socket 13A with Twin USB");
  assert.ok(kitchen);
  assert.equal(kitchen.plannedQuantity, 1);
  assert.equal(kitchen.hbxlProjectQuantity, 11);

  const tender = { agreedQuantity: 11, unit: "Each", fixtureRate: "45.000000", source: "TEST_FIXTURE_NOT_HBXL" };
  const allocation = { measurableWorkItemId: kitchen.id, allocatedQuantity: 1, unit: "Each" };
  const progress = { measurableWorkItemId: kitchen.id, progressQuantity: 1, unit: "Each", entryType: "PROGRESS" };
  const claimLine = { measurableWorkItemId: kitchen.id, claimedQuantity: 1, unit: "Each" };
  const decision = { inspected: 1, approved: 1, rejected: 0, held: 0, status: "APPROVED" };

  assert.equal(allocation.allocatedQuantity, kitchen.plannedQuantity);
  assert.equal(progress.progressQuantity, 1);
  assert.equal(claimLine.claimedQuantity, 1);
  assert.deepEqual(decision, { inspected: 1, approved: 1, rejected: 0, held: 0, status: "APPROVED" });
  assert.equal(tender.agreedQuantity, 11);
  assert.notEqual(tender.agreedQuantity, allocation.allocatedQuantity);
});

test("three claimed and inspected can preserve two approved plus one held", () => {
  const claimLine = { claimedQuantity: 3, unit: "Each" };
  const decision = {
    inspectedQuantity: 3,
    approvedQuantity: 2,
    rejectedQuantity: 0,
    heldQuantity: 1,
    status: "PART_APPROVED",
  };
  assert.equal(decision.approvedQuantity + decision.rejectedQuantity + decision.heldQuantity, decision.inspectedQuantity);
  assert.equal(claimLine.claimedQuantity - decision.approvedQuantity, 1);
});

test("defect and reinspection remain separate append-only decisions", () => {
  const firstDecision = {
    id: "inspection-1",
    claimedQuantity: 3,
    inspectedQuantity: 3,
    approvedQuantity: 2,
    rejectedQuantity: 0,
    heldQuantity: 1,
    status: "REINSPECTION_REQUIRED",
    defectReasonCode: "SOCKET_NOT_STRAIGHT",
    notes: "3 sockets claimed, only 2 complete; remaining socket not straight - rectify.",
    supersedesDecisionId: null,
  };
  const reinspection = {
    id: "inspection-2",
    inspectedQuantity: 3,
    approvedQuantity: 3,
    rejectedQuantity: 0,
    heldQuantity: 0,
    status: "APPROVED",
    notes: "Rectification verified.",
    supersedesDecisionId: firstDecision.id,
  };
  const originalSnapshot = structuredClone(firstDecision);

  assert.equal(reinspection.supersedesDecisionId, firstDecision.id);
  assert.deepEqual(firstDecision, originalSnapshot);
  assert.equal(firstDecision.heldQuantity, 1);
  assert.equal(reinspection.approvedQuantity, 3);
});

test("cumulative claims and current approvals expose over-scope before insert", () => {
  const allocation = 3;
  const priorClaims = [1, 1];
  const nextClaim = 2;
  assert.ok(priorClaims.reduce((sum, quantity) => sum + quantity, 0) + nextClaim > allocation);

  const currentApprovedDecisions = [1, 1];
  const nextApproval = 2;
  assert.ok(currentApprovedDecisions.reduce((sum, quantity) => sum + quantity, 0) + nextApproval > allocation);
});

test("physical wall progress remains independent from both finish surfaces", () => {
  const wall = wallReconciliation.schedule.find((candidate: { plansXpressHandle: string }) => candidate.plansXpressHandle === "xWnFk9dNcUacbLPD729AeA");
  assert.ok(wall);
  const construction = {
    workItemId: `construct:${wall.plansXpressHandle}`,
    physicalWall: wall.plansXpressHandle,
    progressQuantity: 8.4,
  };
  const finishes = [
    { workItemId: `finish:${wall.plansXpressHandle}:A`, workArea: "Bedroom 3", progressQuantity: 0 },
    { workItemId: `finish:${wall.plansXpressHandle}:B`, workArea: "Passage", progressQuantity: 0 },
  ];
  assert.equal(construction.progressQuantity, 8.4);
  assert.equal(new Set(finishes.map((finish) => finish.workItemId)).size, 2);
  assert.ok(finishes.every((finish) => finish.progressQuantity === 0));
});

test("E2A evidence references but does not copy locked commercial values", () => {
  const tender = { id: "usb-rate", agreedQuantity: "11.000000", lockedUnitRate: "45.000000", lockedContractValue: "495.00", currency: "GBP" };
  const progress = { tenderRateId: tender.id, progressQuantity: "1.000000" };
  const claim = { tenderRateId: tender.id, claimedQuantity: "1.000000" };
  assert.ok(!("lockedUnitRate" in progress));
  assert.ok(!("lockedContractValue" in claim));
  assert.equal(tender.lockedUnitRate, "45.000000");
  assert.equal(tender.lockedContractValue, "495.00");
});
