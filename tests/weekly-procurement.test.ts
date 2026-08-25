import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRoomPackageProcurementChecklist,
  extractWordResourceDescriptions,
  type ProcurementAssignment,
  type ProcurementLocation,
  type ProcurementLocationTask,
} from "../shared/weekly-procurement.ts";

const jobId = "maureen-job";
const bedroom3Id = "bedroom-3";
const bedroom4Id = "bedroom-4";

const locations: ProcurementLocation[] = [
  { id: bedroom3Id, jobId, name: "Second Floor Bedroom 3" },
  { id: bedroom4Id, jobId, name: "Second Floor Bedroom 4" },
];

const tasks: ProcurementLocationTask[] = [
  task("bedroom-3-fire-door", bedroom3Id, "Fire Door", ["Internal Fire Door FD30", "Door casing", "Architrave"]),
  task("bedroom-3-decoration", bedroom3Id, "Room Decoration", ["Decoration to wall or plaster", "Paint / primer"]),
  task("bedroom-3-flooring", bedroom3Id, "Solid Wood Flooring", ["Solid wood flooring", "Self levelling compound", "Solid floor underlay"]),
  task("bedroom-4-fire-door", bedroom4Id, "Fire Door", ["Bedroom 4 fire door", "Bedroom 4 hinges"]),
];

const assignments: ProcurementAssignment[] = [
  assignment("fire-door-assignment", "bedroom-3-fire-door", bedroom3Id, "06/10/2026", "08/10/2026"),
  assignment("decoration-assignment", "bedroom-3-decoration", bedroom3Id, "12/10/2026", "13/10/2026"),
  assignment("flooring-assignment", "bedroom-3-flooring", bedroom3Id, "12/10/2026", "16/10/2026"),
];

test("next 7 days uses assignment overlap and returns only exact Bedroom 3 package resources", () => {
  const checklist = buildRoomPackageProcurementChecklist({
    jobId,
    assignments,
    locations,
    tasks,
    filter: "next-7-days",
    today: "2026-10-06",
  });

  assert.deepEqual(checklist.map((item) => item.workPackage), ["Fire Door", "Room Decoration", "Solid Wood Flooring"]);
  assert.ok(checklist.every((item) => item.locationName === "Second Floor Bedroom 3"));
  assert.deepEqual(checklist.find((item) => item.workPackage === "Fire Door")?.resources, [
    "Internal Fire Door FD30",
    "Door casing",
    "Architrave",
  ]);
  assert.ok(checklist.flatMap((item) => item.resources).every((resource) => !resource.includes("Bedroom 4")));
  assert.ok(checklist.every((item) => !Object.hasOwn(item, "quantity") && !Object.hasOwn(item, "unitRate")));
});

test("next week means the following Monday through Sunday and assignment dates drive visibility", () => {
  const checklist = buildRoomPackageProcurementChecklist({
    jobId,
    assignments,
    locations,
    tasks,
    filter: "next-week",
    today: "2026-10-06",
  });

  assert.deepEqual(checklist.map((item) => item.workPackage), ["Room Decoration", "Solid Wood Flooring"]);
  assert.ok(!checklist.some((item) => item.workPackage === "Fire Door"));
});

test("all job includes every structured assignment while invalid or unrelated links are rejected", () => {
  const checklist = buildRoomPackageProcurementChecklist({
    jobId,
    assignments: [
      ...assignments,
      assignment("wrong-location-link", "bedroom-4-fire-door", bedroom3Id, "06/10/2026", "08/10/2026"),
      assignment("other-job", "bedroom-4-fire-door", bedroom4Id, "06/10/2026", "08/10/2026", "other-job"),
    ],
    locations,
    tasks,
    filter: "all-job",
  });

  assert.deepEqual(checklist.map((item) => item.locationTaskId), [
    "bedroom-3-fire-door",
    "bedroom-3-decoration",
    "bedroom-3-flooring",
  ]);
});

test("Word resource extraction requires the retained resource heading and does not parse quantities", () => {
  assert.deepEqual(extractWordResourceDescriptions("Install one door"), []);
  assert.deepEqual(extractWordResourceDescriptions("Resources / Specifications:\n• Hinges\n• Hinges\n- Intumescent strip"), [
    "Hinges",
    "Intumescent strip",
  ]);
});

function task(id: string, locationId: string, workCategory: string, resources: string[]): ProcurementLocationTask {
  return {
    id,
    jobId,
    locationId,
    workCategory,
    taskName: workCategory,
    taskDescription: `Resources / Specifications:\n${resources.map((resource) => `• ${resource}`).join("\n")}`,
    sourceReference: "HBXL_WORD",
  };
}

function assignment(
  id: string,
  locationTaskId: string,
  locationId: string,
  startDate: string,
  endDate: string,
  assignmentJobId = jobId,
): ProcurementAssignment {
  return { id, jobId: assignmentJobId, locationId, locationTaskId, startDate, endDate };
}
