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
): RoomTaskSelection[] {
  const selectedTaskIdSet = new Set(selectedTaskIds);
  return locationIds.map((locationId) => ({
    locationId,
    taskIds: tasks
      .filter((task) => task.locationId === locationId && selectedTaskIdSet.has(task.id))
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
