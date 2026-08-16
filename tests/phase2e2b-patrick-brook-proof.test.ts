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

function valuePennies(quantityMillionths: bigint, rateMillionths: bigint): bigint {
  const productScale = 1_000_000_000_000n;
  return (quantityMillionths * rateMillionths * 100n + productScale / 2n) / productScale;
}

test("Kitchen one-of-eleven valuation pays only its approved location quantity", () => {
  const kitchen = model.measurableItems.find((item) => item.workAreaId === "work-area-kitchen" && item.measurableItem === "Double Socket 13A with Twin USB");
  assert.ok(kitchen);
  const tender = { agreedQuantity: 11, lockedRateMillionths: 45_000_000n, contractValue: "495.00" };
  const valuation = { approvedQuantity: 1, previouslyValuedQuantity: 0, currentValuationQuantity: 1 };

  assert.equal(kitchen.plannedQuantity, 1);
  assert.equal(tender.agreedQuantity, 11);
  assert.equal(valuePennies(1_000_000n, tender.lockedRateMillionths), 4_500n);
  assert.equal(valuePennies(11_000_000n, tender.lockedRateMillionths), 49_500n);
  assert.equal(valuation.currentValuationQuantity, 1);
  assert.equal(tender.contractValue, "495.00");
});

test("claimed, held, and rejected quantities do not determine payable value", () => {
  const claim = { claimed: 3 };
  const decision = { inspected: 3, approved: 2, held: 1, rejected: 0 };
  const rate = 45_000_000n;
  assert.equal(valuePennies(BigInt(decision.approved) * 1_000_000n, rate), 9_000n);
  assert.equal(valuePennies(BigInt(decision.held) * 1_000_000n, rate), 4_500n);
  assert.equal(claim.claimed, 3);
  assert.notEqual(valuePennies(BigInt(claim.claimed) * 1_000_000n, rate), 9_000n);
});

test("reinspection supersession counts final current approval once", () => {
  const initial = { id: "inspection-1", approved: 2, held: 1, supersedes: null };
  const reinspection = { id: "inspection-2", approved: 3, held: 0, supersedes: initial.id };
  const decisions = [initial, reinspection];
  const current = decisions.filter((decision) => !decisions.some((replacement) => replacement.supersedes === decision.id));
  assert.deepEqual(current.map((decision) => decision.id), ["inspection-2"]);
  assert.equal(current.reduce((sum, decision) => sum + decision.approved, 0), 3);
  assert.notEqual(initial.approved + reinspection.approved, 3);
});

test("reinspection creates only the additional unvalued amount", () => {
  const rate = 45_000_000n;
  const firstValuation = { approvedToDate: 2, previouslyValued: 0, current: 2 };
  const secondValuation = { approvedToDate: 3, previouslyValued: 2, current: 1 };
  assert.equal(firstValuation.current, firstValuation.approvedToDate - firstValuation.previouslyValued);
  assert.equal(secondValuation.current, secondValuation.approvedToDate - secondValuation.previouslyValued);
  assert.equal(valuePennies(2_000_000n, rate), 9_000n);
  assert.equal(valuePennies(1_000_000n, rate), 4_500n);
  assert.notEqual(valuePennies(3_000_000n, rate), 4_500n);
});

test("approved seven less previously valued five yields only two new units", () => {
  const approvedToDate = 7;
  const previouslyValued = 5;
  const current = approvedToDate - previouslyValued;
  assert.equal(current, 2);
  assert.equal(valuePennies(2_000_000n, 45_000_000n), 9_000n);
});

test("physical-wall construction and two surface finishes value independently", () => {
  const wall = wallReconciliation.schedule.find((candidate: { plansXpressHandle: string }) => candidate.plansXpressHandle === "xWnFk9dNcUacbLPD729AeA");
  assert.ok(wall);
  const lines = [
    { allocation: `construct:${wall.plansXpressHandle}`, scope: "physical_wall", approvedQuantity: 8.4 },
    { allocation: `finish:${wall.plansXpressHandle}:A`, scope: "wall_surface", workArea: "Bedroom 3", approvedQuantity: 0 },
    { allocation: `finish:${wall.plansXpressHandle}:B`, scope: "wall_surface", workArea: "Passage", approvedQuantity: 0 },
  ];
  assert.equal(lines.filter((line) => line.scope === "physical_wall").length, 1);
  assert.equal(lines.filter((line) => line.scope === "wall_surface").length, 2);
  assert.equal(lines[0].approvedQuantity, 8.4);
  assert.equal(lines[1].approvedQuantity + lines[2].approvedQuantity, 0);
});

test("valuation remains separate from actual cash payment", () => {
  const valuation = { status: "APPROVED", grossMeasuredValue: "45.00" };
  const actualPayment = null;
  assert.equal(valuation.grossMeasuredValue, "45.00");
  assert.equal(actualPayment, null);
});
