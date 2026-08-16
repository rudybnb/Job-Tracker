import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const wallSchedule = JSON.parse(readFileSync("reports/offline-project-model/patrick-brook-plansxpress-wall-schedule.json", "utf8"));
const surfaceReconciliation = JSON.parse(readFileSync("reports/offline-project-model/patrick-brook-plansxpress-wall-surface-reconciliation.json", "utf8"));
const estimatingAudit = JSON.parse(readFileSync("reports/offline-project-model/patrick-brook-plansxpress-estimating-status-audit.json", "utf8"));

test("Patrick Brook proves one physical wall per unique source Handle", () => {
  assert.equal(wallSchedule.schedule.length, 20);
  assert.equal(new Set(wallSchedule.schedule.map((wall: { plansXpressHandle: string }) => wall.plansXpressHandle)).size, 20);
  assert.deepEqual(wallSchedule.reconciliation, {
    ...wallSchedule.reconciliation,
    entityWallCount: 20,
    estimateWallCount: 20,
    matchedWalls: 20,
    unmatchedEntityWalls: 0,
    unmatchedEstimateWalls: 0,
    totalGrossAreaM2: 349.082,
    totalOpeningAreaM2: 45.363,
    totalNetAreaM2: 303.719,
    status: "MATCH",
  });
});

test("Patrick Brook preserves raw and stored estimator wall lengths", () => {
  const wallsWithAdjustedLength = wallSchedule.schedule.filter((wall: { rawLengthM: number; storedEstimateLengthM: number }) => wall.rawLengthM !== wall.storedEstimateLengthM);
  assert.ok(wallsWithAdjustedLength.length > 0);
  assert.equal(wallSchedule.reconciliation.totalRawEntityLengthM, 139.529);
  assert.equal(wallSchedule.reconciliation.totalStoredLengthM, 143.946);
  assert.equal(wallSchedule.reconciliation.totalLengthDeltaM, 4.417);
});

test("Patrick Brook opening evidence remains attached to source walls", () => {
  const openings = wallSchedule.schedule.flatMap((wall: { plansXpressHandle: string; openings: Array<Record<string, unknown>> }) =>
    wall.openings.map((opening) => ({ ...opening, parentWallHandle: wall.plansXpressHandle })),
  );
  assert.ok(openings.length > 0);
  assert.ok(openings.every((opening: { plansXpressHandle?: string; parentWallHandle?: string }) => opening.plansXpressHandle && opening.parentWallHandle));
  assert.ok(openings.some((opening: { type?: string }) => opening.type === "Structural opening"));
});

test("Patrick Brook proves the final wall-surface allocation counts", () => {
  const adjacency = surfaceReconciliation.adjacency;
  assert.equal(adjacency.wallSurfacesAllocatedToRooms, 23);
  assert.equal(adjacency.wallSurfacesAllocatedToExterior, 10);
  assert.equal(adjacency.wallSurfacesReviewRequired, 7);
  assert.equal(adjacency.wallSurfacesAllocatedToRooms + adjacency.wallSurfacesAllocatedToExterior + adjacency.wallSurfacesReviewRequired, 40);
});

test("Patrick Brook proves independent A and B surfaces for the example partition", () => {
  const wall = surfaceReconciliation.schedule.find(
    (candidate: { plansXpressHandle: string }) => candidate.plansXpressHandle === "xWnFk9dNcUacbLPD729AeA",
  );
  assert.ok(wall);
  assert.equal(wall.sideA.sideName, "Side A");
  assert.equal(wall.sideA.workArea, "Bedroom 3");
  assert.equal(wall.sideB.sideName, "Side B");
  assert.equal(wall.sideB.workArea, "Passage");
  assert.equal(wall.grossConstructionAreaM2, 8.4);
  assert.equal(wall.netConstructionAreaM2, 8.395);
});

test("Patrick Brook drawing entities map to the three approved estimating states", () => {
  assert.deepEqual(estimatingAudit.counts, {
    ...estimatingAudit.counts,
    topLevelEntities: 196,
    estimated: 126,
    nonEstimatedVisualOnly: 70,
    unknownReview: 0,
  });
  assert.equal(estimatingAudit.counts.estimated + estimatingAudit.counts.nonEstimatedVisualOnly + estimatingAudit.counts.unknownReview, estimatingAudit.counts.topLevelEntities);
  assert.deepEqual(estimatingAudit.unresolvedCases, []);
});
