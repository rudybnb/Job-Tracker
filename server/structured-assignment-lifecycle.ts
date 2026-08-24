import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { jobAssignments, jobAssignmentStatusEvents } from "@shared/schema";

export const STRUCTURED_ASSIGNMENT_STATUSES = [
  "assigned",
  "in_progress",
  "awaiting_approval",
  "approved",
  "rework_required",
] as const;

export type StructuredAssignmentStatus = typeof STRUCTURED_ASSIGNMENT_STATUSES[number];
export type AssignmentStatusActorType = "worker" | "admin" | "system";

interface StructuredAssignmentRecord {
  id: string;
  contractorName: string;
  status: string;
  jobId: string | null;
  locationId: string | null;
  locationTaskId: string | null;
  email: string;
  phone: string;
}

export interface AssignmentStatusTransitionInput {
  assignmentId: string;
  toStatus: string;
  actorType: AssignmentStatusActorType;
  actorId: string | null;
  note?: string | null;
  ownsAssignment?: (assignment: StructuredAssignmentRecord) => boolean;
}

export interface AssignmentStatusTransitionResult {
  assignment: StructuredAssignmentRecord;
  event: {
    id: string;
    assignmentId: string;
    fromStatus: string;
    toStatus: string;
    actorType: string;
    actorId: string | null;
    note: string | null;
    createdAt: Date;
  };
}

export class AssignmentLifecycleError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export interface AssignmentLifecycleTransaction {
  lockAssignment(assignmentId: string): Promise<void>;
  getAssignment(assignmentId: string): Promise<StructuredAssignmentRecord | undefined>;
  updateAssignmentStatus(
    assignmentId: string,
    fromStatus: string,
    toStatus: StructuredAssignmentStatus,
  ): Promise<StructuredAssignmentRecord | undefined>;
  insertEvent(event: {
    assignmentId: string;
    fromStatus: string;
    toStatus: string;
    actorType: string;
    actorId: string | null;
    note: string | null;
  }): Promise<AssignmentStatusTransitionResult["event"]>;
}

export interface AssignmentLifecycleRepository {
  transaction<T>(work: (tx: AssignmentLifecycleTransaction) => Promise<T>): Promise<T>;
}

const workerTransitions: Record<string, readonly StructuredAssignmentStatus[]> = {
  assigned: ["in_progress"],
  in_progress: ["awaiting_approval"],
  rework_required: ["in_progress"],
};

const adminTransitions: Record<string, readonly StructuredAssignmentStatus[]> = {
  awaiting_approval: ["approved", "rework_required"],
};

export function assertStructuredAssignmentTransition(
  fromStatus: string,
  toStatus: string,
  actorType: AssignmentStatusActorType,
  note?: string | null,
): asserts toStatus is StructuredAssignmentStatus {
  if (!STRUCTURED_ASSIGNMENT_STATUSES.includes(toStatus as StructuredAssignmentStatus)) {
    throw new AssignmentLifecycleError("Unknown structured assignment status", 400, "INVALID_STATUS");
  }

  const allowed = actorType === "worker"
    ? workerTransitions[fromStatus]
    : actorType === "admin"
      ? adminTransitions[fromStatus]
      : undefined;
  if (!allowed?.includes(toStatus as StructuredAssignmentStatus)) {
    throw new AssignmentLifecycleError(
      `Transition ${fromStatus} -> ${toStatus} is not allowed for ${actorType}`,
      409,
      "INVALID_TRANSITION",
    );
  }

  if (toStatus === "rework_required" && !note?.trim()) {
    throw new AssignmentLifecycleError("A rework note is required", 400, "REWORK_NOTE_REQUIRED");
  }
}

export async function transitionStructuredAssignment(
  repository: AssignmentLifecycleRepository,
  input: AssignmentStatusTransitionInput,
): Promise<AssignmentStatusTransitionResult> {
  if (input.actorType !== "system" && !input.actorId) {
    throw new AssignmentLifecycleError("Authenticated actor required", 401, "ACTOR_REQUIRED");
  }

  return repository.transaction(async (tx) => {
    await tx.lockAssignment(input.assignmentId);
    const assignment = await tx.getAssignment(input.assignmentId);
    if (!assignment) {
      throw new AssignmentLifecycleError("Assignment not found", 404, "ASSIGNMENT_NOT_FOUND");
    }
    if (!assignment.jobId || !assignment.locationId || !assignment.locationTaskId) {
      throw new AssignmentLifecycleError("Assignment is not structured", 400, "NOT_STRUCTURED");
    }
    if (input.actorType === "worker" && !input.ownsAssignment?.(assignment)) {
      throw new AssignmentLifecycleError("Assignment not found", 404, "ASSIGNMENT_NOT_FOUND");
    }

    assertStructuredAssignmentTransition(
      assignment.status,
      input.toStatus,
      input.actorType,
      input.note,
    );

    const updated = await tx.updateAssignmentStatus(
      assignment.id,
      assignment.status,
      input.toStatus,
    );
    if (!updated) {
      throw new AssignmentLifecycleError("Assignment status changed concurrently", 409, "STATUS_CONFLICT");
    }

    const event = await tx.insertEvent({
      assignmentId: assignment.id,
      fromStatus: assignment.status,
      toStatus: input.toStatus,
      actorType: input.actorType,
      actorId: input.actorId,
      note: input.note?.trim() || null,
    });

    return { assignment: updated, event };
  });
}

export const databaseAssignmentLifecycleRepository: AssignmentLifecycleRepository = {
  transaction: (work) => db.transaction(async (databaseTx) => work({
    async lockAssignment(assignmentId) {
      await databaseTx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${assignmentId}))`);
    },
    async getAssignment(assignmentId) {
      const [assignment] = await databaseTx
        .select()
        .from(jobAssignments)
        .where(eq(jobAssignments.id, assignmentId));
      return assignment;
    },
    async updateAssignmentStatus(assignmentId, fromStatus, toStatus) {
      const [assignment] = await databaseTx
        .update(jobAssignments)
        .set({ status: toStatus, updatedAt: new Date() })
        .where(and(
          eq(jobAssignments.id, assignmentId),
          eq(jobAssignments.status, fromStatus),
        ))
        .returning();
      return assignment;
    },
    async insertEvent(event) {
      const [created] = await databaseTx
        .insert(jobAssignmentStatusEvents)
        .values(event)
        .returning();
      return created;
    },
  })),
};
