import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import "./admin-dashboard.css";
import "./hallmark-sweep.css";

interface Worker {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  workerType: string;
  isActive: boolean;
  assignedJobId?: string | null;
  assignedJobTitle?: string | null;
  assignedJobLocation?: string | null;
}

interface JobOption {
  id: string;
  title: string;
  location?: string;
  address?: string;
}

function LogoutButton() {
  const handleLogout = () => {
    localStorage.removeItem("userRole");
    localStorage.removeItem("isLoggedIn");
    window.location.href = "/login";
  };

  return (
    <button onClick={handleLogout} className="sculpt-button sculpt-button--ghost">
      Logout
    </button>
  );
}

export default function AdminWorkers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [showAvatarDropdown, setShowAvatarDropdown] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  const adminName = localStorage.getItem("adminName") || "Admin";
  const adminEmail = localStorage.getItem("adminEmail") || "admin@erbuildanddesign.co.uk";
  const adminInitials = adminName
    .split(" ")
    .map((name) => name[0])
    .join("")
    .slice(0, 2);

  // Fetch workers list
  const { data: workersList = [], isLoading, isError } = useQuery<Worker[]>({
    queryKey: ["/api/admin/workers"],
    refetchInterval: 15000,
  });

  // Fetch jobs for assignment dropdown
  const { data: jobsList = [] } = useQuery<JobOption[]>({
    queryKey: ["/api/jobs"],
  });

  // Create Worker Mutation
  const createMutation = useMutation({
    mutationFn: async (newWorkerData: any) => {
      const res = await apiRequest("POST", "/api/admin/workers", newWorkerData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/workers"] });
      closeModal();
    },
    onError: (err: any) => {
      let msg = "Failed to create worker";
      if (err?.message) {
        msg = err.message;
      }
      setFormError(msg);
    },
  });

  // Update Worker Mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/workers/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/workers"] });
      closeModal();
    },
    onError: (err: any) => {
      let msg = "Failed to update worker";
      if (err?.message) {
        msg = err.message;
      }
      setFormError(msg);
    },
  });

  const openAddModal = () => {
    setEditingWorker(null);
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setIsActive(true);
    setSelectedJobId("");
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (worker: Worker) => {
    setEditingWorker(worker);
    setFirstName(worker.firstName);
    setLastName(worker.lastName);
    setPhone(worker.phone || "");
    setEmail(worker.email || "");
    setIsActive(worker.isActive);
    setSelectedJobId(worker.assignedJobId || "");
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingWorker(null);
    setFormError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setFormError("First name and last name are required.");
      return;
    }
    if (!phone.trim()) {
      setFormError("Mobile number is required.");
      return;
    }

    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      isActive,
      jobId: selectedJobId || null,
    };

    if (editingWorker) {
      updateMutation.mutate({ id: editingWorker.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const toggleWorkerStatus = (worker: Worker) => {
    updateMutation.mutate({
      id: worker.id,
      data: { isActive: !worker.isActive },
    });
  };

  // Filter workers
  const filteredWorkers = workersList.filter((w) => {
    const matchesSearch =
      w.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.phone && w.phone.includes(searchTerm)) ||
      (w.assignedJobTitle && w.assignedJobTitle.toLowerCase().includes(searchTerm.toLowerCase()));

    if (statusFilter === "ACTIVE") return matchesSearch && w.isActive;
    if (statusFilter === "INACTIVE") return matchesSearch && !w.isActive;
    return matchesSearch;
  });

  const activeCount = workersList.filter((w) => w.isActive).length;
  const inactiveCount = workersList.length - activeCount;

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
            <img src="/sculpt-projects-logo.png" alt="Sculpt Projects Logo" />
          </span>
          <span>
            <strong>Sculpt Projects</strong>
            <small>Worker management</small>
          </span>
        </div>

        <nav className="sculpt-quicknav" aria-label="Primary admin sections">
          <button type="button" onClick={() => (window.location.href = "/admin")} className="sculpt-navlink">
            Dashboard
          </button>
          <button type="button" onClick={() => (window.location.href = "/job-assignments")} className="sculpt-navlink">
            Jobs
          </button>
          <button type="button" onClick={() => (window.location.href = "/live-clock-monitor")} className="sculpt-navlink">
            Live Monitor
          </button>
          <button type="button" className="sculpt-navlink is-active" aria-current="page">
            Workers
          </button>
          <button type="button" onClick={() => (window.location.href = "/payroll-overview")} className="sculpt-navlink">
            Payroll
          </button>
        </nav>

        <div className="sculpt-topbar__right">
          <div className="sculpt-online" aria-label="System online">
            <span /> Online
          </div>
          <button
            type="button"
            className="sculpt-button sculpt-button--menu"
            aria-expanded={showAvatarDropdown}
            onClick={() => setShowAvatarDropdown(!showAvatarDropdown)}
          >
            Menu
          </button>
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
              <span className="sculpt-status sculpt-status--bad" style={{ padding: "0.25rem 0.5rem", borderRadius: "4px" }}>
                Admin Access
              </span>
            </div>
            <div className="sculpt-mega__grid">
              <div className="sculpt-mega__group">
                <h2>Field Operations</h2>
                <button type="button" className="sculpt-menu-item" onClick={() => (window.location.href = "/admin")}>
                  <strong>Dashboard</strong>
                  <span>Admin operations overview</span>
                </button>
                <button type="button" className="sculpt-menu-item" onClick={() => (window.location.href = "/job-assignments")}>
                  <strong>Jobs</strong>
                  <span>Assignments and job allocation</span>
                </button>
                <button type="button" className="sculpt-menu-item" onClick={() => (window.location.href = "/live-clock-monitor")}>
                  <strong>Live Monitor</strong>
                  <span>Active workers and site clocking</span>
                </button>
              </div>
              <div className="sculpt-mega__group">
                <h2>People & Finance</h2>
                <button type="button" className="sculpt-menu-item sculpt-menu-item--gold" onClick={() => (window.location.href = "/admin/workers")}>
                  <strong>Workers</strong>
                  <span>Manage site workers and numbers</span>
                </button>
                <button type="button" className="sculpt-menu-item" onClick={() => (window.location.href = "/payroll-overview")}>
                  <strong>Payroll</strong>
                  <span>Time tracking and earnings</span>
                </button>
              </div>
            </div>
          </section>
        )}
      </header>

      <main className="sculpt-workbench">
        <section className="sculpt-hero" aria-labelledby="workers-page-title">
          <div className="sculpt-hero__copy">
            <p className="sculpt-kicker">PEOPLE & SITE PERSONNEL</p>
            <h1 id="workers-page-title">Worker Management</h1>
            <p>
              Manage daily-rate site workers, mobile phone numbers, active availability, and job site assignments.
            </p>
          </div>

          <div className="sculpt-hero__metrics" aria-label="Worker Directory Totals">
            <div>
              <span>{workersList.length}</span>
              <p>Total workers</p>
            </div>
            <div>
              <span>{activeCount}</span>
              <p>Active workers</p>
            </div>
            <div>
              <span>{inactiveCount}</span>
              <p>Inactive</p>
            </div>
          </div>
        </section>

        {/* Controls & Search Filter */}
        <section className="sculpt-panel" style={{ padding: "1.25rem", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
            <div style={{ display: "flex", gap: "1rem", flex: 1, minWidth: "280px" }}>
              <input
                type="text"
                placeholder="Search by worker name, phone or site..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.625rem 1rem",
                  background: "#111827",
                  border: "1px solid var(--sp-color-rule, #374151)",
                  borderRadius: "0.5rem",
                  color: "var(--sp-color-ink, #eeeae1)",
                  fontSize: "0.875rem",
                }}
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                style={{
                  padding: "0.625rem 1rem",
                  background: "#111827",
                  border: "1px solid var(--sp-color-rule, #374151)",
                  borderRadius: "0.5rem",
                  color: "var(--sp-color-ink, #eeeae1)",
                  fontSize: "0.875rem",
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Only</option>
                <option value="INACTIVE">Inactive Only</option>
              </select>
            </div>

            <button
              type="button"
              onClick={openAddModal}
              className="sculpt-button sculpt-button--gold"
              style={{
                fontWeight: 600,
                padding: "0.625rem 1.25rem",
                borderRadius: "0.5rem",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              + Add Worker
            </button>
          </div>
        </section>

        {/* Directory Grid */}
        <section className="sculpt-panel">
          <div className="sculpt-panel__head">
            <h2>Site Personnel Directory</h2>
            <span style={{ fontSize: "0.875rem", color: "var(--sp-color-muted, #9ca3af)" }}>
              Showing {filteredWorkers.length} of {workersList.length} workers
            </span>
          </div>

          <div className="sculpt-panel__body" style={{ padding: "1.25rem" }}>
            {isLoading ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "var(--sp-color-muted, #9ca3af)" }}>
                Loading worker directory...
              </div>
            ) : isError ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "#ef4444" }}>
                Error loading worker directory. Please refresh.
              </div>
            ) : filteredWorkers.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "var(--sp-color-muted, #9ca3af)" }}>
                No workers found matching your search.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                  gap: "1.25rem",
                }}
              >
                {filteredWorkers.map((worker) => (
                  <article
                    key={worker.id}
                    style={{
                      background: "var(--sp-color-surface, #1f2937)",
                      border: "1px solid var(--sp-color-rule, #374151)",
                      borderRadius: "0.75rem",
                      padding: "1.25rem",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, color: "var(--sp-color-ink, #eeeae1)" }}>
                            {worker.fullName}
                          </h3>
                          <span style={{ fontSize: "0.75rem", color: "var(--sp-color-accent, #d0b873)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            {worker.workerType.replace(/_/g, " ")}
                          </span>
                        </div>
                        <span
                          style={{
                            padding: "0.25rem 0.625rem",
                            borderRadius: "999px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            background: worker.isActive ? "rgba(16, 185, 129, 0.15)" : "rgba(107, 114, 128, 0.2)",
                            color: worker.isActive ? "#10b981" : "#9ca3af",
                            border: `1px solid ${worker.isActive ? "rgba(16, 185, 129, 0.3)" : "rgba(107, 114, 128, 0.3)"}`,
                          }}
                        >
                          {worker.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem", color: "var(--sp-color-ink-muted, #d1d5db)" }}>
                        <div>
                          <strong style={{ color: "var(--sp-color-muted, #9ca3af)", fontSize: "0.75rem", display: "block" }}>MOBILE NUMBER</strong>
                          <span>{worker.phone || "No phone number"}</span>
                        </div>

                        {worker.email && (
                          <div>
                            <strong style={{ color: "var(--sp-color-muted, #9ca3af)", fontSize: "0.75rem", display: "block" }}>EMAIL</strong>
                            <span>{worker.email}</span>
                          </div>
                        )}

                        <div>
                          <strong style={{ color: "var(--sp-color-muted, #9ca3af)", fontSize: "0.75rem", display: "block" }}>ASSIGNED SITE / JOB</strong>
                          <span style={{ color: worker.assignedJobTitle ? "var(--sp-color-ink, #eeeae1)" : "#6b7280" }}>
                            {worker.assignedJobTitle ? (
                              <>
                                {worker.assignedJobTitle}
                                {worker.assignedJobLocation && (
                                  <small style={{ display: "block", color: "var(--sp-color-muted, #9ca3af)" }}>
                                    {worker.assignedJobLocation}
                                  </small>
                                )}
                              </>
                            ) : (
                              "Unassigned"
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: "1.25rem",
                        paddingTop: "1rem",
                        borderTop: "1px solid var(--sp-color-rule, #374151)",
                        display: "flex",
                        justify: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleWorkerStatus(worker)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: worker.isActive ? "#f59e0b" : "#10b981",
                          fontSize: "0.875rem",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        {worker.isActive ? "Deactivate" : "Activate"}
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditModal(worker)}
                        style={{
                          background: "transparent",
                          border: "1px solid var(--sp-color-rule-strong, #4b5563)",
                          borderRadius: "0.375rem",
                          color: "var(--sp-color-ink, #eeeae1)",
                          padding: "0.375rem 0.75rem",
                          fontSize: "0.875rem",
                          cursor: "pointer",
                        }}
                      >
                        Edit Details
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Add / Edit Worker Modal Dialog */}
      {isModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "var(--sp-color-surface, #1f2937)",
              border: "1px solid var(--sp-color-rule-strong, #374151)",
              borderRadius: "0.75rem",
              width: "100%",
              maxWidth: "500px",
              padding: "1.5rem",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.6)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.25rem", color: "var(--sp-color-ink, #eeeae1)" }}>
                {editingWorker ? "Edit Worker Details" : "Add New Site Worker"}
              </h3>
              <button
                onClick={closeModal}
                style={{ background: "none", border: "none", color: "var(--sp-color-muted, #9ca3af)", fontSize: "1.5rem", cursor: "pointer" }}
              >
                &times;
              </button>
            </div>

            {formError && (
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  color: "#f87171",
                  padding: "0.75rem",
                  borderRadius: "0.5rem",
                  marginBottom: "1rem",
                  fontSize: "0.875rem",
                }}
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", color: "var(--sp-color-muted, #9ca3af)", marginBottom: "0.375rem" }}>
                    FIRST NAME *
                  </label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.625rem",
                      background: "#111827",
                      border: "1px solid var(--sp-color-rule, #374151)",
                      borderRadius: "0.375rem",
                      color: "var(--sp-color-ink, #eeeae1)",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", color: "var(--sp-color-muted, #9ca3af)", marginBottom: "0.375rem" }}>
                    LAST NAME *
                  </label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.625rem",
                      background: "#111827",
                      border: "1px solid var(--sp-color-rule, #374151)",
                      borderRadius: "0.375rem",
                      color: "var(--sp-color-ink, #eeeae1)",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--sp-color-muted, #9ca3af)", marginBottom: "0.375rem" }}>
                  MOBILE NUMBER * (UK or E.164 format)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 07123456789 or +447123456789"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.625rem",
                    background: "#111827",
                    border: "1px solid var(--sp-color-rule, #374151)",
                    borderRadius: "0.375rem",
                    color: "var(--sp-color-ink, #eeeae1)",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--sp-color-muted, #9ca3af)", marginBottom: "0.375rem" }}>
                  EMAIL (OPTIONAL)
                </label>
                <input
                  type="email"
                  placeholder="worker@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.625rem",
                    background: "#111827",
                    border: "1px solid var(--sp-color-rule, #374151)",
                    borderRadius: "0.375rem",
                    color: "var(--sp-color-ink, #eeeae1)",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--sp-color-muted, #9ca3af)", marginBottom: "0.375rem" }}>
                  ASSIGNED SITE / JOB
                </label>
                <select
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.625rem",
                    background: "#111827",
                    border: "1px solid var(--sp-color-rule, #374151)",
                    borderRadius: "0.375rem",
                    color: "var(--sp-color-ink, #eeeae1)",
                  }}
                >
                  <option value="">Unassigned</option>
                  {jobsList.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title} {job.location ? `(${job.location})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.5rem" }}>
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  style={{ width: "1.125rem", height: "1.125rem", accentColor: "var(--sp-color-accent, #d0b873)" }}
                />
                <label htmlFor="isActiveToggle" style={{ fontSize: "0.875rem", color: "var(--sp-color-ink, #eeeae1)", cursor: "pointer" }}>
                  Active Worker (Available for Check-In)
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{
                    padding: "0.625rem 1.25rem",
                    background: "transparent",
                    border: "1px solid var(--sp-color-rule-strong, #4b5563)",
                    borderRadius: "0.375rem",
                    color: "var(--sp-color-muted, #9ca3af)",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="sculpt-button sculpt-button--gold"
                  style={{
                    padding: "0.625rem 1.25rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "Saving..."
                    : editingWorker
                    ? "Update Worker"
                    : "Add Worker"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
