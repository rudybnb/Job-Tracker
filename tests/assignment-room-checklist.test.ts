import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const routesSource = readFileSync(path.join(repoRoot, "server", "routes.ts"), "utf8");
const pageSource = readFileSync(path.join(repoRoot, "client", "src", "pages", "create-assignment.tsx"), "utf8");

function extractBatchRoute(): string {
  const start = routesSource.indexOf('app.post("/api/assign-worker-tasks"');
  const end = routesSource.indexOf("// Assign worker to Job + Location + Task", start);
  assert.ok(start > -1, "batch room-assignment endpoint exists");
  assert.ok(end > start, "batch endpoint has a stable boundary");
  return routesSource.slice(start, end);
}

test("multi-room checklist replaces room and work-item dropdowns and submits selections once", () => {
  assert.doesNotMatch(pageSource, /Work Package \/ Specific Task \*/);
  assert.doesNotMatch(pageSource, /Select Location \/ Room\.\.\./);
  assert.match(pageSource, /Locations \/ Rooms \*/);
  assert.match(pageSource, /type="checkbox"/);
  assert.match(pageSource, /selectedRooms\.map/);
  assert.match(pageSource, /Select all work in this room/);
  assert.match(pageSource, /selectedLocationIds\.length/);
  assert.match(pageSource, /selectedTaskIds\.length/);
  assert.match(pageSource, /fetch\('\/api\/assign-worker-tasks'/);
  assert.match(pageSource, /selections:\s*roomTaskSelections/);
  assert.match(pageSource, /people:\s*selectedContractors\.map/);
});

test("Assignment Desk uses typed canonical people instead of onboarding applications", () => {
  assert.match(pageSource, /\/api\/assignment-desk\/assignable-people/);
  assert.doesNotMatch(pageSource, /\/api\/contractor-applications/);
  assert.match(pageSource, /type:\s*"worker" \| "contractor"/);
  assert.match(routesSource, /workerService\.listWorkers\(\)/);
  assert.match(routesSource, /buildAssignablePeople\(canonicalWorkers, activeWorkerIds, contractorProfiles\)/);
});

test("multi-room assignment is one transaction with exact room and task validation", () => {
  const route = extractBatchRoute();
  assert.equal(route.match(/await db\.transaction\(/g)?.length ?? 0, 1);
  assert.match(route, /eq\(jobLocationTasks\.jobId, jobId\)/);
  assert.match(route, /inArray\(jobLocationTasks\.locationId, locationIds\)/);
  assert.match(route, /inArray\(jobLocationTasks\.id, taskIds\)/);
  assert.match(route, /selectedTaskById\.get\(taskId\)\?\.locationId !== selection\.locationId/);
  assert.match(route, /selectedPeople\.flatMap/);
  assert.match(route, /selections\.flatMap/);
  assert.match(route, /selection\.taskIds\.map/);
  assert.match(route, /tx\.insert\(jobAssignments\)\.values\(assignmentRows\)/);
  assert.match(route, /tx\s*\.update\(jobLocationTasks\)/);
});

test("batch validates worker and contractor identity types against their own tables", () => {
  const route = extractBatchRoute();
  assert.match(route, /person\?\.type === "worker" \|\| person\?\.type === "contractor"/);
  assert.match(route, /inArray\(workers\.id, workerIds\)/);
  assert.match(route, /eq\(workers\.isActive, true\)/);
  assert.match(route, /eq\(workers\.isDeleted, false\)/);
  assert.match(route, /inArray\(contractors\.id, contractorIds\)/);
  assert.match(route, /inArray\(contractors\.status, \["available", "busy"\]\)/);
  assert.match(route, /contractors duplicate an active worker/);
  assert.match(route, /buildAssignablePeople\([\s\S]*canonicalWorkers/);
  assert.match(route, /assignedContractorId:\s*firstContractor\?\.id \|\| null/);
});

test("duplicate work-item guard runs before any assignment insert", () => {
  const route = extractBatchRoute();
  const duplicateLookup = route.indexOf("const existingAssignments =");
  const duplicateGuard = route.indexOf("if (existingAssignments.length > 0)");
  const insert = route.indexOf("tx.insert(jobAssignments)");

  assert.ok(duplicateLookup > -1);
  assert.ok(duplicateGuard > duplicateLookup);
  assert.ok(insert > duplicateGuard, "no assignment row is inserted before duplicate validation");
  assert.match(route, /pg_advisory_xact_lock/);
});

test("legacy CSV assignment remains on its existing build-phase path", () => {
  assert.match(pageSource, /Legacy CSV assignment mode/);
  assert.match(pageSource, /buildPhases:\s*selectedPhases/);
  assert.match(pageSource, /fetch\('\/api\/job-assignments'/);
});
