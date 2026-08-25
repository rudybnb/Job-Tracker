export interface AssignmentDeskJob {
  id: string;
  name: string;
  location: string;
  clientName?: string;
  postcode?: string;
  notes?: string;
  phases?: string[];
}

export interface AssignmentLocationTask {
  id: string;
  locationId: string;
  workCategory: string;
  taskName: string;
  status: string;
}

export interface AssignmentConflictPerson {
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface ExistingStructuredAssignment {
  jobId?: string | null;
  locationId?: string | null;
  locationTaskId?: string | null;
  contractorName?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface StructuredAssignmentConflict {
  selectedAssigneeNames: string[];
  otherAssigneeNames: string[];
  isAlreadyAssignedToSelectedPerson: boolean;
  isAssignedToOtherPerson: boolean;
  isUnavailable: boolean;
}

export interface AssignmentWorkGroup<T extends AssignmentLocationTask = AssignmentLocationTask> {
  name: string;
  hasExplicitChildTasks: boolean;
  items: Array<T & { checkboxLabel: string }>;
}

export interface RoomTaskSelection {
  locationId: string;
  taskIds: string[];
}

export function findAssignmentJobById<T extends AssignmentDeskJob>(jobs: T[], selectedJobId: string): T | undefined {
  return jobs.find((job) => job.id === selectedJobId);
}

export function hasStructuredJobData(locations: unknown[], locationTasks: unknown[]): boolean {
  return locations.length > 0 && locationTasks.length > 0;
}

export function buildRoomAssignmentChecklist<T extends AssignmentLocationTask>(
  tasks: T[],
  locationId: string,
): AssignmentWorkGroup<T>[] {
  const grouped = new Map<string, T[]>();
  for (const task of tasks) {
    if (task.locationId !== locationId) continue;
    const group = grouped.get(task.workCategory) ?? [];
    group.push(task);
    grouped.set(task.workCategory, group);
  }

  return Array.from(grouped, ([name, items]) => {
    const isPackageOnly = items.length === 1 && items[0].taskName === name;
    return {
      name,
      hasExplicitChildTasks: !isPackageOnly,
      items: items.map((item) => ({
        ...item,
        checkboxLabel: isPackageOnly ? name : item.taskName,
      })),
    };
  });
}

export function buildRoomTaskSelections<T extends AssignmentLocationTask>(
  tasks: T[],
  locationIds: string[],
  selectedTaskIds: string[],
  unavailableTaskIds: Iterable<string> = [],
): RoomTaskSelection[] {
  const selectedTaskIdSet = new Set(selectedTaskIds);
  const unavailableTaskIdSet = new Set(unavailableTaskIds);
  return locationIds.map((locationId) => ({
    locationId,
    taskIds: tasks
      .filter((task) => task.locationId === locationId && selectedTaskIdSet.has(task.id) && !unavailableTaskIdSet.has(task.id))
      .map((task) => task.id),
  })).filter((selection) => selection.taskIds.length > 0);
}

export function toggleAllRoomTasks(currentTaskIds: string[], roomTaskIds: string[]): string[] {
  if (roomTaskIds.length === 0) return currentTaskIds;

  const currentTaskIdSet = new Set(currentTaskIds);
  const allRoomTasksSelected = roomTaskIds.every((taskId) => currentTaskIdSet.has(taskId));
  if (allRoomTasksSelected) {
    const roomTaskIdSet = new Set(roomTaskIds);
    return currentTaskIds.filter((taskId) => !roomTaskIdSet.has(taskId));
  }

  return Array.from(new Set([...currentTaskIds, ...roomTaskIds]));
}

export function formatAssignmentJobLabel(job: AssignmentDeskJob): string {
  const shortId = job.id.slice(0, 8);
  const isWordImport = job.notes?.includes("Imported from HBXL Word Quote:") ?? false;

  if (isWordImport) {
    return [job.name, "Structured Word", job.clientName, job.postcode || job.location, shortId]
      .filter(Boolean)
      .join(" — ");
  }

  if (job.phases && job.phases.length > 0) {
    return [job.clientName || job.name, "Legacy CSV", `${job.phases.length} phases`, shortId].join(" — ");
  }

  return [job.name, job.clientName, job.postcode || job.location, shortId].filter(Boolean).join(" — ");
}

function normalizeName(value?: string | null): string {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() || "";
}

function normalizeEmail(value?: string | null): string {
  return value?.trim().toLowerCase() || "";
}

function normalizePhone(value?: string | null): string {
  const digits = value?.replace(/\D/g, "") || "";
  if (digits.startsWith("0") && digits.length === 11) return `44${digits.slice(1)}`;
  return digits;
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = normalizeName(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function personMatchesAssignment(person: AssignmentConflictPerson, assignment: ExistingStructuredAssignment): boolean {
  const personName = normalizeName(person.name);
  const assignmentName = normalizeName(assignment.contractorName);
  const personEmail = normalizeEmail(person.email);
  const assignmentEmail = normalizeEmail(assignment.email);
  const personPhone = normalizePhone(person.phone);
  const assignmentPhone = normalizePhone(assignment.phone);

  return Boolean(
    (personName && assignmentName && personName === assignmentName)
      || (personEmail && assignmentEmail && personEmail === assignmentEmail)
      || (personPhone && assignmentPhone && personPhone === assignmentPhone),
  );
}

export function getStructuredAssignmentConflict(
  jobId: string,
  taskId: string,
  selectedPeople: AssignmentConflictPerson[],
  existingAssignments: ExistingStructuredAssignment[],
): StructuredAssignmentConflict {
  const matchingAssignments = existingAssignments.filter((assignment) =>
    assignment.jobId === jobId && assignment.locationTaskId === taskId,
  );
  const selectedAssigneeNames: string[] = [];
  const otherAssigneeNames: string[] = [];

  for (const assignment of matchingAssignments) {
    const assignmentName = assignment.contractorName?.trim() || "Assigned worker";
    const matchesSelectedPerson = selectedPeople.some((person) => personMatchesAssignment(person, assignment));
    if (matchesSelectedPerson) selectedAssigneeNames.push(assignmentName);
    else otherAssigneeNames.push(assignmentName);
  }

  const selected = uniqueNames(selectedAssigneeNames);
  const other = uniqueNames(otherAssigneeNames);

  return {
    selectedAssigneeNames: selected,
    otherAssigneeNames: other,
    isAlreadyAssignedToSelectedPerson: selected.length > 0,
    isAssignedToOtherPerson: other.length > 0,
    isUnavailable: selected.length > 0 || other.length > 0,
  };
}
