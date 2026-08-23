export interface AssignmentDeskJob {
  id: string;
  name: string;
  location: string;
  clientName?: string;
  postcode?: string;
  notes?: string;
  phases?: string[];
}

export function findAssignmentJobById<T extends AssignmentDeskJob>(jobs: T[], selectedJobId: string): T | undefined {
  return jobs.find((job) => job.id === selectedJobId);
}

export function hasStructuredJobData(locations: unknown[], locationTasks: unknown[]): boolean {
  return locations.length > 0 && locationTasks.length > 0;
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
