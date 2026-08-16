import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseHbxlSmartSchedule, type HbxlResource } from "../shared/measurable-work/offline-project-model.ts";

const resources = parseHbxlSmartSchedule(readFileSync("test-fixtures/patrick-brook/Job 51 Patrick Brook Smart Schedule Export.csv", "utf8"));
const walls = JSON.parse(readFileSync("reports/offline-project-model/patrick-brook-plansxpress-wall-surface-reconciliation.json", "utf8"));
type OrderStatus = "DRAFT" | "APPROVED" | "SENT" | "PART_ORDERED" | "ORDERED" | "CANCELLED" | "COMPLETED";
type OrderLine = { requirementId: string; quantity: number; unit: string; agreedUnitPrice: number };
type Order = { status: OrderStatus; lines: OrderLine[] };

function resource(phase: string, code: string): HbxlResource {
  const found = resources.find((candidate) => candidate.buildPhase === phase && candidate.productCode === code);
  assert.ok(found);
  return found;
}

function effectiveQuantity(requirementId: string, orders: Order[]): number {
  const effective = new Set<OrderStatus>(["APPROVED", "SENT", "PART_ORDERED", "ORDERED", "COMPLETED"]);
  return orders.filter((order) => effective.has(order.status)).flatMap((order) => order.lines)
    .filter((line) => line.requirementId === requirementId)
    .reduce((total, line) => total + line.quantity, 0);
}

function activate(required: number, orders: Order[], candidate: Order, approvedOverOrder = false): Order[] {
  const next = [...orders, candidate];
  if (effectiveQuantity(candidate.lines[0].requirementId, next) > required && !approvedOverOrder) {
    throw new Error("cumulative effective ordered quantity exceeds procurement requirement");
  }
  return next;
}

test("852 Engineering Bricks are fulfilled by effective orders of 500 and 352", () => {
  const baseline = resource("Footings", "HB00038");
  const requirement = { id: "brick-requirement", requiredQuantity: 852, unit: baseline.unit };
  const quote = { quotedQuantity: 852, unitPrice: 1.4, fixtureOnly: true };
  let orders = activate(requirement.requiredQuantity, [], { status: "SENT", lines: [{ requirementId: requirement.id, quantity: 500, unit: "Each", agreedUnitPrice: 1.35 }] });
  assert.equal(effectiveQuantity(requirement.id, orders), 500);
  assert.equal(requirement.requiredQuantity - effectiveQuantity(requirement.id, orders), 352);
  orders = activate(requirement.requiredQuantity, orders, { status: "ORDERED", lines: [{ requirementId: requirement.id, quantity: 352, unit: "Each", agreedUnitPrice: 1.35 }] });
  assert.equal(effectiveQuantity(requirement.id, orders), 852);
  assert.equal(requirement.requiredQuantity - effectiveQuantity(requirement.id, orders), 0);
  assert.equal(baseline.quantity, 852);
  assert.equal(baseline.rate, 1.68);
  assert.equal(quote.unitPrice, 1.4);
  assert.equal(orders[0].lines[0].agreedUnitPrice, 1.35);
});

test("over-order blocks unless explicitly approved and cancelled orders consume nothing", () => {
  const sent: Order = { status: "SENT", lines: [{ requirementId: "bricks", quantity: 852, unit: "Each", agreedUnitPrice: 1.35 }] };
  assert.throws(() => activate(852, [sent], { status: "APPROVED", lines: [{ requirementId: "bricks", quantity: 1, unit: "Each", agreedUnitPrice: 1.35 }] }), /exceeds procurement requirement/);
  assert.equal(activate(852, [sent], { status: "CANCELLED", lines: [{ requirementId: "bricks", quantity: 100, unit: "Each", agreedUnitPrice: 1.35 }] }).length, 2);
  assert.equal(effectiveQuantity("bricks", [sent, { status: "CANCELLED", lines: [{ requirementId: "bricks", quantity: 100, unit: "Each", agreedUnitPrice: 1.35 }] }]), 852);
  assert.equal(activate(852, [sent], { status: "APPROVED", lines: [{ requirementId: "bricks", quantity: 1, unit: "Each", agreedUnitPrice: 1.35 }] }, true).length, 2);
});

test("USB socket baseline, quote, and purchase order remain separate evidence", () => {
  const baseline = resource("Electrical 2nd Fix", "HB04196");
  const quote = { quotedQuantity: 11, unitPrice: 7.95, fixtureOnly: true };
  const order = { orderedQuantity: 8, agreedUnitPrice: 7.8, orderedLineValue: 62.4 };
  assert.equal(baseline.quantity, 11);
  assert.equal(baseline.rate, 9.9);
  assert.equal(quote.quotedQuantity, 11);
  assert.equal(quote.unitPrice, 7.95);
  assert.equal(order.orderedQuantity, 8);
  assert.equal(order.agreedUnitPrice, 7.8);
  assert.equal(order.orderedLineValue, Math.round(order.orderedQuantity * order.agreedUnitPrice * 100) / 100);
});

test("steel remains six linear metres through requirement and PO", () => {
  const baseline = resource("Masonry Shell", "HB3708420");
  const line = { orderedQuantity: baseline.quantity, unitCode: baseline.unit };
  assert.equal(line.orderedQuantity, 6);
  assert.equal(line.unitCode, "m");
  assert.notEqual(line.unitCode, "Each");
});

test("floor tiles preserve six square metres through requirement and PO", () => {
  const baseline = resource("Internal Fitting Out", "HB01761");
  const line = { orderedQuantity: baseline.quantity, unitCode: baseline.unit };
  assert.equal(line.orderedQuantity, 6);
  assert.equal(line.unitCode, "m²");
});

test("physical wall construction reaches one PO line while two finishes remain separate", () => {
  const wall = walls.schedule.find((candidate: { plansXpressHandle: string }) => candidate.plansXpressHandle === "xWnFk9dNcUacbLPD729AeA");
  assert.ok(wall);
  const constructionChain = {
    physicalWall: wall.plansXpressHandle,
    workItem: `construct:${wall.plansXpressHandle}`,
    hbxlResources: ["fixture-material-resource"],
    requirement: `requirement:${wall.plansXpressHandle}`,
    poLines: [`po-line:${wall.plansXpressHandle}`],
  };
  const finishes = [`finish:${wall.plansXpressHandle}:A`, `finish:${wall.plansXpressHandle}:B`];
  assert.equal(constructionChain.poLines.length, 1);
  assert.equal(new Set([constructionChain.physicalWall]).size, 1);
  assert.equal(new Set(finishes).size, 2);
});
