import assert from "node:assert/strict";
import test from "node:test";
import {
  AssignmentLifecycleError,
  transitionStructuredAssignment,
  type AssignmentLifecycleRepository,
  type AssignmentLifecycleTransaction,
} from "../server/structured-assignment-lifecycle";

interface Assignment {
  id: string;
  contractorName: string;
  status: string;
  jobId: string | null;
  locationId: string | null;
  locationTaskId: string | null;
  email: string;
  phone: string;
}

function assignment(status = "assigned"): Assignment {
  return {
    id: "assignment-1",
    contractorName: "Rudy Diedericks",
    status,
    jobId: "job-1",
    locationId: "room-1",
    locationTaskId: "task-1",
    email: "rudy@example.com",
    phone: "+447500000001",
  };
}

class InMemoryLifecycleRepository implements AssignmentLifecycleRepository {
  assignments = new Map<string, Assignment>([["assignment-1", assignment()]]);
  events: any[] = [];
  failEventInsert = false;

  async transaction<T>(work: (tx: AssignmentLifecycleTransaction) => Promise<T>): Promise<T> {
    const assignmentsSnapshot = new Map(Array.from(this.assignments, ([id, row]) => [id, { ...row }]));
    const eventsSnapshot = this.events.map((event) => ({ ...event }));
    const tx: AssignmentLifecycleTransaction = {
      lockAssignment: async () => undefined,
      getAssignment: async (id) => this.assignments.get(id),
      updateAssignmentStatus: async (id, fromStatus, toStatus) => {
        const current = this.assignments.get(id);
        if (!current || current.status !== fromStatus) return undefined;
        const updated = { ...current, status: toStatus };
        this.assignments.set(id, updated);
        return updated;
      },
      insertEvent: async (event) => {
        if (this.failEventInsert) throw new Error("event insert failed");
        const created = { id: `event-${this.events.length + 1}`, ...event, createdAt: new Date() };
        this.events.push(created);
        return created;
      },
    };

    try {
      return await work(tx);
    } catch (error) {
      this.assignments = assignmentsSnapshot;
      this.events = eventsSnapshot;
      throw error;
    }
  }
}

const worker = {
  actorType: "worker" as const,
  actorId: "worker-1",
  ownsAssignment: () => true,
};

test("worker submits work and admin approval records authoritative transitions", async () => {
  const repository = new InMemoryLifecycleRepository();

  await transitionStructuredAssignment(repository, { assignmentId: "assignment-1", toStatus: "in_progress", ...worker });
  await transitionStructuredAssignment(repository, { assignmentId: "assignment-1", toStatus: "awaiting_approval", ...worker });
  await assert.rejects(
    transitionStructuredAssignment(repository, { assignmentId: "assignment-1", toStatus: "approved", ...worker }),
    (error: unknown) => error instanceof AssignmentLifecycleError && error.code === "INVALID_TRANSITION",
  );
  await transitionStructuredAssignment(repository, {
    assignmentId: "assignment-1",
    toStatus: "approved",
    actorType: "admin",
    actorId: "env-admin",
  });

  assert.equal(repository.assignments.get("assignment-1")?.status, "approved");
  assert.deepEqual(repository.events.map((event) => event.toStatus), [
    "in_progress",
    "awaiting_approval",
    "approved",
  ]);
  assert.equal(repository.events[2].actorId, "env-admin");
});

test("rework requires a note and returns through in progress to awaiting approval", async () => {
  const repository = new InMemoryLifecycleRepository();
  repository.assignments.set("assignment-1", assignment("awaiting_approval"));

  await assert.rejects(
    transitionStructuredAssignment(repository, {
      assignmentId: "assignment-1",
      toStatus: "rework_required",
      actorType: "admin",
      actorId: "admin-1",
    }),
    (error: unknown) => error instanceof AssignmentLifecycleError && error.code === "REWORK_NOTE_REQUIRED",
  );
  await transitionStructuredAssignment(repository, {
    assignmentId: "assignment-1",
    toStatus: "rework_required",
    actorType: "admin",
    actorId: "admin-1",
    note: "Seal the shower edge again.",
  });
  await transitionStructuredAssignment(repository, { assignmentId: "assignment-1", toStatus: "in_progress", ...worker });
  await transitionStructuredAssignment(repository, { assignmentId: "assignment-1", toStatus: "awaiting_approval", ...worker });

  assert.equal(repository.events[0].note, "Seal the shower edge again.");
  assert.equal(repository.assignments.get("assignment-1")?.status, "awaiting_approval");
});

test("another worker and invalid transitions are rejected without events", async () => {
  const repository = new InMemoryLifecycleRepository();

  await assert.rejects(
    transitionStructuredAssignment(repository, {
      assignmentId: "assignment-1",
      toStatus: "in_progress",
      actorType: "worker",
      actorId: "worker-2",
      ownsAssignment: () => false,
    }),
    (error: unknown) => error instanceof AssignmentLifecycleError && error.code === "ASSIGNMENT_NOT_FOUND",
  );
  await assert.rejects(
    transitionStructuredAssignment(repository, {
      assignmentId: "assignment-1",
      toStatus: "awaiting_approval",
      ...worker,
    }),
    (error: unknown) => error instanceof AssignmentLifecycleError && error.code === "INVALID_TRANSITION",
  );

  assert.equal(repository.assignments.get("assignment-1")?.status, "assigned");
  assert.equal(repository.events.length, 0);
});

test("event insert failure rolls back the status update", async () => {
  const repository = new InMemoryLifecycleRepository();
  repository.failEventInsert = true;

  await assert.rejects(
    transitionStructuredAssignment(repository, { assignmentId: "assignment-1", toStatus: "in_progress", ...worker }),
    /event insert failed/,
  );
  assert.equal(repository.assignments.get("assignment-1")?.status, "assigned");
  assert.equal(repository.events.length, 0);
});
