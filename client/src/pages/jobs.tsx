import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import "./jobs.css";

interface ContractorAssignment {
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
}

export default function Jobs() {
  const contractorName = localStorage.getItem("contractorName") || "Dalwayne Diedericks";
  const contractorFirstName = contractorName.split(" ")[0];

  const { data: assignments = [], isLoading } = useQuery<ContractorAssignment[]>({
    queryKey: [`/api/contractor-assignments/${contractorFirstName}`],
    enabled: true,
  });

  const isForeman = contractorName.toLowerCase().includes("dalwayne") || contractorName.toLowerCase().includes("diedericks");
  const activeAssignments = assignments.filter((assignment) => assignment.status === "assigned").length;
  const completedAssignments = assignments.filter((assignment) => assignment.status === "completed").length;

  const getStatusClass = (status: string) => {
    switch (status) {
      case "assigned":
        return "jobs-status jobs-status--assigned";
      case "completed":
        return "jobs-status jobs-status--completed";
      default:
        return "jobs-status jobs-status--standard";
    }
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
            <strong>{activeAssignments}</strong>
            <span>Assigned</span>
          </div>
          <div>
            <strong>{completedAssignments}</strong>
            <span>Completed</span>
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
          <section className="jobs-list" aria-label="Current job assignments">
            {assignments.map((assignment) => (
              <article key={assignment.id} className="jobs-card">
                <div className="jobs-card__main">
                  <div className="jobs-card__title-row">
                    <div className="jobs-card__icon" aria-hidden="true">
                      <i className="fas fa-briefcase" />
                    </div>
                    <div className="jobs-card__title">
                      <h2>{assignment.hbxlJob || "Untitled Job"}</h2>
                      <p>{assignment.workLocation || "Location not set"}</p>
                    </div>
                  </div>

                  <div className="jobs-card__details">
                    <div className="jobs-detail jobs-detail--dates">
                      <span>Date window</span>
                      <strong>{assignment.startDate} to {assignment.endDate}</strong>
                    </div>

                    {assignment.buildPhases && assignment.buildPhases.length > 0 && (
                      <div className="jobs-detail jobs-detail--phases">
                        <span>Build phases</span>
                        <div className="jobs-phase-list">
                          {assignment.buildPhases.slice(0, 2).map((phase: string, idx: number) => (
                            <span key={idx} className="jobs-phase-chip">
                              {phase}
                            </span>
                          ))}
                          {assignment.buildPhases.length > 2 && (
                            <span className="jobs-more-chip">+{assignment.buildPhases.length - 2} more</span>
                          )}
                        </div>
                      </div>
                    )}

                    {assignment.specialInstructions && (
                      <div className="jobs-note">
                        <span>Note</span>
                        <p>{assignment.specialInstructions}</p>
                      </div>
                    )}
                  </div>
                </div>

                <aside className="jobs-card__actions">
                  <Badge className={getStatusClass(assignment.status)}>{assignment.status}</Badge>
                  <Button
                    size="sm"
                    className="jobs-button jobs-button--report"
                    onClick={() => {
                      window.location.href = `/assignment/${assignment.id}`;
                    }}
                  >
                    Quick Report
                  </Button>
                  <Button
                    size="sm"
                    className="jobs-button jobs-button--tasks"
                    onClick={() => window.location.href = "/task-progress"}
                  >
                    Tasks
                  </Button>
                </aside>
              </article>
            ))}
          </section>
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
