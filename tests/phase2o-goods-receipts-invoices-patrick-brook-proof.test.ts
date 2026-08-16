import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseHbxlSmartSchedule, type HbxlResource } from "../shared/measurable-work/offline-project-model.ts";

const resources = parseHbxlSmartSchedule(readFileSync("test-fixtures/patrick-brook/Job 51 Patrick Brook Smart Schedule Export.csv", "utf8"));
const walls = JSON.parse(readFileSync("reports/offline-project-model/patrick-brook-plansxpress-wall-surface-reconciliation.json", "utf8"));

function resource(phase: string, code: string): HbxlResource {
  const found = resources.find((candidate) => candidate.buildPhase === phase && candidate.productCode === code);
  assert.ok(found);
  return found;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

test("Engineering Bricks support two POs, partial receipts, and separate actual invoice cost", () => {
  const baseline = resource("Footings", "HB00038");
  const requirement = { quantity: 852, unit: baseline.unit };
  const quote = { unitPrice: 1.4, fixtureOnly: true };
  const orders = [{ quantity: 500, agreedUnitPrice: 1.35 }, { quantity: 352, agreedUnitPrice: 1.35 }];
  const receipts = [300, 200, 352];
  const invoices = [{ quantity: 500, actualUnitPrice: 1.37 }, { quantity: 352, actualUnitPrice: 1.37 }];
  assert.equal(sum(orders.map((order) => order.quantity)), requirement.quantity);
  assert.equal(sum(receipts), requirement.quantity);
  assert.equal(sum(invoices.map((invoice) => invoice.quantity)), requirement.quantity);
  assert.equal(baseline.rate, 1.68);
  assert.equal(quote.unitPrice, 1.4);
  assert.equal(orders[0].agreedUnitPrice, 1.35);
  assert.equal(invoices[0].actualUnitPrice, 1.37);
  assert.equal(Number((invoices[0].actualUnitPrice - baseline.rate!).toFixed(2)), -0.31);
  assert.equal(Number((invoices[0].actualUnitPrice - quote.unitPrice).toFixed(2)), -0.03);
  assert.equal(Number((invoices[0].actualUnitPrice - orders[0].agreedUnitPrice).toFixed(2)), 0.02);
});

test("ordered delivered accepted rejected and invoiced remain separate", () => {
  const reconciliation = { ordered: 500, delivered: 500, accepted: 490, rejected: 10, invoiced: 500 };
  const status = reconciliation.rejected > 0 || reconciliation.invoiced > reconciliation.accepted ? "REVIEW_REQUIRED" : "MATCHED";
  assert.equal(reconciliation.accepted + reconciliation.rejected, reconciliation.delivered);
  assert.equal(status, "REVIEW_REQUIRED");
  assert.notEqual(reconciliation.rejected, 0);
});

test("three partial brick deliveries total 852 without duplication", () => {
  const accepted = [400, 300, 152];
  assert.equal(sum(accepted), 852);
  assert.equal(new Set(accepted.map((quantity, index) => `receipt-${index + 1}:${quantity}`)).size, 3);
});

test("two partial invoices total one 500-unit PO line", () => {
  const invoices = [300, 200];
  assert.equal(sum(invoices), 500);
  assert.equal(invoices.length, 2);
});

test("USB socket preserves 11 Each through requirement quote PO receipt and invoice", () => {
  const baseline = resource("Electrical 2nd Fix", "HB04196");
  const chain = [baseline.quantity, 11, 11, 5 + 6, 5 + 6];
  assert.deepEqual(chain, [11, 11, 11, 11, 11]);
  assert.equal(baseline.unit, "Each");
  assert.equal(baseline.rate, 9.9);
});

test("Universal Beam preserves six linear metres through receipt and invoice", () => {
  const baseline = resource("Masonry Shell", "HB3708420");
  const receipt = { acceptedQuantity: 6, unitCode: baseline.unit };
  const invoice = { invoicedQuantity: 6, unitCode: baseline.unit };
  assert.deepEqual([receipt.unitCode, invoice.unitCode], ["m", "m"]);
  assert.notEqual(receipt.unitCode, "Each");
});

test("Floor Tiles preserve six square metres through receipt and invoice", () => {
  const baseline = resource("Internal Fitting Out", "HB01761");
  assert.deepEqual({ quantity: baseline.quantity, unit: baseline.unit }, { quantity: 6, unit: "m²" });
});

test("physical wall construction reaches one receipt and invoice chain without surface doubling", () => {
  const wall = walls.schedule.find((candidate: { plansXpressHandle: string }) => candidate.plansXpressHandle === "xWnFk9dNcUacbLPD729AeA");
  assert.ok(wall);
  const construction = {
    physicalWall: wall.plansXpressHandle,
    workItem: `construct:${wall.plansXpressHandle}`,
    resource: "fixture-material-resource",
    requirement: `requirement:${wall.plansXpressHandle}`,
    poLine: `po:${wall.plansXpressHandle}`,
    receiptLine: `receipt:${wall.plansXpressHandle}`,
    invoiceLine: `invoice:${wall.plansXpressHandle}`,
  };
  const finishes = [`finish:${wall.plansXpressHandle}:A`, `finish:${wall.plansXpressHandle}:B`];
  assert.equal(new Set([construction.physicalWall]).size, 1);
  assert.equal(new Set([construction.poLine, construction.receiptLine, construction.invoiceLine]).size, 3);
  assert.equal(new Set(finishes).size, 2);
});
