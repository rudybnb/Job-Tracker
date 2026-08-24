import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AssignmentStatusBadge } from "@/components/assignment-status-badge";
import {
  getWorkerAssignments,
  isStructuredAssignment,
  type WorkerAssignment,
  type WorkerAssignmentsResponse,
} from "@/lib/worker-assignment-tasks";
import "./jobs.css";

function groupAssignments(assignments: WorkerAssignment[]) {
  const groups = new Map<string, WorkerAssignment[]>();
  for (const assignment of assignments) {
    const key = isStructuredAssignment(assignment)
      ? `${assignment.jobId}:${assignment.locationId}`
      : assignment.id;
    groups.set(key, [...(groups.get(key) || []), assignment]);
  }
  return Array.from(groups.values());
}

export default function Jobs() {
  const contractorName = localStorage.getItem("contractorName") || "Dalwayne Diedericks";

  const { data, isLoading } = useQuery<WorkerAssignmentsResponse>({
    queryKey: ["/api/worker-assignments"],
    enabled: true,
  });
  const assignments = getWorkerAssignments(
    data?.assignments || [],
    data?.workerId || "",
    contractorName,
  );

  const isForeman = contractorName.toLowerCase().includes("dalwayne") || contractorName.toLowerCase().includes("diedericks");
  const assignmentGroups = groupAssignments(assignments);
  const completedGroups = assignmentGroups.filter((group) =>
    isStructuredAssignment(group[0])
      ? group.every((assignment) => assignment.status === "approved")
      : group[0].status === "completed",
  );
  const activeGroups = assignmentGroups.filter((group) => !completedGroups.includes(group));
  const activeRows = activeGroups.flat();
  const completedRows = completedGroups.flat();
  const approvedCount = assignments.filter((assignment) => assignment.status === "approved").length;

  const renderAssignmentGroup = (group: WorkerAssignment[]) => {
    const assignment = group[0];
    const structured = isStructuredAssignment(assignment);
    const counts = group.reduce<Record<string, number>>((result, row) => {
      result[row.status] = (result[row.status] || 0) + 1;
      return result;
    }, {});
    const approved = counts.approved || 0;

    return (
      <article key={`${assignment.id}:${group.length}`} className="jobs-card">
        <div className="jobs-card__main">
          <div className="jobs-card__title-row">
            <div className="jobs-card__icon" aria-hidden="true"><i className="fas fa-briefcase" /></div>
            <div className="jobs-card__title">
              <h2>{assignment.hbxlJob || "Untitled Job"}</h2>
              <p>{assignment.locationName || assignment.workLocation || "Location not set"}</p>
            </div>
          </div>

          <div className="jobs-card__details">
            <div className="jobs-detail jobs-detail--dates">
              <span>Date window</span>
              <strong>{assignment.startDate} to {assignment.endDate}</strong>
            </div>

            {structured ? (
              <div className="rounded-lg border-2 border-slate-500 bg-slate-950/60 p-3">
                <strong className="block text-base text-white">{approved} of {group.length} approved</strong>
                <div className="mt-2 flex flex-wrap gap-2 text-sm font-bold text-slate-200">
                  {Object.entries(counts).map(([status, count]) => (
                    <span key={status}>{count} {status.replaceAll("_", " ").toUpperCase()}</span>
                  ))}
                </div>
                <div className="mt-3 space-y-3">
                  {group.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-600 pt-3">
                      <strong className="text-white">{item.taskName || item.workCategory}</strong>
                      <AssignmentStatusBadge status={item.status} />
                      {item.status === "rework_required" && item.latestStatusEvent?.note && (
                        <p className="w-full rounded border-2 border-red-400 bg-red-950 p-2 font-semibold text-red-100">
                          Rework note: {item.latestStatusEvent.note}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {assignment.buildPhases?.length > 0 && (
                  <div className="jobs-detail jobs-detail--phases">
                    <span>Build phases</span>
                    <div className="jobs-phase-list">
                      {assignment.buildPhases.slice(0, 2).map((phase, idx) => <span key={idx} className="jobs-phase-chip">{phase}</span>)}
                      {assignment.buildPhases.length > 2 && <span className="jobs-more-chip">+{assignment.buildPhases.length - 2} more</span>}
                    </div>
                  </div>
                )}
                <Badge className="jobs-status jobs-status--standard">{assignment.status}</Badge>
              </>
            )}

            {assignment.specialInstructions && (
              <div className="jobs-note"><span>Note</span><p>{assignment.specialInstructions}</p></div>
            )}
          </div>
        </div>

        <aside className="jobs-card__actions">
          <Button size="sm" className="jobs-button jobs-button--report" onClick={() => { window.location.href = `/assignment/${assignment.id}`; }}>
            Quick Report
          </Button>
          <Button size="sm" className="jobs-button jobs-button--tasks" onClick={() => { window.location.href = `/task-progress?assignmentId=${encodeURIComponent(assignment.id)}`; }}>
            Tasks
          </Button>
        </aside>
      </article>
    );
  };

  if (isLoading) {
    return (
      <div className="jobs-shell jobs-shell--loading">
        <div className="jobs-loading-card" role="status" aria-live="polite">
          <span className="jobs-spinner" />
          <p>Loading assignments...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="jobs-shell">
      <header className="jobs-header">
        <div className="jobs-brand-block">
          <span className="jobs-brand-mark">
            <img src="/sculpt-projects-logo.png" alt="Sculpt Projects" />
          </span>
          <div>
            <p>Assigned work</p>
            <h1>Direct Job Assignments</h1>
            <span>Jobs are assigned to you directly.</span>
          </div>
        </div>

        <div className="jobs-metrics" aria-label="Assignment summary">
          <div>
            <strong>{assignments.length}</strong>
            <span>Total jobs</span>
          </div>
          <div>
            <strong>{activeRows.length}</strong>
            <span>Active work</span>
          </div>
          <div>
            <strong>{approvedCount + completedRows.filter((row) => !isStructuredAssignment(row)).length}</strong>
            <span>Approved</span>
          </div>
        </div>
      </header>

      <main className="jobs-workbench">
        {assignments.length === 0 ? (
          <section className="jobs-empty" aria-label="No assignments">
            <div className="jobs-empty__mark" aria-hidden="true">
              <i className="fas fa-briefcase" />
            </div>
            <div>
              <h2>No Assignments</h2>
              <p>You don&apos;t have any job assignments yet.</p>
            </div>
          </section>
        ) : (
          <>
            <section className="jobs-list" aria-label="Current job assignments">
              {activeGroups.map(renderAssignmentGroup)}
            </section>
            {completedGroups.length > 0 && (
              <details className="mt-6 rounded-xl border-2 border-emerald-700 bg-slate-900 p-4">
                <summary className="cursor-pointer text-lg font-extrabold text-emerald-200">
                  COMPLETED / APPROVED ({completedRows.length})
                </summary>
                <section className="jobs-list mt-4" aria-label="Completed and approved assignments">
                  {completedGroups.map(renderAssignmentGroup)}
                </section>
              </details>
            )}
          </>
        )}
      </main>

      <nav className="jobs-mobile-nav" aria-label="Jobs navigation">
        {isForeman ? (
          <div className="jobs-mobile-nav__grid jobs-mobile-nav__grid--four">
            <button type="button" onClick={() => window.location.href = "/"} data-testid="nav-dashboard">
              <i className="fas fa-home" />
              <span>Dashboard</span>
            </button>
            <button type="button" className="is-active" data-testid="nav-jobs">
              <i className="fas fa-briefcase" />
              <span>Jobs</span>
            </button>
            <button type="button" onClick={() => window.location.href = "/foreman"} data-testid="nav-foreman">
              <i className="fas fa-users" />
              <span>Assigned</span>
            </button>
            <button type="button" onClick={() => window.location.href = "/more"} data-testid="nav-more">
              <i className="fas fa-ellipsis-h" />
              <span>More</span>
            </button>
          </div>
        ) : (
          <div className="jobs-mobile-nav__grid jobs-mobile-nav__grid--three">
            <button type="button" onClick={() => window.location.href = "/"} data-testid="nav-dashboard">
              <i className="fas fa-home" />
              <span>Dashboard</span>
            </button>
            <button type="button" className="is-active" data-testid="nav-jobs">
              <i className="fas fa-briefcase" />
              <span>Jobs</span>
            </button>
            <button type="button" onClick={() => window.location.href = "/more"} data-testid="nav-more">
              <i className="fas fa-ellipsis-h" />
              <span>More</span>
            </button>
          </div>
        )}
      </nav>
    </div>
  );
}
