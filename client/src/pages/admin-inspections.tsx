import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { CalendarDays, MapPin, User, AlertTriangle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import "./admin-inspections.css";

function LogoutButton() {
  const handleLogout = () => {
    localStorage.removeItem('userRole');
    localStorage.removeItem('isLoggedIn');
    window.location.href = '/login';
  };

  return (
    <div className="ai-logout">
      <div className="ai-logout__inner">
        <span className="ai-logout__role">Admin</span>
        <button type="button" onClick={handleLogout} className="ai-logout__button">
          Logout
        </button>
      </div>
    </div>
  );
}

interface PendingInspection {
  id: string;
  assignmentId: string;
  contractorName: string;
  notificationType: string;
  jobTitle: string;
  jobLocation: string;
  createdAt: string;
  inspectionType: string;
}

export default function AdminInspections() {
  const { toast } = useToast();
  const [showAvatarDropdown, setShowAvatarDropdown] = useState(false);

  const { data: pendingInspections = [], isLoading } = useQuery<PendingInspection[]>({
    queryKey: ["/api/pending-inspections"],
  });

  const completeInspectionMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await fetch(`/api/complete-inspection/${notificationId}`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to complete inspection");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pending-inspections"] });
      toast({
        title: "Inspection Completed",
        description: "The inspection has been marked as completed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to complete inspection",
        variant: "destructive",
      });
    },
  });

  const getStatusClass = (notificationType: string) => {
    return notificationType === "50_percent_ready" ? "ai-status ai-status--warn" : "ai-status ai-status--good";
  };

  const getNotificationLabel = (notificationType: string) => notificationType.replace('_', ' ').toUpperCase();

  const getIcon = (notificationType: string) => {
    return notificationType === "50_percent_ready" ? (
      <AlertTriangle className="ai-inspection-icon" aria-hidden="true" />
    ) : (
      <CheckCircle className="ai-inspection-icon" aria-hidden="true" />
    );
  };

  const adminName = localStorage.getItem('adminName') || 'Admin';
  const adminInitials = adminName.split(' ').map((name) => name[0]).join('').slice(0, 2) || 'AD';
  const fiftyPercentCount = pendingInspections.filter((inspection) => inspection.notificationType === "50_percent_ready").length;
  const finalInspectionCount = Math.max(pendingInspections.length - fiftyPercentCount, 0);

  if (isLoading) {
    return (
      <div className="ai-page">
        <InspectionTopbar
          adminInitials={adminInitials}
          adminName={adminName}
          showAvatarDropdown={showAvatarDropdown}
          setShowAvatarDropdown={setShowAvatarDropdown}
        />
        <main className="ai-shell">
          <section className="ai-hero" aria-labelledby="admin-inspections-title">
            <div>
              <p className="ai-kicker">Inspections</p>
              <h1 id="admin-inspections-title">Site milestones waiting for review.</h1>
              <span>Monitor job progress and complete required inspections at 50% and 100% milestones.</span>
            </div>
          </section>
          <div className="ai-empty ai-empty--loading">
            <div className="ai-spinner" aria-hidden="true"></div>
            <strong>Loading pending inspections...</strong>
          </div>
        </main>
        <InspectionMobileNav />
      </div>
    );
  }

  return (
    <div className="ai-page">
      <InspectionTopbar
        adminInitials={adminInitials}
        adminName={adminName}
        showAvatarDropdown={showAvatarDropdown}
        setShowAvatarDropdown={setShowAvatarDropdown}
      />

      <main className="ai-shell">
        <section className="ai-hero" aria-labelledby="admin-inspections-title">
          <div className="ai-hero__copy">
            <p className="ai-kicker">Inspections</p>
            <h1 id="admin-inspections-title">Site milestones waiting for review.</h1>
            <span>Monitor job progress and complete required inspections at 50% and 100% milestones.</span>
          </div>

          <div className="ai-metrics" aria-label="Inspection totals">
            <div>
              <strong>{pendingInspections.length}</strong>
              <span>Pending</span>
            </div>
            <div>
              <strong>{fiftyPercentCount}</strong>
              <span>50% checks</span>
            </div>
            <div>
              <strong>{finalInspectionCount}</strong>
              <span>Final reviews</span>
            </div>
          </div>
        </section>

        <section className="ai-panel" aria-labelledby="pending-inspections-title">
          <div className="ai-panel__head">
            <div>
              <p className="ai-kicker">Pending queue</p>
              <h2 id="pending-inspections-title">Admin Inspections</h2>
            </div>
            <span className="ai-count">{pendingInspections.length} open</span>
          </div>

          <div className="ai-panel__body">
            {pendingInspections.length === 0 ? (
              <div className="ai-empty">
                <div className="ai-empty__mark">
                  <CheckCircle aria-hidden="true" />
                </div>
                <div>
                  <h3>No Pending Inspections</h3>
                  <p>All current jobs are either below 50% completion or have completed their required inspections.</p>
                </div>
              </div>
            ) : (
              <div className="ai-inspection-list">
                {pendingInspections.map((inspection) => (
                  <article key={inspection.id} className="ai-inspection-card">
                    <div className="ai-inspection-card__head">
                      <div className="ai-inspection-title">
                        <div className="ai-inspection-mark">
                          {getIcon(inspection.notificationType)}
                        </div>
                        <div>
                          <h3>{inspection.inspectionType}</h3>
                          <p>Job: {inspection.jobTitle}</p>
                        </div>
                      </div>
                      <span className={getStatusClass(inspection.notificationType)}>
                        {getNotificationLabel(inspection.notificationType)}
                      </span>
                    </div>

                    <div className="ai-detail-grid">
                      <div>
                        <User aria-hidden="true" />
                        <span>Contractor</span>
                        <strong>{inspection.contractorName}</strong>
                      </div>
                      <div>
                        <MapPin aria-hidden="true" />
                        <span>Location</span>
                        <strong>{inspection.jobLocation}</strong>
                      </div>
                      <div>
                        <CalendarDays aria-hidden="true" />
                        <span>Triggered</span>
                        <strong>{new Date(inspection.createdAt).toLocaleDateString()}</strong>
                      </div>
                    </div>

                    <div className="ai-actions">
                      <button
                        onClick={() => completeInspectionMutation.mutate(inspection.id)}
                        disabled={completeInspectionMutation.isPending}
                        className="ai-button ai-button--success"
                      >
                        {completeInspectionMutation.isPending ? "Completing..." : "Mark Inspection Complete"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="ai-guide" aria-labelledby="inspection-guide-title">
          <div>
            <p className="ai-kicker">Workflow</p>
            <h2 id="inspection-guide-title">How It Works</h2>
          </div>
          <ul>
            <li><strong>50% Inspection:</strong> Triggered automatically when job reaches 50% completion</li>
            <li><strong>100% Inspection:</strong> Triggered when job is marked as fully complete</li>
            <li>Click "Mark Inspection Complete" to confirm the inspection has been done</li>
            <li>Use other admin tools for detailed site reports and quality assessments</li>
          </ul>
        </section>
      </main>

      <InspectionMobileNav />
    </div>
  );
}

function InspectionTopbar({
  adminInitials,
  adminName,
  showAvatarDropdown,
  setShowAvatarDropdown,
}: {
  adminInitials: string;
  adminName: string;
  showAvatarDropdown: boolean;
  setShowAvatarDropdown: (show: boolean) => void;
}) {
  return (
    <header className="ai-topbar">
      <div className="ai-brand" aria-label="Sculpt Projects admin dashboard">
        <div className="ai-brand__mark">
          <img src="/sculpt-projects-logo.png" alt="" aria-hidden="true" />
        </div>
        <div className="ai-brand__copy">
          <strong>Sculpt Projects</strong>
          <small>Operations dashboard</small>
        </div>
      </div>

      <nav className="ai-desktop-nav" aria-label="Primary admin sections">
        <button type="button" onClick={() => window.location.href = '/admin'}>Dashboard</button>
        <button type="button" onClick={() => window.location.href = '/job-assignments'}>Jobs</button>
        <button type="button" onClick={() => window.location.href = '/live-clock-monitor'}>Live</button>
        <button type="button" className="is-active" aria-current="page">Inspect</button>
        <button type="button" onClick={() => window.location.href = '/admin'}>Admin</button>
      </nav>

      <div className="ai-topbar__status">
        <span className="ai-online"><i aria-hidden="true"></i>Online</span>
        <button
          type="button"
          className="ai-menu-button"
          aria-expanded={showAvatarDropdown}
          onClick={() => setShowAvatarDropdown(!showAvatarDropdown)}
        >
          Menu
        </button>
        <button
          type="button"
          className="ai-avatar"
          aria-label={`Signed in as ${adminName}`}
          onClick={() => setShowAvatarDropdown(!showAvatarDropdown)}
        >
          {adminInitials}
        </button>
        <LogoutButton />

        {showAvatarDropdown && (
          <div className="ai-menu" role="menu">
            <div className="ai-menu__identity">
              <strong>{adminName}</strong>
              <span>Admin access</span>
            </div>
            <div className="ai-menu__items">
              <button type="button" onClick={() => window.location.href = '/admin'} className="ai-menu-item" role="menuitem">
                <i className="fas fa-tachometer-alt" aria-hidden="true"></i>
                <span>Admin Dashboard</span>
              </button>
              <button type="button" onClick={() => window.location.href = '/payroll-overview'} className="ai-menu-item" role="menuitem">
                <i className="fas fa-clock" aria-hidden="true"></i>
                <span>Time Tracking</span>
              </button>
              <button type="button" onClick={() => window.location.href = '/job-assignments'} className="ai-menu-item" role="menuitem">
                <i className="fas fa-tasks" aria-hidden="true"></i>
                <span>Job Assignments</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function InspectionMobileNav() {
  return (
    <nav className="ai-mobile-nav" aria-label="Primary">
      <div className="ai-mobile-nav__grid">
        <button type="button" onClick={() => window.location.href = '/admin'}>
          <i className="fas fa-home" aria-hidden="true"></i>
          <span>Dashboard</span>
        </button>
        <button type="button" onClick={() => window.location.href = '/job-assignments'}>
          <i className="fas fa-briefcase" aria-hidden="true"></i>
          <span>Jobs</span>
        </button>
        <button type="button" onClick={() => window.location.href = '/live-clock-monitor'}>
          <i className="fas fa-clock" aria-hidden="true"></i>
          <span>Live</span>
        </button>
        <button type="button" className="is-active" aria-current="page">
          <i className="fas fa-clipboard-check" aria-hidden="true"></i>
          <span>Inspect</span>
        </button>
        <button type="button" onClick={() => window.location.href = '/admin'}>
          <i className="fas fa-user-cog" aria-hidden="true"></i>
          <span>Admin</span>
        </button>
      </div>
    </nav>
  );
}
