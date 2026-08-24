export interface AssignmentOwnerCandidate {
  id: string;
  email?: string | null;
  phone?: string | null;
}

export interface WorkerOwnedAssignment {
  id: string;
  contractorName: string;
  email?: string | null;
  phone?: string | null;
  jobId?: string | null;
  locationId?: string | null;
  locationTaskId?: string | null;
}

function normalizeEmail(value?: string | null): string {
  return value?.trim().toLowerCase() || "";
}

function normalizePhone(value?: string | null): string {
  const digits = value?.replace(/\D/g, "") || "";
  if (digits.startsWith("0") && digits.length === 11) return `44${digits.slice(1)}`;
  return digits;
}

export function isStructuredWorkerAssignment(
  assignment: WorkerOwnedAssignment,
): boolean {
  return Boolean(assignment.jobId && assignment.locationId && assignment.locationTaskId);
}

export function resolveStructuredAssignmentWorkerId(
  assignment: WorkerOwnedAssignment,
  workers: AssignmentOwnerCandidate[],
): string | null {
  if (!isStructuredWorkerAssignment(assignment)) return null;

  const email = normalizeEmail(assignment.email);
  const phone = normalizePhone(assignment.phone);
  if (!email && !phone) return null;

  const matches = workers.filter((worker) => {
    const emailMatches = email && normalizeEmail(worker.email) === email;
    const phoneMatches = phone && normalizePhone(worker.phone) === phone;
    return Boolean(emailMatches || phoneMatches);
  });

  return matches.length === 1 ? matches[0].id : null;
}

export function getAssignmentsOwnedByWorker<T extends WorkerOwnedAssignment>(
  assignments: T[],
  authenticatedWorker: AssignmentOwnerCandidate & { fullName: string },
  workers: AssignmentOwnerCandidate[],
): Array<T & { workerId?: string }> {
  return assignments.flatMap((assignment) => {
    if (!isStructuredWorkerAssignment(assignment)) {
      return assignment.contractorName.trim() === authenticatedWorker.fullName.trim()
        ? [assignment]
        : [];
    }

    const workerId = resolveStructuredAssignmentWorkerId(assignment, workers);
    return workerId === authenticatedWorker.id
      ? [{ ...assignment, workerId }]
      : [];
  });
}
