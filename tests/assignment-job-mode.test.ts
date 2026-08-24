import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRoomAssignmentChecklist,
  findAssignmentJobById,
  formatAssignmentJobLabel,
  hasStructuredJobData,
  type AssignmentDeskJob,
} from "../client/src/lib/assignment-job-mode";

const legacyMaureen: AssignmentDeskJob = {
  id: "bcc716b2-c6e0-43d9-ba64-3256a42e87fd",
  name: "Refurbishment",
  location: "London",
  clientName: "Maureen Orubebe",
  phases: Array.from({ length: 9 }, (_, index) => `Phase ${index + 1}`),
};

const structuredMaureen: AssignmentDeskJob = {
  id: "structured-maureen-2nd-floor",
  name: "2nd Floor",
  location: "London, NW9 5YZ",
  clientName: "Maureen Orubebe",
  postcode: "NW9 5YZ",
  notes: "Imported from HBXL Word Quote: maureen.docx",
};

const duplicateTitleMaureen: AssignmentDeskJob = {
  ...structuredMaureen,
  id: "another-2nd-floor-record",
};

test("legacy Maureen remains legacy when both structure collections are empty", () => {
  assert.equal(hasStructuredJobData([], []), false);
  assert.match(formatAssignmentJobLabel(legacyMaureen), /Maureen Orubebe — Legacy CSV — 9 phases — bcc716b2/);
});

test("structured Maureen requires both locations and location tasks", () => {
  assert.equal(hasStructuredJobData([{ id: "room" }], []), false);
  assert.equal(hasStructuredJobData([], [{ id: "task" }]), false);
  assert.equal(hasStructuredJobData([{ id: "room" }], [{ id: "task" }]), true);
  assert.match(formatAssignmentJobLabel(structuredMaureen), /2nd Floor — Structured Word — Maureen Orubebe — NW9 5YZ/);
});

test("Spencer work-package records satisfy structured mode", () => {
  const packageRecord = { workCategory: "Kitchen", taskName: "Kitchen" };
  assert.equal(hasStructuredJobData([{ id: "kitchen" }], [packageRecord]), true);
});

test("duplicate titles resolve independently by exact job ID", () => {
  const jobs = [structuredMaureen, duplicateTitleMaureen];

  assert.equal(findAssignmentJobById(jobs, structuredMaureen.id)?.id, structuredMaureen.id);
  assert.equal(findAssignmentJobById(jobs, duplicateTitleMaureen.id)?.id, duplicateTitleMaureen.id);
  assert.notEqual(formatAssignmentJobLabel(jobs[0]), formatAssignmentJobLabel(jobs[1]));
});

test("room checklist shows only assignable work for the exact selected room", () => {
  const tasks = [
    { id: "fire-door", locationId: "bedroom-3", workCategory: "Fire Door", taskName: "Fire Door", status: "pending" },
    { id: "decorate", locationId: "bedroom-3", workCategory: "Room Decoration", taskName: "Room Decoration", status: "pending" },
    { id: "floor", locationId: "bedroom-3", workCategory: "Solid Wood Flooring", taskName: "Solid Wood Flooring", status: "pending" },
    { id: "other-room", locationId: "bedroom-4", workCategory: "Domestic Carpeting", taskName: "Domestic Carpeting", status: "pending" },
  ];

  const checklist = buildRoomAssignmentChecklist(tasks, "bedroom-3");

  assert.deepEqual(checklist.map((group) => group.name), ["Fire Door", "Room Decoration", "Solid Wood Flooring"]);
  assert.deepEqual(checklist.flatMap((group) => group.items.map((item) => item.id)), ["fire-door", "decorate", "floor"]);
  assert.equal(checklist.every((group) => group.hasExplicitChildTasks === false), true);
});

test("packages with genuine child tasks expose children but not a whole-package checkbox", () => {
  const tasks = [
    { id: "prepare", locationId: "room", workCategory: "Room Decoration", taskName: "Prepare walls", status: "pending" },
    { id: "walls", locationId: "room", workCategory: "Room Decoration", taskName: "Paint walls", status: "pending" },
    { id: "ceiling", locationId: "room", workCategory: "Room Decoration", taskName: "Paint ceiling", status: "pending" },
  ];

  const [group] = buildRoomAssignmentChecklist(tasks, "room");

  assert.equal(group.name, "Room Decoration");
  assert.equal(group.hasExplicitChildTasks, true);
  assert.deepEqual(group.items.map((item) => item.checkboxLabel), ["Prepare walls", "Paint walls", "Paint ceiling"]);
  assert.equal(group.items.some((item) => item.checkboxLabel === "Room Decoration"), false);
  assert.equal(group.items.some((item) => /£|material|resource/i.test(item.checkboxLabel)), false);
});
