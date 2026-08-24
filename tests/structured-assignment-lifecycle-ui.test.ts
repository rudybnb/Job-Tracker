import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const taskPage = readFileSync(path.join(root, "client", "src", "pages", "task-progress.tsx"), "utf8");
const jobsPage = readFileSync(path.join(root, "client", "src", "pages", "jobs.tsx"), "utf8");
const adminPage = readFileSync(path.join(root, "client", "src", "pages", "job-assignments.tsx"), "utf8");
const routes = readFileSync(path.join(root, "server", "routes.ts"), "utf8");
const workerRoutes = readFileSync(path.join(root, "server", "worker-routes.ts"), "utf8");
const workerService = readFileSync(path.join(root, "server", "worker-service.ts"), "utf8");

test("worker structured UI uses server lifecycle and keeps legacy progress isolated", () => {
  assert.match(taskPage, /START WORK/);
  assert.match(taskPage, /MARK WORK DONE/);
  assert.match(taskPage, /AWAITING APPROVAL\. This work remains visible/);
  assert.match(taskPage, /Manager rework note/);
  assert.match(taskPage, /transitionStructuredTask\(task, "awaiting_approval"\)/);
  assert.doesNotMatch(taskPage, /\/api\/worker-task-progress/);
  assert.match(taskPage, /activeAssignment\.buildPhases/);
});

test("worker jobs UI exposes lifecycle badges, room counts, and collapsed approved work", () => {
  assert.match(jobsPage, /AssignmentStatusBadge/);
  assert.match(jobsPage, /of \{group\.length\} approved/);
  assert.match(jobsPage, /COMPLETED \/ APPROVED/);
  assert.match(jobsPage, /assignment\.status === "approved"/);
  assert.match(jobsPage, /group\.every\(\(assignment\) => assignment\.status === "approved"\)/);
  assert.match(jobsPage, /Rework note:/);
});

test("staff UI provides concise counts and authenticated approve or rework actions", () => {
  assert.match(adminPage, /Worker Progress & Approval/);
  assert.match(adminPage, /Awaiting Approval/);
  assert.match(adminPage, /REWORK REQUIRED/);
  assert.match(adminPage, /\/api\/admin\/structured-assignments/);
  assert.match(routes, /"\/api\/admin\/structured-assignments\/:assignmentId\/transition",[\s\S]*?requireAdmin/);
  assert.match(routes, /actorType: "admin"/);
  assert.match(routes, /actorType: "worker"/);
  assert.match(routes, /Structured task progress is managed by assignment status transitions/);
  assert.match(routes, /"\/api\/job-assignments",\s*requireAdmin[\s\S]*?Structured assignments must start as assigned/);
  assert.match(routes, /"\/api\/job-assignments\/:id",\s*requireAdmin[\s\S]*?Structured assignment lifecycle fields cannot be changed by the general update endpoint/);
  assert.match(routes, /A legacy assignment cannot be converted into a structured assignment/);
  assert.match(routes, /"\/api\/assign-worker-tasks",\s*requireAdmin/);
  assert.match(routes, /"\/api\/assign-worker-task",\s*requireAdmin/);
  assert.match(workerRoutes, /router\.use\(requireAdmin/);
  assert.match(workerService, /if \(a\.jobId && a\.locationId && a\.locationTaskId\) return false/);
  assert.match(workerService, /if \(!isStructuredAssignment && \(matchPhone \|\| matchName\)\)/);
});
