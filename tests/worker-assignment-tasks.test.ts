import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStructuredTasks,
  getSelectedAssignment,
  getStructuredRoomAssignments,
  getWorkerAssignments,
  saveStructuredTaskCompletion,
  type WorkerAssignment,
} from "../client/src/lib/worker-assignment-tasks";

function assignment(
  id: string,
  overrides: Partial<WorkerAssignment> = {},
): WorkerAssignment {
  return {
    id,
    contractorName: "Rudy Diedericks",
    workLocation: "Bathroom 1",
    hbxlJob: "Maureen",
    buildPhases: [],
    startDate: "08/10/2026",
    endDate: "16/10/2026",
    status: "assigned",
    createdAt: "2026-08-24T20:35:29.733Z",
    jobId: "maureen-job",
    locationId: "bathroom-1",
    locationName: "Bathroom 1",
    locationTaskId: `${id}-location-task`,
    workCategory: `${id} category`,
    taskName: `${id} task`,
    workerId: "rudy-worker",
    ...overrides,
  };
}

test("worker assignment selection uses the clicked ID and exact worker identity", () => {
  const assignments = [
    assignment("first"),
    assignment("clicked"),
    assignment("same-prefix", {
      contractorName: "Rudy Diedericks Jr",
      workerId: "other-worker",
    }),
    assignment("other-worker", {
      contractorName: "Ahmed Gouda",
      workerId: "ahmed-worker",
    }),
  ];

  assert.deepEqual(
    getWorkerAssignments(assignments, "rudy-worker", "Rudy Diedericks").map((row) => row.id),
    ["first", "clicked"],
  );
  assert.equal(
    getSelectedAssignment(assignments, "rudy-worker", "Rudy Diedericks", "clicked")?.id,
    "clicked",
  );
  assert.equal(
    getSelectedAssignment(assignments, "rudy-worker", "Rudy Diedericks", "other-worker"),
    undefined,
  );
});

test("structured room selection includes only assigned rows for the same worker, job, and room", () => {
  const selected = assignment("bath");
  const assignments = [
    selected,
    assignment("mixer"),
    assignment("other-room", {
      locationId: "ground-floor-lounge",
      locationName: "Ground Floor Lounge",
      workLocation: "Ground Floor Lounge",
    }),
    assignment("other-job", { jobId: "another-job" }),
    assignment("unassigned", { status: "completed" }),
    assignment("other-worker", {
      contractorName: "Ahmed Gouda",
      workerId: "ahmed-worker",
    }),
    assignment("legacy", { locationTaskId: null }),
  ];

  assert.deepEqual(
    getStructuredRoomAssignments(assignments, "rudy-worker", "Rudy Diedericks", selected)
      .map((row) => row.id),
    ["bath", "mixer"],
  );
});

test("structured assignment filtering requires worker ID even when the name matches", () => {
  const assignments = [
    assignment("owned", { workerId: "rudy-worker" }),
    assignment("wrong-id", { workerId: "ahmed-worker" }),
    assignment("missing-id", { workerId: undefined }),
    assignment("legacy", { jobId: null, locationId: null, locationTaskId: null }),
  ];

  assert.deepEqual(
    getWorkerAssignments(assignments, "rudy-worker", "Rudy Diedericks")
      .map((row) => row.id),
    ["owned", "legacy"],
  );
});

test("structured completion requires backend confirmation and rejects failed saves", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false }) as Response;
    await assert.rejects(
      saveStructuredTaskCompletion("assignment-1", true),
      /not saved/,
    );

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ completed: false }),
    }) as Response;
    await assert.rejects(
      saveStructuredTaskCompletion("assignment-1", true),
      /not confirmed/,
    );

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ completed: true }),
    }) as Response;
    await saveStructuredTaskCompletion("assignment-1", true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("structured tasks contain only assignment work items and persist against their source rows", () => {
  const roomAssignments = [
    assignment("bath", { taskName: "Bath Standard" }),
    assignment("mixer", { taskName: "Shower Mixer" }),
  ];
  const completed = new Map([["mixer", true]]);

  const tasks = buildStructuredTasks(roomAssignments, completed);

  assert.deepEqual(tasks.map((task) => ({
    assignmentId: task.assignmentId,
    taskId: task.taskId,
    title: task.title,
    area: task.area,
    status: task.status,
  })), [
    {
      assignmentId: "bath",
      taskId: "bath-location-task",
      title: "Bath Standard",
      area: "Bathroom 1",
      status: "not started",
    },
    {
      assignmentId: "mixer",
      taskId: "mixer-location-task",
      title: "Shower Mixer",
      area: "Bathroom 1",
      status: "completed",
    },
  ]);
});
