import type { TaskProgressData } from "./task-progress-manager";

export interface WorkerAssignment {
  id: string;
  contractorName: string;
  workLocation: string;
  hbxlJob: string;
  buildPhases: string[];
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
  specialInstructions?: string;
  jobId?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  locationTaskId?: string | null;
  workCategory?: string | null;
  taskName?: string | null;
  workerId?: string;
  latestStatusEvent?: {
    fromStatus: string;
    toStatus: string;
    actorType: string;
    actorId: string | null;
    note: string | null;
    createdAt: string;
  } | null;
}

export interface WorkerAssignmentsResponse {
  workerId: string;
  assignments: WorkerAssignment[];
}

export function getWorkerAssignments(
  assignments: WorkerAssignment[],
  workerId: string,
  contractorName: string,
): WorkerAssignment[] {
  return assignments.filter((assignment) => {
    if (isStructuredAssignment(assignment)) {
      return Boolean(workerId) && assignment.workerId === workerId;
    }

    return assignment.contractorName.trim() === contractorName.trim();
  });
}

export function getSelectedAssignment(
  assignments: WorkerAssignment[],
  workerId: string,
  contractorName: string,
  assignmentId: string | null,
): WorkerAssignment | undefined {
  const workerAssignments = getWorkerAssignments(assignments, workerId, contractorName);

  if (assignmentId) {
    return workerAssignments.find((assignment) => assignment.id === assignmentId);
  }

  return workerAssignments.find((assignment) => assignment.status === "assigned")
    ?? workerAssignments[0];
}

export function isStructuredAssignment(
  assignment: WorkerAssignment | undefined,
): assignment is WorkerAssignment & {
  jobId: string;
  locationId: string;
  locationTaskId: string;
} {
  return Boolean(
    assignment?.jobId && assignment.locationId && assignment.locationTaskId,
  );
}

export function getStructuredRoomAssignments(
  assignments: WorkerAssignment[],
  workerId: string,
  contractorName: string,
  selectedAssignment: WorkerAssignment | undefined,
): WorkerAssignment[] {
  if (!isStructuredAssignment(selectedAssignment)) return [];

  return getWorkerAssignments(assignments, workerId, contractorName).filter(
    (assignment) =>
      assignment.jobId === selectedAssignment.jobId
      && assignment.locationId === selectedAssignment.locationId
      && Boolean(assignment.locationTaskId),
  );
}

export function buildStructuredTasks(
  assignments: WorkerAssignment[],
): TaskProgressData[] {
  return assignments.map((assignment) => {
    const completed = assignment.status === "approved";
    const title = assignment.taskName || assignment.workCategory || "Assigned work";

    return {
      id: assignment.locationTaskId!,
      taskId: assignment.locationTaskId!,
      assignmentId: assignment.id,
      title,
      description: title,
      area: assignment.locationName || assignment.workLocation || "Assigned room",
      totalItems: 1,
      completedItems: completed ? 1 : 0,
      status: completed ? "completed" : "not started",
      completed,
      lifecycleStatus: assignment.status,
      statusNote: assignment.latestStatusEvent?.note || null,
    };
  });
}
