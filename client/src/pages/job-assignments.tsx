import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { AssignmentStatusBadge } from "@/components/assignment-status-badge";
import { queryClient } from "@/lib/queryClient";
import "./job-assignments.css";

interface StructuredProgressGroup {
  workerId: string | null;
  workerName: string;
  jobId: string;
  jobName: string;
  roomCount: number;
  workItemCount: number;
  counts: Record<string, number>;
  assignments: Array<{
    id: string;
    status: string;
    locationName: string | null;
    workLocation: string;
    taskName: string | null;
    workCategory: string | null;
    latestStatusEvent?: { note: string | null } | null;
  }>;
}

function LogoutButton() {
  const handleLogout = () => {
    // Clear all localStorage data
    localStorage.clear();
    // Force page reload to ensure clean state
    window.location.href = '/login';
    window.location.reload();
  };

  return (
    <div className="ja-logout">
      <div className="ja-logout__inner">
        <span className="ja-logout__role">Admin</span>
        <Button
          onClick={handleLogout}
          size="sm"
          className="ja-logout__button"
        >
          Logout
        </Button>
      </div>
    </div>
  );
}

export default function JobAssignments() {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedAssignment, setExpandedAssignment] = useState<string | null>(null);
  const [completedTasks, setCompletedTasks] = useState<any[]>([]);
  const [inspectionStatus, setInspectionStatus] = useState<Record<string, 'approved' | 'issues'>>({});
  const [inspectionNotes, setInspectionNotes] = useState<Record<string, string>>({});
  const [reworkNotes, setReworkNotes] = useState<Record<string, string>>({});
  const { toast } = useToast();

  // Fetch job assignments from the database
  const { data: assignments = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/job-assignments'],
    queryFn: async () => {
      const response = await fetch('/api/job-assignments');
      if (!response.ok) {
        throw new Error('Failed to fetch job assignments');
      }
      return response.json();
    }
  });

  const { data: structuredProgress = [] } = useQuery<StructuredProgressGroup[]>({
    queryKey: ["/api/admin/structured-assignment-progress"],
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ assignmentId, status, note }: { assignmentId: string; status: string; note?: string }) => {
      const response = await fetch(`/api/admin/structured-assignments/${encodeURIComponent(assignmentId)}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Review update failed");
      }
      return response.json();
    },
    onSuccess: (_result, variables) => {
      setReworkNotes((current) => {
        const next = { ...current };
        delete next[variables.assignmentId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/structured-assignment-progress"] });
      queryClient.invalidateQueries({ queryKey: ["/api/job-assignments"] });
      toast({ title: "Assignment Updated", description: "The worker's status has been updated." });
    },
    onError: (error) => toast({
      title: "Review Not Saved",
      description: error instanceof Error ? error.message : "Please retry.",
      variant: "destructive",
    }),
  });

  const handleDeleteAssignment = async (assignmentId: string) => {
    try {
      const response = await fetch(`/api/job-assignments/${assignmentId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete assignment');
      }
      
      // Refresh the assignments list
      refetch();
      
      toast({
        title: "Assignment Deleted",
        description: "Job assignment has been removed successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete assignment. Please try again.",
        variant: "destructive",
      });
    }
  };

  const toggleInspectionView = async (assignmentId: string) => {
    if (expandedAssignment === assignmentId) {
      setExpandedAssignment(null);
      setCompletedTasks([]);
      return;
    }

    setExpandedAssignment(assignmentId);
    
    // Load completed tasks for this assignment
    try {
      const assignment = assignments.find((a: any) => a.id === assignmentId);
      if (!assignment) return;

      // Get task progress
      const taskResponse = await fetch(`/api/task-progress/${encodeURIComponent(assignment.contractorName)}/${assignmentId}`);
      const taskProgress = await taskResponse.json();

      // Find completed tasks
      const completed: any[] = [];
      taskProgress.forEach((progressItem: any) => {
        if (progressItem.completed === true) {
          completed.push({
            taskId: progressItem.taskId,
            phase: progressItem.phase,
            taskName: progressItem.taskDescription,
            description: progressItem.taskDescription,
            progress: 100,
            completed: true,
            inspectionStatus: 'pending',
            notes: '',
            photos: []
          });
        }
      });

      setCompletedTasks(completed);
    } catch (error) {
      console.error('Error loading completed tasks:', error);
      setCompletedTasks([]);
    }
  };

  const submitInspection = async () => {
    if (!expandedAssignment) return;

    try {
      const assignment = assignments.find((a: any) => a.id === expandedAssignment);
      if (!assignment) return;

      const inspections = completedTasks.map(task => ({
        assignmentId: expandedAssignment,
        contractorName: assignment.contractorName,
        taskId: task.taskId,
        phase: task.phase,
        taskName: task.taskName,
        inspectionStatus: inspectionStatus[task.taskId] || 'pending',
        notes: inspectionNotes[task.taskId] || '',
        inspectedBy: localStorage.getItem('adminName') || 'Admin',
        inspectedAt: new Date().toISOString(),
      }));

      const response = await fetch('/api/admin-inspections/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspections })
      });

      if (!response.ok) throw new Error('Failed to submit inspection');

      toast({
        title: "Inspection Submitted",
        description: "Task inspection completed successfully",
      });

      setExpandedAssignment(null);
      setCompletedTasks([]);
      setInspectionStatus({});
      setInspectionNotes({});
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit inspection",
        variant: "destructive",
      });
    }
  };

  // Filter assignments based on search term
  const filteredAssignments = assignments.filter((assignment: any) =>
    assignment?.contractorName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    assignment?.hbxlJob?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    assignment?.workLocation?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="ja-page">
      <header className="ja-topbar">
        <div className="ja-brand" aria-label="Sculpt Projects admin dashboard">
          <div className="ja-brand__mark">
            <img src="/sculpt-projects-logo.png" alt="" aria-hidden="true" />
          </div>
          <div className="ja-brand__copy">
            <strong>Sculpt Projects</strong>
            <small>Operations dashboard</small>
          </div>
        </div>

        <nav className="ja-desktop-nav" aria-label="Primary admin sections">
          <button type="button" onClick={() => window.location.href = '/'}>Dashboard</button>
          <button type="button" className="is-active" aria-current="page">Jobs</button>
          <button type="button" onClick={() => window.location.href = '/admin'}>Admin</button>
          <button type="button" onClick={() => window.location.href = '/upload'}>Upload</button>
        </nav>

        <div className="ja-topbar__status">
          <span className="ja-online"><i aria-hidden="true"></i>Online</span>
          <span className="ja-ambient" aria-hidden="true"><i className="fas fa-sun"></i></span>
          <span className="ja-avatar">RD</span>
          <LogoutButton />
        </div>
      </header>

      <main className="ja-shell">
        <section className="ja-hero" aria-labelledby="job-assignments-title">
          <div>
            <p className="ja-kicker">Assignments control</p>
            <h1 id="job-assignments-title">Job Assignments</h1>
            <span>Allocate live work, track contractor readiness, and review completed tasks from one operations board.</span>
          </div>
          <Button 
            onClick={() => window.location.href = '/create-assignment'}
            className="ja-button ja-button--primary"
          >
            <i className="fas fa-plus" aria-hidden="true"></i>
            Create Assignment
          </Button>
        </section>

        <section className="ja-panel" aria-labelledby="structured-progress-title">
          <div className="ja-panel__head">
            <div>
              <p className="ja-kicker">Structured work</p>
              <h2 id="structured-progress-title">Worker Progress & Approval</h2>
            </div>
            <span className="ja-count">{structuredProgress.length} worker/job groups</span>
          </div>
          <div className="ja-panel__body space-y-4">
            {structuredProgress.map((group) => (
              <article key={`${group.workerId || group.workerName}:${group.jobId}`} className="rounded-xl border-2 border-slate-600 bg-slate-950 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-extrabold text-white">{group.workerName} — {group.jobName}</h3>
                    <p className="mt-1 font-semibold text-slate-300">{group.roomCount} rooms · {group.workItemCount} work items</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm font-bold">
                    <span className="rounded border border-amber-400 bg-amber-950 px-2 py-1 text-amber-100">{group.counts.in_progress || 0} In Progress</span>
                    <span className="rounded border-2 border-fuchsia-300 bg-fuchsia-950 px-2 py-1 text-fuchsia-100">{group.counts.awaiting_approval || 0} Awaiting Approval</span>
                    <span className="rounded border border-emerald-400 bg-emerald-950 px-2 py-1 text-emerald-100">{group.counts.approved || 0} Approved</span>
                    <span className="rounded border border-red-400 bg-red-950 px-2 py-1 text-red-100">{group.counts.rework_required || 0} Rework Required</span>
                  </div>
                </div>

                {(group.counts.awaiting_approval || 0) > 0 && (
                  <div className="mt-4 space-y-3 border-t-2 border-fuchsia-700 pt-4">
                    <h4 className="font-extrabold uppercase tracking-wide text-fuchsia-200">Awaiting Approval</h4>
                    {group.assignments.filter((assignment) => assignment.status === "awaiting_approval").map((assignment) => (
                      <div key={assignment.id} className="rounded-lg border-2 border-fuchsia-400 bg-slate-900 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <strong className="text-white">{assignment.locationName || assignment.workLocation}</strong>
                            <p className="text-sm text-slate-300">{assignment.taskName || assignment.workCategory}</p>
                          </div>
                          <AssignmentStatusBadge status={assignment.status} />
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto]">
                          <input
                            className="rounded border-2 border-slate-500 bg-slate-950 px-3 py-2 text-white"
                            placeholder="Required rework note"
                            value={reworkNotes[assignment.id] || ""}
                            onChange={(event) => setReworkNotes((current) => ({ ...current, [assignment.id]: event.target.value }))}
                          />
                          <Button
                            className="bg-emerald-600 font-extrabold text-white hover:bg-emerald-500"
                            disabled={reviewMutation.isPending}
                            onClick={() => reviewMutation.mutate({ assignmentId: assignment.id, status: "approved" })}
                          >
                            APPROVE
                          </Button>
                          <Button
                            className="bg-red-700 font-extrabold text-white hover:bg-red-600"
                            disabled={reviewMutation.isPending || !(reworkNotes[assignment.id] || "").trim()}
                            onClick={() => reviewMutation.mutate({
                              assignmentId: assignment.id,
                              status: "rework_required",
                              note: reworkNotes[assignment.id],
                            })}
                          >
                            REWORK REQUIRED
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="ja-panel" aria-labelledby="current-assignments-title">
          <div className="ja-panel__head">
            <div>
              <p className="ja-kicker">Current workload</p>
              <h2 id="current-assignments-title">Current Assignments</h2>
            </div>
            <span className="ja-count">{filteredAssignments.length} shown</span>
          </div>

          <div className="ja-panel__body">
            <label className="ja-search" htmlFor="assignment-search">
              <span>Search assignments</span>
              <input
                id="assignment-search"
                type="text"
                placeholder="Search assignments..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="ja-search__input"
              />
            </label>

            {isLoading ? (
              <div className="ja-empty ja-empty--loading">
                <div className="ja-spinner" aria-hidden="true"></div>
                <strong>Loading assignments...</strong>
              </div>
            ) : filteredAssignments && filteredAssignments.length > 0 ? (
              <div className="ja-list">
                {filteredAssignments.map((assignment: any, index: number) => (
                  <div 
                    key={assignment.id || index}
                    className="ja-card"
                  >
                    <div className="ja-card__main">
                      <div className="ja-card__identity">
                        <div className="ja-card__icon">
                          <i className="fas fa-briefcase" aria-hidden="true"></i>
                        </div>
                        <div className="ja-card__title">
                          <h3>
                            {assignment.title || 'Job Assignment'}
                          </h3>
                          <p>
                            Assigned to: {assignment.contractorName || 'Unknown'}
                          </p>
                          <p>
                            Location: {assignment.workLocation || 'No location specified'}
                          </p>
                          <p>
                            Job: {assignment.hbxlJob || 'No job specified'}
                          </p>
                        </div>
                      </div>

                      <div className="ja-card__stats" aria-label="Assignment summary">
                        <div className="ja-stat">
                          <span>Status</span>
                          {assignment.jobId && assignment.locationId && assignment.locationTaskId ? (
                            <AssignmentStatusBadge status={assignment.status || "assigned"} />
                          ) : (
                            <strong className="ja-status-text">{assignment.status || 'Assigned'}</strong>
                          )}
                        </div>
                        <div className="ja-stat">
                          <span>Phases</span>
                          <strong>
                            {assignment.buildPhases?.length || 0}
                          </strong>
                        </div>
                        <button
                          onClick={() => handleDeleteAssignment(assignment.id)}
                          className="ja-icon-button ja-icon-button--danger"
                          title="Delete Assignment"
                          aria-label="Delete Assignment"
                        >
                          <i className="fas fa-trash" aria-hidden="true"></i>
                        </button>
                      </div>
                    </div>

                    <div className="ja-detail-grid">
                      <div className="ja-detail">
                        <span>Start Date</span>
                        <strong>{assignment.startDate || 'N/A'}</strong>
                      </div>
                      <div className="ja-detail">
                        <span>Due Date</span>
                        <strong>{assignment.dueDate || 'N/A'}</strong>
                      </div>
                      <div className="ja-detail">
                        <span>Telegram</span>
                        <strong>
                          {assignment.telegramNotified === 'true' ? '✓ Sent' : 'Not sent'}
                        </strong>
                      </div>
                      <div className="ja-detail ja-detail--action">
                        <span>Actions</span>
                        {assignment.jobId && assignment.locationId && assignment.locationTaskId ? (
                          <strong>Use approval panel above</strong>
                        ) : (
                          <button
                            onClick={() => toggleInspectionView(assignment.id)}
                            className="ja-text-button"
                          >
                            {expandedAssignment === assignment.id ? 'Hide' : 'Show'} Task Inspection
                          </button>
                        )}
                      </div>
                    </div>

                    {expandedAssignment === assignment.id && (
                      <div className="ja-inspection">
                        <div className="ja-inspection__head">
                          <div>
                            <p className="ja-kicker">Quality desk</p>
                            <h3>
                              <i className="fas fa-clipboard-check" aria-hidden="true"></i>
                              Site Inspection Dashboard
                            </h3>
                            <span>Quality assessment and task verification</span>
                          </div>
                          <div className="ja-inspector">
                            <span>Inspector</span>
                            <strong>{localStorage.getItem('adminName') || 'Admin'}</strong>
                            <small>{new Date().toLocaleDateString('en-GB')}</small>
                          </div>
                        </div>

                        <div className="ja-summary-grid">
                          <div className="ja-detail">
                            <span>Contractor</span>
                            <strong>{assignment.contractorName}</strong>
                          </div>
                          <div className="ja-detail">
                            <span>Location</span>
                            <strong>{assignment.workLocation}</strong>
                          </div>
                          <div className="ja-detail">
                            <span>Job Reference</span>
                            <strong>{assignment.hbxlJob}</strong>
                          </div>
                        </div>

                        {completedTasks.length > 0 ? (
                          <div className="ja-inspection__body">
                            <div className="ja-ready">
                              <div className="ja-ready__mark">
                                <i className="fas fa-check" aria-hidden="true"></i>
                              </div>
                              <div>
                                <strong>{completedTasks.length} Task{completedTasks.length !== 1 ? 's' : ''} Ready</strong>
                                <span>Complete - awaiting quality review</span>
                              </div>
                            </div>
                            
                            <div className="ja-task-list">
                              {completedTasks.map((task: any) => (
                                <div key={task.taskId} className="ja-task-card">
                                  <div className="ja-task-card__head">
                                    <div className="ja-task-title">
                                      <div className="ja-task-icon">
                                        <i className="fas fa-tasks" aria-hidden="true"></i>
                                      </div>
                                      <div>
                                        <h4>{task.taskName}</h4>
                                        <div className="ja-task-meta">
                                          <span>Phase: {task.phase}</span>
                                          <span className="ja-chip ja-chip--success">
                                            <i className="fas fa-check-circle" aria-hidden="true"></i>
                                            Complete
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="ja-progress">
                                      <strong>100%</strong>
                                      <span>Progress</span>
                                    </div>
                                  </div>

                                  <div className="ja-task-card__body">
                                    <div className="ja-assessment">
                                      <label>Quality Assessment</label>
                                      <div className="ja-assessment__buttons">
                                        <button
                                          onClick={() => setInspectionStatus(prev => ({ ...prev, [task.taskId]: 'approved' }))}
                                          className={`ja-choice ${inspectionStatus[task.taskId] === 'approved' ? 'is-approved' : ''}`}
                                        >
                                          <i className="fas fa-check-circle" aria-hidden="true"></i>
                                          Approve Work
                                        </button>
                                        <button
                                          onClick={() => setInspectionStatus(prev => ({ ...prev, [task.taskId]: 'issues' }))}
                                          className={`ja-choice ${inspectionStatus[task.taskId] === 'issues' ? 'is-issues' : ''}`}
                                        >
                                          <i className="fas fa-exclamation-triangle" aria-hidden="true"></i>
                                          Requires Attention
                                        </button>
                                        <button className="ja-choice ja-choice--photo">
                                          <i className="fas fa-camera" aria-hidden="true"></i>
                                          Add Photo
                                        </button>
                                      </div>
                                    </div>
                                    
                                    <label className="ja-notes">
                                      <span>Inspection Notes</span>
                                      <textarea
                                        placeholder="Record quality observations, measurements, compliance notes..."
                                        value={inspectionNotes[task.taskId] || ''}
                                        onChange={(e) => setInspectionNotes(prev => ({ ...prev, [task.taskId]: e.target.value }))}
                                        rows={2}
                                      />
                                    </label>
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="ja-submit-panel">
                              <div>
                                <h4>Complete Inspection</h4>
                                <p>Review all assessments before submitting final report</p>
                              </div>
                              <div className="ja-submit-panel__actions">
                                <button
                                  onClick={() => {
                                    setExpandedAssignment(null);
                                    setCompletedTasks([]);
                                    setInspectionStatus({});
                                    setInspectionNotes({});
                                  }}
                                  className="ja-button ja-button--quiet"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={submitInspection}
                                  className="ja-button ja-button--success"
                                >
                                  <i className="fas fa-clipboard-check" aria-hidden="true"></i>
                                  Submit Inspection Report
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="ja-empty ja-empty--inspection">
                            <div className="ja-empty__mark">
                              <i className="fas fa-clipboard-list" aria-hidden="true"></i>
                            </div>
                            <div>
                              <h4>No Tasks Ready for Inspection</h4>
                              <p>
                                Completed tasks will appear here automatically once contractors mark them as 100% finished. 
                                Check back later or contact the contractor for status updates.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="ja-empty">
                <div className="ja-empty__mark">
                  <i className="fas fa-briefcase" aria-hidden="true"></i>
                </div>
                <div>
                  <h3>No job assignments found.</h3>
                  <p>
                  Use "Create Assignment" to assign jobs to contractors.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      <nav className="ja-mobile-nav" aria-label="Primary">
        <div className="ja-mobile-nav__grid">
          <button 
            onClick={() => window.location.href = '/'}
          >
            <i className="fas fa-home" aria-hidden="true"></i>
            <span>Dashboard</span>
          </button>
          <button className="is-active" aria-current="page">
            <i className="fas fa-briefcase" aria-hidden="true"></i>
            <span>Jobs</span>
          </button>
          <button 
            onClick={() => window.location.href = '/admin'}
          >
            <i className="fas fa-user-cog" aria-hidden="true"></i>
            <span>Admin</span>
          </button>
          <button 
            onClick={() => window.location.href = '/upload'}
          >
            <i className="fas fa-upload" aria-hidden="true"></i>
            <span>Upload</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
