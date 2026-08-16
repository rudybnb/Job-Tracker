import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import "./admin-dashboard.css";

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

interface GPSPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

type MenuTone = "standard" | "gold" | "green" | "blue" | "purple" | "red";

interface MenuItem {
  label: string;
  description: string;
  route?: string;
  tone?: MenuTone;
  onSelect?: () => void;
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

function LogoutButton() {
  const handleLogout = () => {
    localStorage.clear();
    window.location.href = "/login";
    window.location.reload();
  };

  return (
    <Button onClick={handleLogout} size="sm" className="sculpt-button sculpt-button--danger">
      Logout
    </Button>
  );
}

export default function AdminDashboard() {
  const [currentTime, setCurrentTime] = useState("00:00:00");
  const [isTracking, setIsTracking] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [gpsPosition, setGpsPosition] = useState<GPSPosition | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"Good" | "Poor" | "Unavailable">("Good");
  const [showAvatarDropdown, setShowAvatarDropdown] = useState(false);
  const { toast } = useToast();

  const { data: pendingInspections = [] } = useQuery<PendingInspection[]>({
    queryKey: ["/api/pending-inspections"],
    refetchInterval: 30000,
  });

  const { data: contractorFixedInspections = [] } = useQuery<any[]>({
    queryKey: ["/api/contractor-fixed-inspections"],
    refetchInterval: 30000,
  });

  const { data: activeSessions = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/active-sessions"],
    refetchInterval: 10000,
  });

  const { data: todaySessionsData } = useQuery<{
    sessions: any[];
    dailySummary: any[];
    totalSessions: number;
    totalContractors: number;
  }>({
    queryKey: ["/api/admin/today-sessions"],
    refetchInterval: 60000,
  });

  const todaySessions = todaySessionsData?.sessions || [];
  const dailySummary = todaySessionsData?.dailySummary || [];

