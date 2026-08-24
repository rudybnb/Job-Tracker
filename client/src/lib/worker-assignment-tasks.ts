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
      assignment.status === "assigned"
      && assignment.jobId === selectedAssignment.jobId
      && assignment.locationId === selectedAssignment.locationId
      && Boolean(assignment.locationTaskId),
  );
}

export async function saveStructuredTaskCompletion(
  assignmentId: string,
  completed: boolean,
): Promise<void> {
  const response = await fetch(`/api/worker-task-progress/${encodeURIComponent(assignmentId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed }),
  });
  if (!response.ok) throw new Error("Task completion was not saved");

  const persisted = await response.json() as { completed?: boolean };
  if (persisted.completed !== completed) {
    throw new Error("Task completion was not confirmed");
  }
}

export function buildStructuredTasks(
  assignments: WorkerAssignment[],
  completedByAssignmentId: ReadonlyMap<string, boolean> = new Map(),
): TaskProgressData[] {
  return assignments.map((assignment) => {
    const completed = completedByAssignmentId.get(assignment.id) ?? false;
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
    };
  });
}
