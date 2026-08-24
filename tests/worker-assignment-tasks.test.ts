import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStructuredTasks,
  getSelectedAssignment,
  getStructuredRoomAssignments,
  getWorkerAssignments,
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
    ...overrides,
  };
}

test("worker assignment selection uses the clicked ID and exact worker identity", () => {
  const assignments = [
    assignment("first"),
    assignment("clicked"),
    assignment("same-prefix", { contractorName: "Rudy Diedericks Jr" }),
    assignment("other-worker", { contractorName: "Ahmed Gouda" }),
  ];

  assert.deepEqual(
    getWorkerAssignments(assignments, "Rudy Diedericks").map((row) => row.id),
    ["first", "clicked"],
  );
  assert.equal(
    getSelectedAssignment(assignments, "Rudy Diedericks", "clicked")?.id,
    "clicked",
  );
  assert.equal(
    getSelectedAssignment(assignments, "Rudy Diedericks", "other-worker"),
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
    assignment("other-worker", { contractorName: "Ahmed Gouda" }),
    assignment("legacy", { locationTaskId: null }),
  ];

  assert.deepEqual(
    getStructuredRoomAssignments(assignments, "Rudy Diedericks", selected)
      .map((row) => row.id),
    ["bath", "mixer"],
  );
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
