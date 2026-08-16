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

export default function AdminWorkers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

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
    <div className="ad-page">
      <header className="ad-topbar">
        <div className="ad-brand">
          <div className="ad-brand__mark">
            <img src="/sculpt-projects-logo.png" alt="" aria-hidden="true" />
          </div>
          <div className="ad-brand__copy">
            <strong>Sculpt Projects</strong>
            <small>Worker Management</small>
          </div>
        </div>

        <nav className="ad-desktop-nav">
          <button type="button" onClick={() => (window.location.href = "/admin")}>
            Dashboard
          </button>
          <button type="button" onClick={() => (window.location.href = "/job-assignments")}>
            Jobs
          </button>
          <button type="button" onClick={() => (window.location.href = "/live-clock-monitor")}>
            Live
          </button>
          <button type="button" className="is-active" aria-current="page">
            Workers
          </button>
          <button type="button" onClick={() => (window.location.href = "/payroll-overview")}>
            Time
          </button>
        </nav>
      </header>

      <main className="ad-shell">
        <section className="ad-hero">
          <div className="ad-hero__copy">
            <p className="ad-kicker">People & Operations</p>
            <h1>Worker Management</h1>
            <span>
              Manage site workers, contact numbers, active status, and site assignments.
            </span>
          </div>

          <div className="ad-metrics" style={{ display: "flex", gap: "1.5rem" }}>
            <div style={{ background: "#1f2937", padding: "1rem 1.5rem", borderRadius: "0.75rem", border: "1px solid #374151" }}>
              <strong style={{ fontSize: "1.75rem", color: "#d0b873" }}>{workersList.length}</strong>
              <span style={{ display: "block", fontSize: "0.875rem", color: "#9ca3af" }}>Total Workers</span>
            </div>
            <div style={{ background: "#1f2937", padding: "1rem 1.5rem", borderRadius: "0.75rem", border: "1px solid #374151" }}>
              <strong style={{ fontSize: "1.75rem", color: "#10b981" }}>{activeCount}</strong>
              <span style={{ display: "block", fontSize: "0.875rem", color: "#9ca3af" }}>Active Workers</span>
            </div>
            <div style={{ background: "#1f2937", padding: "1rem 1.5rem", borderRadius: "0.75rem", border: "1px solid #374151" }}>
              <strong style={{ fontSize: "1.75rem", color: "#6b7280" }}>{inactiveCount}</strong>
              <span style={{ display: "block", fontSize: "0.875rem", color: "#9ca3af" }}>Inactive</span>
            </div>
          </div>
        </section>

        {/* Controls & Filter Bar */}
        <section className="ad-panel" style={{ padding: "1.25rem", marginBottom: "1.5rem" }}>
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
                  border: "1px solid #374151",
                  borderRadius: "0.5rem",
                  color: "#eeeae1",
                  fontSize: "0.875rem",
                }}
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                style={{
                  padding: "0.625rem 1rem",
                  background: "#111827",
                  border: "1px solid #374151",
                  borderRadius: "0.5rem",
                  color: "#eeeae1",
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
              style={{
                background: "#d0b873",
                color: "#111827",
                fontWeight: 600,
                padding: "0.625rem 1.25rem",
                borderRadius: "0.5rem",
                border: "none",
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

        {/* Workers List / Cards Grid */}
        <section className="ad-panel">
          <div className="ad-panel__head">
            <h2>Site Personnel Directory</h2>
            <span style={{ fontSize: "0.875rem", color: "#9ca3af" }}>
              Showing {filteredWorkers.length} of {workersList.length} workers
            </span>
          </div>

          <div className="ad-panel__body" style={{ padding: "1.25rem" }}>
            {isLoading ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "#9ca3af" }}>
                Loading worker directory...
              </div>
            ) : isError ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "#ef4444" }}>
                Error loading worker directory. Please refresh.
              </div>
            ) : filteredWorkers.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "#9ca3af" }}>
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
                      background: "#1f2937",
                      border: "1px solid #374151",
                      borderRadius: "0.75rem",
                      padding: "1.25rem",
                      display: "flex",
                      flexDirection: "column",
                      justify: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, color: "#eeeae1" }}>
                            {worker.fullName}
                          </h3>
                          <span style={{ fontSize: "0.75rem", color: "#d0b873", textTransform: "uppercase", letterSpacing: "0.05em" }}>
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

                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem", color: "#d1d5db" }}>
                        <div>
                          <strong style={{ color: "#9ca3af", fontSize: "0.75rem", display: "block" }}>MOBILE NUMBER</strong>
                          <span>{worker.phone || "No phone number"}</span>
                        </div>

                        {worker.email && (
                          <div>
                            <strong style={{ color: "#9ca3af", fontSize: "0.75rem", display: "block" }}>EMAIL</strong>
                            <span>{worker.email}</span>
                          </div>
                        )}

                        <div>
                          <strong style={{ color: "#9ca3af", fontSize: "0.75rem", display: "block" }}>ASSIGNED SITE / JOB</strong>
                          <span style={{ color: worker.assignedJobTitle ? "#eeeae1" : "#6b7280" }}>
                            {worker.assignedJobTitle ? (
                              <>
                                {worker.assignedJobTitle}
                                {worker.assignedJobLocation && (
                                  <small style={{ display: "block", color: "#9ca3af" }}>
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
                        borderTop: "1px solid #374151",
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
                          border: "1px solid #4b5563",
                          borderRadius: "0.375rem",
                          color: "#eeeae1",
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

      {/* Add / Edit Worker Modal */}
      {isModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "#1f2937",
              border: "1px solid #374151",
              borderRadius: "0.75rem",
              width: "100%",
              maxWidth: "500px",
              padding: "1.5rem",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.25rem", color: "#eeeae1" }}>
                {editingWorker ? "Edit Worker Details" : "Add New Site Worker"}
              </h3>
              <button
                onClick={closeModal}
                style={{ background: "none", border: "none", color: "#9ca3af", fontSize: "1.5rem", cursor: "pointer" }}
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
                  <label style={{ display: "block", fontSize: "0.75rem", color: "#9ca3af", marginBottom: "0.375rem" }}>
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
                      border: "1px solid #374151",
                      borderRadius: "0.375rem",
                      color: "#eeeae1",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", color: "#9ca3af", marginBottom: "0.375rem" }}>
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
                      border: "1px solid #374151",
                      borderRadius: "0.375rem",
                      color: "#eeeae1",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", color: "#9ca3af", marginBottom: "0.375rem" }}>
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
                    border: "1px solid #374151",
                    borderRadius: "0.375rem",
                    color: "#eeeae1",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", color: "#9ca3af", marginBottom: "0.375rem" }}>
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
                    border: "1px solid #374151",
                    borderRadius: "0.375rem",
                    color: "#eeeae1",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", color: "#9ca3af", marginBottom: "0.375rem" }}>
                  ASSIGNED SITE / JOB
                </label>
                <select
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.625rem",
                    background: "#111827",
                    border: "1px solid #374151",
                    borderRadius: "0.375rem",
                    color: "#eeeae1",
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
                  style={{ width: "1.125rem", height: "1.125rem", accentColor: "#d0b873" }}
                />
                <label htmlFor="isActiveToggle" style={{ fontSize: "0.875rem", color: "#eeeae1", cursor: "pointer" }}>
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
                    border: "1px solid #4b5563",
                    borderRadius: "0.375rem",
                    color: "#9ca3af",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  style={{
                    padding: "0.625rem 1.25rem",
                    background: "#d0b873",
                    border: "none",
                    borderRadius: "0.375rem",
                    color: "#111827",
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
