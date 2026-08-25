export type ProcurementTimeFilter = "next-7-days" | "next-week" | "all-job";

export interface ProcurementAssignment {
  id: string;
  jobId: string | null;
  locationId: string | null;
  locationTaskId: string | null;
  startDate: string;
  endDate: string;
}

export interface ProcurementLocation {
  id: string;
  jobId: string;
  name: string;
}

export interface ProcurementLocationTask {
  id: string;
  jobId: string;
  locationId: string;
  workCategory: string;
  taskName: string;
  taskDescription: string | null;
  sourceReference?: string | null;
}

export interface RoomPackageProcurementChecklist {
  locationId: string;
  locationName: string;
  locationTaskId: string;
  workPackage: string;
  taskName: string;
  startDate: string;
  endDate: string;
  assignmentIds: string[];
  resources: string[];
}

interface ChecklistInput {
  jobId: string;
  assignments: ProcurementAssignment[];
  locations: ProcurementLocation[];
  tasks: ProcurementLocationTask[];
  filter: ProcurementTimeFilter;
  today?: Date | string;
}

export function buildRoomPackageProcurementChecklist({
  jobId,
  assignments,
  locations,
  tasks,
  filter,
  today = new Date(),
}: ChecklistInput): RoomPackageProcurementChecklist[] {
  const range = filter === "all-job" ? null : procurementDateRange(filter, today);
  const locationsById = new Map(locations.filter((location) => location.jobId === jobId).map((location) => [location.id, location]));
  const tasksById = new Map(tasks.filter((task) => task.jobId === jobId).map((task) => [task.id, task]));
  const checklists = new Map<string, RoomPackageProcurementChecklist>();

  for (const assignment of assignments) {
    if (assignment.jobId !== jobId || !assignment.locationId || !assignment.locationTaskId) continue;
    if (range && !assignmentOverlapsRange(assignment, range)) continue;

    const location = locationsById.get(assignment.locationId);
    const task = tasksById.get(assignment.locationTaskId);
    if (!location || !task || task.locationId !== location.id) continue;

    const existing = checklists.get(task.id);
    if (existing) {
      existing.assignmentIds.push(assignment.id);
      if (dateValue(assignment.startDate) < dateValue(existing.startDate)) existing.startDate = assignment.startDate;
      if (dateValue(assignment.endDate) > dateValue(existing.endDate)) existing.endDate = assignment.endDate;
      continue;
    }

    checklists.set(task.id, {
      locationId: location.id,
      locationName: location.name,
      locationTaskId: task.id,
      workPackage: task.workCategory,
      taskName: task.taskName,
      startDate: assignment.startDate,
      endDate: assignment.endDate,
      assignmentIds: [assignment.id],
      resources: extractWordResourceDescriptions(task.taskDescription),
    });
  }

  return Array.from(checklists.values()).sort((left, right) =>
    left.locationName.localeCompare(right.locationName)
      || left.workPackage.localeCompare(right.workPackage)
      || left.taskName.localeCompare(right.taskName));
}

export function extractWordResourceDescriptions(taskDescription: string | null | undefined): string[] {
  if (!taskDescription) return [];
  const lines = taskDescription.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headingIndex = lines.findIndex((line) => /^Resources(?:\s*\/\s*Specifications)?\s*:/i.test(line));
  if (headingIndex < 0) return [];

  const seen = new Set<string>();
  return lines.slice(headingIndex + 1).flatMap((line) => {
    const description = line.replace(/^\s*(?:\u2022|-)\s*/, "").trim();
    const key = description.toLocaleLowerCase();
    if (!description || seen.has(key)) return [];
    seen.add(key);
    return [description];
  });
}

function procurementDateRange(filter: Exclude<ProcurementTimeFilter, "all-job">, today: Date | string) {
  const todayValue = typeof today === "string" ? dateValue(today) : Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (!Number.isFinite(todayValue)) return { start: Number.NaN, end: Number.NaN };

  if (filter === "next-7-days") {
    return { start: todayValue, end: todayValue + 6 * DAY_MS };
  }

  const dayOfWeek = new Date(todayValue).getUTCDay();
  const daysUntilNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const start = todayValue + daysUntilNextMonday * DAY_MS;
  return { start, end: start + 6 * DAY_MS };
}

function assignmentOverlapsRange(assignment: ProcurementAssignment, range: { start: number; end: number }): boolean {
  const start = dateValue(assignment.startDate);
  const end = dateValue(assignment.endDate);
  return Number.isFinite(start) && Number.isFinite(end) && start <= end && start <= range.end && end >= range.start;
}

function dateValue(value: string): number {
  const normalized = value.trim();
  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  const british = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : british
      ? { year: Number(british[3]), month: Number(british[2]), day: Number(british[1]) }
      : null;
  if (!parts) return Number.NaN;

  const result = Date.UTC(parts.year, parts.month - 1, parts.day);
  const date = new Date(result);
  return date.getUTCFullYear() === parts.year && date.getUTCMonth() === parts.month - 1 && date.getUTCDate() === parts.day
    ? result
    : Number.NaN;
}

const DAY_MS = 24 * 60 * 60 * 1000;