  const completeInspectionMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await apiRequest("POST", `/api/complete-inspection/${notificationId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pending-inspections"] });
      toast({
        title: "Inspection Completed",
        description: "The inspection has been marked as completed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to complete inspection",
        variant: "destructive",
      });
    },
  });

  const approveContractorFixMutation = useMutation({
    mutationFn: async (inspectionId: string) => {
      const response = await apiRequest("POST", `/api/contractor-fixed-inspections/${inspectionId}/approve`, {
        adminName: localStorage.getItem("adminName") || "Admin",
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contractor-fixed-inspections"] });
      toast({
        title: "Fix Approved",
        description: "Contractor fix has been approved and removed from review",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve contractor fix",
        variant: "destructive",
      });
    },
  });

  const sendOnboardingFormMutation = useMutation({
    mutationFn: async (data: { contractorName: string; contractorPhone?: string }) => {
      const response = await apiRequest("POST", "/api/send-onboarding-form", data);
      return response.json();
    },
    onSuccess: (result) => {
      if (result.success) {
        toast({
          title: "Onboarding Form Sent",
          description: `Sent to ${result.contractorId || "contractor"} via Telegram`,
          duration: 5000,
        });
      } else {
        toast({
          title: "Form Send Failed",
          description: result.error || "Failed to send onboarding form",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send onboarding form",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    setGpsPosition({
      latitude: 51.491179,
      longitude: 0.147781,
      accuracy: 14,
    });
    setGpsStatus("Good");
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isTracking && startTime) {
      interval = setInterval(() => {
        const now = new Date();
        const diff = now.getTime() - startTime.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        setCurrentTime(
          `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
        );
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTracking, startTime]);

  const adminName = localStorage.getItem("adminName") || "Admin";
  const adminEmail = localStorage.getItem("adminEmail") || "admin@erbuildanddesign.co.uk";
  const adminInitials = adminName
    .split(" ")
    .map((name) => name[0])
    .join("")
    .slice(0, 2);

  const handleStartWork = () => {
    if (!isTracking) {
      setIsTracking(true);
      setStartTime(new Date());
      toast({
        title: "Work Started",
        description: "GPS-verified time tracking activated",
      });
    } else {
      setIsTracking(false);
      setStartTime(null);
      setCurrentTime("00:00:00");
      toast({
        title: "Work Stopped",
        description: "Time tracking session ended",
      });
    }
  };

  const navigateTo = (route: string) => {
    setShowAvatarDropdown(false);
    window.location.href = route;
  };

  const announce = (title: string, description: string) => {
    setShowAvatarDropdown(false);
    toast({ title, description });
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case "Good":
        return "sculpt-status sculpt-status--good";
      case "Poor":
        return "sculpt-status sculpt-status--warn";
      default:
        return "sculpt-status sculpt-status--bad";
    }
  };

  const quickRoutes = [
    { label: "Jobs", route: "/job-assignments" },
    { label: "Live Monitor", route: "/live-clock-monitor" },
    { label: "Inspections", route: "/admin-inspections" },
    { label: "Jarvis Reviews", route: "/admin-jarvis-reviews" },
    { label: "Finance", route: "/contract-cashflow" },
  ];

  const operationsMenuGroups: MenuGroup[] = [
    {
      title: "Field Operations",
      items: [
        { label: "Jobs", description: "Assignments and job allocation", route: "/job-assignments", tone: "gold" },
        { label: "Live Monitor", description: "Active workers and site clocking", route: "/live-clock-monitor", tone: "green" },
        { label: "Site QR + GPS", description: "Geofencing, radius and QR generation", route: "/admin-site-checkin", tone: "green" },
        { label: "Admin", description: "Admin dashboard", route: "/admin", tone: "standard" },
        { label: "Upload Jobs", description: "Import job data", route: "/upload", tone: "blue" },
        {
          label: "HBXL Labour",
          description: "Open labour assignments",
          tone: "gold",
          onSelect: () => announce("HBXL Labour Assignments", "Opening labour assignments"),
        },
        {
          label: "Planning",
          description: "Hybrid planning system",
          tone: "gold",
          onSelect: () => announce("Planning System", "Opening hybrid planning system"),
        },
      ],
    },
    {
      title: "Inspections and Reviews",
      items: [
        { label: "Inspections", description: "Pending site milestones", route: "/admin-inspections", tone: "red" },
        { label: "Site Inspections", description: "Admin site inspection board", route: "/admin-site-inspections", tone: "red" },
        { label: "Applications", description: "Review contractor applications", route: "/admin-applications", tone: "green" },
        { label: "Jarvis Reviews", description: "Shadow review inbox", route: "/admin-jarvis-reviews", tone: "purple" },
      ],
    },
    {
      title: "People and Finance",
      items: [
        { label: "Workers", description: "Manage site workers and phone numbers", route: "/admin/workers", tone: "gold" },
        { label: "Onboarding", description: "Contractor onboarding flow", route: "/contractor-onboarding", tone: "gold" },
        { label: "Clean Onboarding", description: "Alternate contractor onboarding flow", route: "/contractor-onboarding-clean", tone: "blue" },
        { label: "Capture ID", description: "Contractor ID capture", route: "/contractor-id-capture", tone: "blue" },
        { label: "Payroll", description: "Time tracking and earnings", route: "/payroll-overview", tone: "green" },
        { label: "Budget Tracking", description: "Project budget overview", route: "/admin-budget-tracking", tone: "blue" },
        { label: "Contract Cashflow", description: "Financial applications and cashflow", route: "/contract-cashflow", tone: "green" },
        {
          label: "Project Cashflow",
          description: "Project cashflow management",
          tone: "blue",
          onSelect: () => announce("Project Cashflow", "Opening project cashflow management"),
        },
        {
          label: "CIS Payroll",
          description: "Open CIS payroll system",
          tone: "gold",
          onSelect: () => announce("CIS Payroll", "Opening CIS payroll system"),
        },
      ],
    },
    {
      title: "System",
      items: [
        { label: "Settings", description: "Admin settings", route: "/admin-settings", tone: "standard" },
        { label: "Cleanup", description: "System cleanup tools", route: "/system-cleanup", tone: "red" },
        {
          label: "Account Switch",
          description: "Switch account functionality",
          tone: "gold",
          onSelect: () => announce("Account Switching", "Switch account functionality"),
        },
        {
          label: "Export Archive",
          description: "Open export and archive tools",
          tone: "standard",
          onSelect: () => announce("Export & Archive", "Opening export and archive"),
        },
        {
          label: "James Preview",
          description: "Preview contractor interface",
          tone: "gold",
          onSelect: () => announce("Preview Interface", "Opening James's contractor interface"),
        },
        {
          label: "AI Agents",
          description: "AI agent management",
          tone: "gold",
          onSelect: () => announce("AI Agent Management", "Opening AI agent management"),
        },
        {
          label: "Accounting",
          description: "Accounting export tools",
          tone: "gold",
          onSelect: () => announce("Accounting Exports", "Opening accounting exports"),
        },
      ],
    },
  ];

  const reviewLoad = pendingInspections.length + contractorFixedInspections.length;

  return (
    <div className="sculpt-admin min-h-screen">
      {showAvatarDropdown && (
        <button
          type="button"
          aria-label="Close operations menu"
          className="sculpt-scrim"
          onClick={() => setShowAvatarDropdown(false)}
        />
      )}

      <header className="sculpt-topbar">
        <div className="sculpt-brand" aria-label="Sculpt Projects admin dashboard">
          <span className="sculpt-brand__mark">
            <img src="/sculpt-projects-logo.png" alt="" aria-hidden="true" />
          </span>
          <span>
            <strong>Sculpt Projects</strong>
            <small>Operations dashboard</small>
          </span>
        </div>

        <nav className="sculpt-quicknav" aria-label="Primary admin sections">
          {quickRoutes.map((item) => (
            <button key={item.label} type="button" onClick={() => navigateTo(item.route)} className="sculpt-navlink">
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sculpt-topbar__right">
          <div className="sculpt-online" aria-label="System online">
            <span /> Online
          </div>
          <Button
            type="button"
            className="sculpt-button sculpt-button--menu"
            aria-expanded={showAvatarDropdown}
            onClick={() => setShowAvatarDropdown(!showAvatarDropdown)}
          >
            Menu
          </Button>
          <div className="sculpt-avatar" aria-label={`Signed in as ${adminName}`}>
            {adminInitials}
          </div>
          <LogoutButton />
        </div>

        {showAvatarDropdown && (
          <section className="sculpt-mega" aria-label="Operations menu">
            <div className="sculpt-mega__identity">
              <div>
                <p>{adminName}</p>
                <span>{adminEmail}</span>
              </div>
              <Badge className="sculpt-status sculpt-status--bad">Admin Access</Badge>
            </div>
            <div className="sculpt-mega__grid">
              {operationsMenuGroups.map((group) => (
                <div key={group.title} className="sculpt-mega__group">
                  <h2>{group.title}</h2>
                  {group.items.map((item) => (
                    <button
                      key={`${group.title}-${item.label}`}
                      type="button"
                      className={`sculpt-menu-item sculpt-menu-item--${item.tone || "standard"}`}
                      onClick={() => (item.route ? navigateTo(item.route) : item.onSelect?.())}
                    >
                      <strong>{item.label}</strong>
                      <span>{item.description}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}
      </header>

      <main className="sculpt-workbench">
        <section className="sculpt-hero" aria-labelledby="admin-dashboard-title">
          <div className="sculpt-hero__copy">
            <p className="sculpt-kicker">ADMIN CONTROL ROOM</p>
            <h1 id="admin-dashboard-title">Site work, money, reviews. One surface.</h1>
            <p>
              Triage inspections, live labour, Jarvis review work, jobs and cashflow without leaving the dashboard.
            </p>
          </div>

          <div className="sculpt-hero__metrics" aria-label="Current operational totals">
            <div>
              <span>{activeSessions.length}</span>
              <p>Active now</p>
            </div>
            <div>
              <span>{reviewLoad}</span>
              <p>Review queue</p>
            </div>
            <div>
              <span>{todaySessionsData?.totalContractors ?? dailySummary.length}</span>
              <p>Contractors today</p>
            </div>
          </div>
        </section>

        <section className="sculpt-command-strip" aria-label="Primary actions">
          <Button className="sculpt-button sculpt-button--primary" onClick={() => navigateTo("/job-assignments")}>Jobs</Button>
          <Button className="sculpt-button sculpt-button--quiet" onClick={() => navigateTo("/live-clock-monitor")}>Live Monitor</Button>
          <Button className="sculpt-button sculpt-button--quiet" onClick={() => navigateTo("/admin-inspections")}>Inspections</Button>
          <Button className="sculpt-button sculpt-button--quiet" onClick={() => navigateTo("/admin-jarvis-reviews")}>Jarvis Reviews</Button>
          <Button className="sculpt-button sculpt-button--quiet" onClick={() => navigateTo("/admin-labour-verification")}>Time Verify</Button>
          <Button className="sculpt-button sculpt-button--quiet" onClick={() => navigateTo("/admin-labour-review")}>Labour Review</Button>
          <Button className="sculpt-button sculpt-button--quiet" onClick={() => navigateTo("/admin-commercial-finance")}>Commercial Finance</Button>
          <Button className="sculpt-button sculpt-button--quiet" onClick={() => navigateTo("/admin-bank-reconciliation")}>Bank Reconciliation</Button>
          <Button className="sculpt-button sculpt-button--quiet" onClick={() => navigateTo("/contract-cashflow")}>Cashflow</Button>
        </section>

        <section className="sculpt-board" aria-label="Live operations board">
          <article className="sculpt-panel sculpt-panel--gps">
            <div className="sculpt-panel__head">
              <div>
                <p>Device signal</p>
                <h2>GPS Status</h2>
              </div>
              <Badge className={getStatusClass(gpsStatus)}>{gpsStatus}</Badge>
            </div>
            <div className="sculpt-coordinate">
              {gpsPosition ? `${gpsPosition.latitude}, ${gpsPosition.longitude}` : "No GPS data"}
            </div>
            <dl className="sculpt-spec-list sculpt-spec-list--two">
              <div>
                <dt>Latitude</dt>
                <dd>{gpsPosition?.latitude || "Unknown"}</dd>
              </div>
              <div>
                <dt>Longitude</dt>
                <dd>{gpsPosition?.longitude || "Unknown"}</dd>
              </div>
              <div>
                <dt>Accuracy</dt>
                <dd>±{gpsPosition?.accuracy || 0} meters</dd>
              </div>
              <div>
                <dt>Clock</dt>
                <dd>{currentTime}</dd>
              </div>
            </dl>
            <Button className="sculpt-button sculpt-button--primary sculpt-button--full" onClick={handleStartWork}>
              {isTracking ? "Stop Work" : "Start Work"}
            </Button>
          </article>

          <article className="sculpt-panel sculpt-panel--monitor">
            <div className="sculpt-panel__head">
              <div>
                <p>Live monitor</p>
                <h2>Workers on site</h2>
              </div>
              <Badge className="sculpt-status sculpt-status--good">{activeSessions.length}</Badge>
            </div>
            <dl className="sculpt-spec-list sculpt-spec-list--three">
              <div>
                <dt>Today sessions</dt>
                <dd>{todaySessions.length}</dd>
              </div>
              <div>
                <dt>Total sessions</dt>
                <dd>{todaySessionsData?.totalSessions ?? todaySessions.length}</dd>
              </div>
              <div>
                <dt>Daily summary</dt>
                <dd>{dailySummary.length}</dd>
              </div>
            </dl>
            <div className="sculpt-live-list" aria-label="Active workers preview">
              {activeSessions.length > 0 ? (
                activeSessions.slice(0, 3).map((session: any, index: number) => (
                  <div key={session.id || index}>
                    <strong>{session.contractorName || session.contractor || "Active worker"}</strong>
                    <span>{session.jobTitle || session.job || "Live session"}</span>
                  </div>
                ))
              ) : (
                <p>No active workers clocked in.</p>
              )}
            </div>
            <Button className="sculpt-button sculpt-button--quiet sculpt-button--full" onClick={() => navigateTo("/live-clock-monitor")}>
              Open Live Monitor
            </Button>
          </article>
        </section>

        <section className="sculpt-review-grid" aria-label="Inspection review queues">
          <article className="sculpt-panel sculpt-panel--wide">
            <div className="sculpt-panel__head">
              <div>
                <p>Contractor fixes</p>
                <h2>Awaiting review</h2>
              </div>
              {contractorFixedInspections.length > 0 && (
                <Badge className="sculpt-status sculpt-status--warn">{contractorFixedInspections.length}</Badge>
              )}
            </div>

            {contractorFixedInspections.length > 0 ? (
              <div className="sculpt-review-list">
                {contractorFixedInspections.slice(0, 3).map((inspection: any) => (
                  <article key={inspection.id} className="sculpt-review-row sculpt-review-row--warm">
                    <div>
                      <div className="sculpt-row-meta">
                        <Badge className="sculpt-status sculpt-status--warn">Fixed</Badge>
                        <span>{new Date(inspection.createdAt).toLocaleDateString()}</span>
                      </div>
                      <h3>{inspection.inspectorName} inspection</h3>
                      <p>Assignment: {inspection.assignmentId.slice(0, 8)}...</p>
                      <p>
                        <strong>Original Issue:</strong> {inspection.safetyNotes || inspection.materialsIssues || inspection.progressComments}
                      </p>
                      {inspection.nextActions && inspection.nextActions.includes("Contractor fixed:") && (
                        <p className="sculpt-good-note">
                          <strong>Contractor Notes:</strong> {inspection.nextActions.replace("Contractor fixed: ", "")}
                        </p>
                      )}
                    </div>
                    <Button
                      onClick={() => approveContractorFixMutation.mutate(inspection.id)}
                      disabled={approveContractorFixMutation.isPending}
                      size="sm"
                      className="sculpt-button sculpt-button--resolve"
                    >
                      {approveContractorFixMutation.isPending ? "Approving" : "Resolve"}
                    </Button>
                  </article>
                ))}

                {contractorFixedInspections.length > 3 && (
                  <Button className="sculpt-button sculpt-button--quiet sculpt-button--full" onClick={() => navigateTo("/admin-site-inspections")}>
                    View All {contractorFixedInspections.length} Fixed Items
                  </Button>
                )}
              </div>
            ) : (
              <div className="sculpt-empty-state">
                <strong>No contractor fixes pending review.</strong>
                <span>The re-inspection lane is clear.</span>
              </div>
            )}
          </article>

          <article className="sculpt-panel sculpt-panel--wide">
            <div className="sculpt-panel__head">
              <div>
                <p>Site inspections</p>
                <h2>Milestones required</h2>
              </div>
              {pendingInspections.length > 0 && <Badge className="sculpt-status sculpt-status--bad">{pendingInspections.length}</Badge>}
            </div>

            {pendingInspections.length === 0 ? (
              <div className="sculpt-empty-state">
                <strong>No pending site inspections.</strong>
                <span>All milestones are up to date.</span>
              </div>
            ) : (
              <div className="sculpt-review-list">
                {pendingInspections.slice(0, 3).map((inspection) => (
                  <article key={inspection.id} className="sculpt-review-row">
                    <div>
                      <div className="sculpt-row-meta">
                        <Badge className="sculpt-status sculpt-status--gold">
                          {inspection.notificationType === "50_percent_ready" ? "50%" : "100%"}
                        </Badge>
                        <span>{inspection.inspectionType}</span>
                      </div>
                      <h3>{inspection.jobTitle}</h3>
                      <p>{inspection.contractorName} · {inspection.jobLocation}</p>
                    </div>
                    <div className="sculpt-row-actions">
                      <Button
                        size="sm"
                        className="sculpt-button sculpt-button--quiet"
                        onClick={() => {
                          toast({
                            title: "Site Inspection",
                            description: "Inspection details recorded",
                          });
                        }}
                      >
                        View
                      </Button>
                      <Button
                        size="sm"
                        className="sculpt-button sculpt-button--resolve"
                        onClick={() => completeInspectionMutation.mutate(inspection.id)}
                        disabled={completeInspectionMutation.isPending}
                      >
                        Done
                      </Button>
                    </div>
                  </article>
                ))}

                {pendingInspections.length > 3 && (
                  <Button className="sculpt-button sculpt-button--quiet sculpt-button--full" onClick={() => navigateTo("/admin-inspections")}>
                    View All {pendingInspections.length} Inspections
                  </Button>
                )}
              </div>
            )}
          </article>
        </section>

        <section className="sculpt-finance" aria-label="Financial information">
          <div>
            <p>Financial controls</p>
            <h2>Cashflow, budgets and payroll stay in reach.</h2>
          </div>
          <div className="sculpt-finance__actions">
            <Button className="sculpt-button sculpt-button--quiet" onClick={() => navigateTo("/admin-budget-tracking")}>Budget Tracking</Button>
            <Button className="sculpt-button sculpt-button--quiet" onClick={() => navigateTo("/contract-cashflow")}>Contract Cashflow</Button>
            <Button className="sculpt-button sculpt-button--quiet" onClick={() => navigateTo("/payroll-overview")}>Payroll</Button>
          </div>
        </section>
      </main>

      <footer className="sculpt-footer">
        <span>Sculpt Projects Admin</span>
        <span>Jobs · Monitor · Inspections · Reviews · Finance</span>
        <span>{sendOnboardingFormMutation.isPending ? "Onboarding send in progress" : "Operational surface"}</span>
      </footer>

      <nav className="sculpt-mobile-nav" aria-label="Mobile admin navigation">
        <button type="button" className="is-active" onClick={() => navigateTo("/admin")}>Home</button>
        <button type="button" onClick={() => navigateTo("/job-assignments")}>Jobs</button>
        <button type="button" onClick={() => navigateTo("/live-clock-monitor")}>Live</button>
        <button type="button" onClick={() => navigateTo("/admin-inspections")}>Inspect</button>
        <button type="button" onClick={() => navigateTo("/contract-cashflow")}>Money</button>
      </nav>
    </div>
  );
}
