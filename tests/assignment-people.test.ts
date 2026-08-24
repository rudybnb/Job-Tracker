import assert from "node:assert/strict";
import test from "node:test";

import { buildAssignablePeople } from "../server/assignment-people.ts";
import type { WorkerWithAssignment } from "../server/worker-service.ts";

const activeWorkers: WorkerWithAssignment[] = [
  {
    id: "worker-mohamed",
    firstName: "Mohamed",
    lastName: "Shawky",
    fullName: "Mohamed Shawky",
    username: "mohamed.shawky",
    phone: "+447405619186",
    email: "mohamed.shawky@sculptprojects.co.uk",
    workerType: "DIRECT_SELF_EMPLOYED",
    isActive: true,
  },
  {
    id: "worker-ahmed",
    firstName: "Ahmed",
    lastName: "Gouda",
    fullName: "Ahmed Gouda",
    username: "ahmed.gouda",
    phone: "+447443003498",
    email: "ahmed.gouda@sculptprojects.co.uk",
    workerType: "DIRECT_SELF_EMPLOYED",
    isActive: true,
  },
  {
    id: "worker-rudy",
    firstName: "Rudy",
    lastName: "Diedericks",
    fullName: "Rudy Diedericks",
    username: "rudy.test",
    phone: "+447534251548",
    email: "rudybnb@yahoo.co.uk",
    workerType: "DIRECT_SELF_EMPLOYED",
    isActive: true,
    contractorId: "contractor-rudy",
  },
  {
    id: "stale-application-id",
    firstName: "Test",
    lastName: "Contractor",
    fullName: "Test Contractor",
    username: "test",
    phone: "07777777777",
    email: "test@example.com",
    workerType: "DIRECT_SELF_EMPLOYED",
    isActive: true,
  },
];

test("assignable people use persisted active workers and deduplicate contractor profiles", () => {
  const people = buildAssignablePeople(
    activeWorkers,
    new Set(["worker-mohamed", "worker-ahmed", "worker-rudy"]),
    [
      { id: "contractor-rudy", name: "Rudy BNB", email: "rudybnb@yahoo.co.uk", specialty: "General", status: "available" },
      { id: "contractor-electric", name: "Bright Sparks Ltd", email: "team@brightsparks.example", specialty: "Electrical", status: "available" },
      { id: "contractor-ahmed", name: "Ahmed Roofing Ltd", email: "team@ahmedroofing.example", specialty: "Roofing", status: "available" },
      { id: "contractor-inactive", name: "Unavailable Ltd", email: "off@example.test", specialty: "Joinery", status: "unavailable" },
    ],
  );

  assert.deepEqual(people.map((person) => person.name), [
    "Mohamed Shawky",
    "Ahmed Gouda",
    "Rudy Diedericks",
    "Bright Sparks Ltd",
    "Ahmed Roofing Ltd",
  ]);
  assert.deepEqual(people.map((person) => person.identity), [
    { type: "worker", id: "worker-mohamed" },
    { type: "worker", id: "worker-ahmed" },
    { type: "worker", id: "worker-rudy" },
    { type: "contractor", id: "contractor-electric" },
    { type: "contractor", id: "contractor-ahmed" },
  ]);
  assert.equal(people.some((person) => person.name === "Test Contractor"), false);
  assert.equal(people.some((person) => person.name === "Rudy BNB"), false);
  assert.deepEqual(people.find((person) => person.name === "Rudy Diedericks"), {
    identity: { type: "worker", id: "worker-rudy" },
    firstName: "Rudy",
    lastName: "Diedericks",
    name: "Rudy Diedericks",
    phone: "+447534251548",
    email: "rudybnb@yahoo.co.uk",
    trade: "DIRECT_SELF_EMPLOYED",
  });
});
