import assert from "node:assert/strict";
import test from "node:test";
import {
  getAssignmentsOwnedByWorker,
  resolveStructuredAssignmentWorkerId,
  type WorkerOwnedAssignment,
} from "../server/worker-task-ownership";

const workers = [
  {
    id: "rudy-worker",
    fullName: "Rudy Diedericks",
    email: "rudy@example.com",
    phone: "+447500000001",
  },
  {
    id: "ahmed-worker",
    fullName: "Ahmed Gouda",
    email: "ahmed@example.com",
    phone: "+447500000002",
  },
];

function assignment(
  id: string,
  overrides: Partial<WorkerOwnedAssignment> = {},
): WorkerOwnedAssignment {
  return {
    id,
    contractorName: "Rudy Diedericks",
    email: "rudy@example.com",
    phone: "+447500000001",
    jobId: "job-1",
    locationId: "room-1",
    locationTaskId: `${id}-task`,
    ...overrides,
  };
}

test("structured owner resolves to the canonical worker ID without using name", () => {
  assert.equal(
    resolveStructuredAssignmentWorkerId(
      assignment("renamed", { contractorName: "Old Display Name" }),
      workers,
    ),
    "rudy-worker",
  );
});

test("structured ownership fails closed for wrong, absent, or ambiguous identity linkage", () => {
  const ambiguousWorkers = [
    ...workers,
    { id: "duplicate", email: "rudy@example.com", phone: null },
  ];

  assert.equal(resolveStructuredAssignmentWorkerId(
    assignment("wrong", { email: "ahmed@example.com", phone: "+447500000002" }),
    workers,
  ), "ahmed-worker");
  assert.equal(resolveStructuredAssignmentWorkerId(
    assignment("absent", { email: null, phone: null }),
    workers,
  ), null);
  assert.equal(resolveStructuredAssignmentWorkerId(
    assignment("ambiguous"),
    ambiguousWorkers,
  ), null);
});

test("same-name structured rows with another worker ID are never returned", () => {
  const owned = getAssignmentsOwnedByWorker([
    assignment("owned"),
    assignment("same-name-wrong-owner", {
      email: "ahmed@example.com",
      phone: "+447500000002",
    }),
    assignment("legacy", {
      jobId: null,
      locationId: null,
      locationTaskId: null,
    }),
  ], workers[0], workers);

  assert.deepEqual(owned.map((row) => row.id), ["owned", "legacy"]);
  assert.equal(owned[0].workerId, "rudy-worker");
});
