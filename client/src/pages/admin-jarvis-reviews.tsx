import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { JobWithContractor } from "@shared/schema";
import "./admin-jarvis-reviews.css";

type ReviewStatus = "pending" | "approved" | "rejected" | "sent_back";
type ReviewDecision = "approved" | "rejected" | "sent_back";

interface ShadowReviewTask {
  task_id: string;
  title: string;
  instructions: string;
  quantity: number;
  unit: string;
  approved_amount_minor: number;
}

interface ShadowChangeReviewSummary {
  change_id: string;
  event_id: string;
  change_order_id: string;
  revision: number;
  project_integration_id: string;
  title: string;
  currency: string;
  approved_amount_minor: number;
  received_at: string;
  review_status: ReviewStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  note?: string;
}

interface ShadowChangeReviewDetail extends ShadowChangeReviewSummary {
  scope: string;
  occurred_at: string;
  approved_at: string;
  approved_by_actor_id: string;
  tasks: ShadowReviewTask[];
}

type ApplicationStatus =
  | "pending_mapping"
  | "ready"
  | "applied"
  | "blocked_no_mapping"
  | "already_applied"
  | "not_approved";

interface IntegrationProjectMapping {
  project_integration_id: string;
  job_id: string;
  mapped_by: string;
  mapped_at: string;
}

interface ChangeOrderApplicationRecord {
  application_id: string;
  change_order_id: string;
  revision: number;
  applied_to_job_id?: string;
  applied_by?: string;
  applied_at?: string;
  status: ApplicationStatus;
}

interface ApplicationReadiness {
  change_order_id: string;
  revision: number;
  project_integration_id: string;
  title: string;
  currency: string;
  approved_amount_minor: number;
  review_status: string | null;
  review_approved: boolean;
  mapping?: IntegrationProjectMapping;
  application?: ChangeOrderApplicationRecord;
  status: ApplicationStatus;
}

interface ContractorCandidate {
  contractor_id: string;
  name: string;
  phone: string;
  assigned_job_id?: string;
  assigned_job_title?: string;
}

interface ContractorMessagePreview {
  id: string;
  application_id: string;
  contractor_id: string;
  contractor_name: string;
  phone_e164: string;
  body: string;
  preview_hash: string;
  created_at: string;
}

interface ContractorMessageReply {
  id: string;
  phone_e164: string;
  body: string;
  created_at: string;
  inbound_provider_message_id?: string;
}

interface ContractorMessageHistoryItem {
  id: string;
  contractor_id: string;
  contractor_name?: string;
  phone_e164: string;
  body: string;
  status: string;
  delivery_status: string;
  provider_message_id?: string;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  acknowledged_at?: string;
  error_code?: string;
  replies: ContractorMessageReply[];
}

interface UnmatchedInboundMessage {
  id: string;
  phone_e164: string;
  body: string;
  created_at: string;
  unmatched_reason: string;
  inbound_provider_message_id?: string;
}

const FILTERS: ReadonlyArray<{ label: string; value: ReviewStatus | "all" }> = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Sent Back", value: "sent_back" },
];

function formatMinorAmount(minor: number): string {
  if (!Number.isFinite(minor) || minor < 0) return "0.00";
  return (minor / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTimestamp(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusBadge(status: ReviewStatus) {
  switch (status) {
    case "approved":
      return <Badge className="jr-badge jr-badge--good">Approved</Badge>;
    case "rejected":
      return <Badge className="jr-badge jr-badge--bad">Rejected</Badge>;
    case "sent_back":
      return <Badge className="jr-badge jr-badge--info">Sent Back</Badge>;
    default:
      return <Badge className="jr-badge jr-badge--warn">Pending</Badge>;
  }
}

function readinessBadge(status: ApplicationStatus) {
  switch (status) {
    case "ready":
      return <Badge className="jr-badge jr-badge--good">Ready</Badge>;
    case "pending_mapping":
      return <Badge className="jr-badge jr-badge--warn">Pending Mapping</Badge>;
    default:
      return <Badge className="jr-badge jr-badge--muted">{status.replace(/_/g, " ")}</Badge>;
  }
}

function jobStatusBadge(status: string) {
  const classes =
    status === "completed"
      ? "jr-badge jr-badge--good"
      : status === "assigned"
        ? "jr-badge jr-badge--info"
        : "jr-badge jr-badge--warn";
  return <Badge className={classes}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

function whatsappStatusBadge(message: ContractorMessageHistoryItem) {
  if (message.status === "failed" || message.delivery_status === "failed") {
    return <Badge className="jr-badge jr-badge--bad">Failed</Badge>;
  }
  if (message.delivery_status === "read") {
    return <Badge className="jr-badge jr-badge--good">Read</Badge>;
  }
  if (message.delivery_status === "delivered") {
    return <Badge className="jr-badge jr-badge--info">Delivered</Badge>;
  }
  if (message.delivery_status === "sent" || message.status === "sent") {
    return <Badge className="jr-badge jr-badge--warn">Sent</Badge>;
  }
  return <Badge className="jr-badge jr-badge--muted">Queued</Badge>;
}

function LogoutButton() {
  const handleLogout = () => {
    localStorage.removeItem('userRole');
    localStorage.removeItem('isLoggedIn');
    window.location.href = '/login';
  };

  return (
    <div className="jr-logout">
      <div className="jr-logout__inner">
        <span className="jr-logout__role">Admin</span>
        <button type="button" onClick={handleLogout} className="jr-logout__button">
          Logout
        </button>
      </div>
    </div>
  );
}

function shouldPollMessages(messages: ContractorMessageHistoryItem[]): boolean {
  const latest = messages[0];
  if (latest === undefined) return false;
  if (latest.acknowledged_at || latest.delivery_status === "read") return false;
  if (latest.status === "failed" || latest.delivery_status === "failed") return false;
  return latest.status === "sent" || latest.delivery_status === "sent" || latest.delivery_status === "delivered";
}

function extractErrorMessage(raw: string): string {
  const match = raw.match(/"error"\s*:\s*"([^"]+)"/);
  return match ? match[1] : raw;
}

export default function AdminJarvisReviews() {
  const { toast } = useToast();
  const [showAvatarDropdown, setShowAvatarDropdown] = useState(false);
  const [filter, setFilter] = useState<ReviewStatus | "all">("all");
  const [selected, setSelected] = useState<{ changeOrderId: string; revision: number } | null>(null);
  const [pendingDecision, setPendingDecision] = useState<ReviewDecision | null>(null);
  const [note, setNote] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState<JobWithContractor | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [selectedContractor, setSelectedContractor] = useState<ContractorCandidate | null>(null);
  const [messagePreview, setMessagePreview] = useState<ContractorMessagePreview | null>(null);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);

  const listUrl = "/api/integrations/review/change-orders";
  const detailUrl = selected
    ? `/api/integrations/review/change-orders/${encodeURIComponent(selected.changeOrderId)}/revisions/${selected.revision}`
    : null;

  const { data, isLoading } = useQuery<{ changes: ShadowChangeReviewSummary[] }>({
    queryKey: [listUrl],
  });

  const { data: detail, isLoading: detailLoading } = useQuery<ShadowChangeReviewDetail>({
    queryKey: [detailUrl ?? "no-detail-selected"],
    enabled: detailUrl !== null,
  });

  const readinessUrl = selected
    ? `/api/integrations/applications/change-orders/${encodeURIComponent(selected.changeOrderId)}/revisions/${selected.revision}/readiness`
    : null;

  const { data: readiness } = useQuery<ApplicationReadiness>({
    queryKey: [readinessUrl ?? "no-readiness-selected"],
    enabled: readinessUrl !== null,
  });

  const mappedJobId = readiness?.mapping?.job_id;
  const { data: mappedJob } = useQuery<JobWithContractor>({
    queryKey: [mappedJobId === undefined ? "no-mapped-job" : `/api/jobs/${mappedJobId}`],
    enabled: mappedJobId !== undefined,
  });

  const appliedApplication = readiness?.application?.status === "applied"
    ? readiness.application
    : undefined;
  const applicationId = appliedApplication?.application_id;
  const appliedJobId = appliedApplication?.applied_to_job_id ?? readiness?.mapping?.job_id;

  const { data: messageHistory, refetch: refetchMessageHistory } = useQuery<{ messages: ContractorMessageHistoryItem[] }>({
    queryKey: ["/api/integrations/messages", { application_id: applicationId ?? "" }],
    enabled: applicationId !== undefined,
    refetchInterval: (query) => {
      const current = query.state.data as { messages: ContractorMessageHistoryItem[] } | undefined;
      return shouldPollMessages(current?.messages ?? []) ? 10000 : false;
    },
  });

  const { data: unmatchedInbound } = useQuery<{ messages: UnmatchedInboundMessage[] }>({
    queryKey: ["/api/integrations/messages/unmatched"],
    refetchInterval: 30000,
  });

  const { data: contractorCandidates, isLoading: contractorCandidatesLoading } = useQuery<{ contractors: ContractorCandidate[] }>({
    queryKey: ["/api/integrations/messages/contractor-candidates", { job_id: appliedJobId ?? "" }],
    enabled: contactOpen && appliedJobId !== undefined,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setContactOpen(false);
    setSelectedContractor(null);
    setMessagePreview(null);
    setSendConfirmOpen(false);
  }, [applicationId]);

  const {
    data: jobSearchResults = [],
    isLoading: jobSearchLoading,
  } = useQuery<JobWithContractor[]>({
    queryKey: ["/api/jobs", { search: debouncedSearch }],
    enabled: pickerOpen,
  });

  const changes = data?.changes ?? [];
  const filtered = filter === "all"
    ? changes
    : changes.filter((change) => change.review_status === filter);
  const adminName = localStorage.getItem("adminName") || "Admin";
  const adminInitials = adminName.split(" ").map((name) => name[0]).join("").slice(0, 2) || "AD";

  const decisionMutation = useMutation({
    mutationFn: async ({
      changeOrderId,
      revision,
      decision,
      decisionNote,
    }: {
      changeOrderId: string;
      revision: number;
      decision: ReviewDecision;
      decisionNote?: string;
    }) => {
      const response = await apiRequest(
        "POST",
        `/api/integrations/review/change-orders/${encodeURIComponent(changeOrderId)}/revisions/${revision}/decision`,
        { decision, note: decisionNote || undefined },
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [listUrl] });
      if (detailUrl !== null) {
        queryClient.invalidateQueries({ queryKey: [detailUrl] });
      }
      setPendingDecision(null);
      setNote("");
      toast({ title: "Decision recorded", description: "Only the human decision was stored." });
    },
    onError: (error) => {
      toast({
        title: "Decision not recorded",
        description: error instanceof Error ? error.message : "Unexpected error",
        variant: "destructive",
      });
    },
  });

  const openDecision = (decision: ReviewDecision) => {
    setNote("");
    setPendingDecision(decision);
  };

  const confirmDecision = () => {
    if (selected === null || pendingDecision === null) return;
    decisionMutation.mutate({
      changeOrderId: selected.changeOrderId,
      revision: selected.revision,
      decision: pendingDecision,
      decisionNote: note.trim() || undefined,
    });
  };

  const mappingMutation = useMutation({
    mutationFn: async ({
      projectIntegrationId,
      jobId,
    }: {
      projectIntegrationId: string;
      jobId: string;
    }) => {
      const response = await apiRequest("POST", "/api/integrations/applications/mappings", {
        project_integration_id: projectIntegrationId,
        job_id: jobId,
      });
      return (await response.json()) as { status: string; mapping?: IntegrationProjectMapping };
    },
    onSuccess: (result) => {
      if (readinessUrl !== null) {
        queryClient.invalidateQueries({ queryKey: [readinessUrl] });
      }
      queryClient.invalidateQueries({ queryKey: [listUrl] });
      if (result.status === "already_exists") {
        toast({
          title: "Mapping already exists",
          description: "Showing the existing mapping for this project.",
        });
      } else {
        toast({ title: "Project mapped", description: "Application readiness is now Ready." });
      }
      setConfirmOpen(false);
      setPickerOpen(false);
      setSelectedJob(null);
      setSearchTerm("");
      setDebouncedSearch("");
    },
    onError: (error) => {
      toast({
        title: "Mapping failed",
        description: error instanceof Error ? extractErrorMessage(error.message) : "Unexpected error",
        variant: "destructive",
      });
    },
  });

  const confirmMapping = () => {
    if (selectedJob === null || readiness === undefined) return;
    mappingMutation.mutate({
      projectIntegrationId: readiness.project_integration_id,
      jobId: selectedJob.id,
    });
  };

  const applyMutation = useMutation({
    mutationFn: async ({
      changeOrderId,
      revision,
    }: {
      changeOrderId: string;
      revision: number;
    }) => {
      const response = await apiRequest(
        "POST",
        `/api/integrations/applications/change-orders/${encodeURIComponent(changeOrderId)}/revisions/${revision}/apply`,
      );
      return (await response.json()) as { status: string; application_id?: string; applied_to_job_id?: string };
    },
    onSuccess: (result) => {
      if (readinessUrl !== null) {
        queryClient.invalidateQueries({ queryKey: [readinessUrl] });
      }
      setApplyConfirmOpen(false);
      if (result.status === "already_applied") {
        toast({
          title: "Already applied",
          description: "This change was already applied to the mapped job. No job data changed.",
        });
      } else {
        toast({
          title: "Applied to job",
          description: "Approved scope and tasks were appended to the mapped job.",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Apply failed",
        description: error instanceof Error ? extractErrorMessage(error.message) : "Unexpected error",
        variant: "destructive",
      });
    },
  });

  const confirmApply = () => {
    if (selected === null) return;
    applyMutation.mutate({
      changeOrderId: selected.changeOrderId,
      revision: selected.revision,
    });
  };

  const resetContactDialog = () => {
    setContactOpen(false);
    setSelectedContractor(null);
    setMessagePreview(null);
    setSendConfirmOpen(false);
  };

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (applicationId === undefined || selectedContractor === null) {
        throw new Error("Select a contractor before previewing");
      }
      const response = await apiRequest("POST", "/api/integrations/messages/previews", {
        application_id: applicationId,
        contractor_id: selectedContractor.contractor_id,
      });
      return (await response.json()) as { status: string; preview: ContractorMessagePreview };
    },
    onSuccess: (result) => {
      setMessagePreview(result.preview);
      refetchMessageHistory();
      toast({ title: "Preview generated", description: "No WhatsApp message has been sent." });
    },
    onError: (error) => {
      toast({
        title: "Preview failed",
        description: error instanceof Error ? extractErrorMessage(error.message) : "Unexpected error",
        variant: "destructive",
      });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (applicationId === undefined || selectedContractor === null || messagePreview === null) {
        throw new Error("Generate a preview before sending");
      }
      const response = await apiRequest("POST", "/api/integrations/messages/sends", {
        application_id: applicationId,
        contractor_id: selectedContractor.contractor_id,
        preview_hash: messagePreview.preview_hash,
        confirmed_by: localStorage.getItem("adminName") || "Admin",
        confirmed_at: new Date().toISOString(),
      });
      return response.json();
    },
    onSuccess: () => {
      setSendConfirmOpen(false);
      resetContactDialog();
      refetchMessageHistory();
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/messages", { application_id: applicationId ?? "" }] });
      toast({ title: "WhatsApp sent", description: "Delivery and reply status will refresh here." });
    },
    onError: (error) => {
      toast({
        title: "Send failed",
        description: error instanceof Error ? extractErrorMessage(error.message) : "Unexpected error",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="jr-page">
      <header className="jr-topbar">
        <div className="jr-brand" aria-label="Sculpt Projects">
          <span className="jr-brand__mark">
            <img src="/sculpt-projects-logo.png" alt="" aria-hidden="true" />
          </span>
          <div>
            <strong>Sculpt Projects</strong>
            <small>Jarvis review desk</small>
          </div>
        </div>

        <nav className="jr-quicknav" aria-label="Primary admin sections">
          <button type="button" onClick={() => (window.location.href = "/admin")}>Dashboard</button>
          <button type="button" onClick={() => (window.location.href = "/job-assignments")}>Jobs</button>
          <button type="button" onClick={() => (window.location.href = "/live-clock-monitor")}>Live</button>
          <button type="button" onClick={() => (window.location.href = "/admin-inspections")}>Inspect</button>
          <button type="button" onClick={() => (window.location.href = "/admin")}>Admin</button>
        </nav>

        <div className="jr-topbar__right">
          <div className="jr-online"><span aria-hidden="true" />Online</div>
          <button
            type="button"
            className="jr-menu-button"
            aria-expanded={showAvatarDropdown}
            onClick={() => setShowAvatarDropdown(!showAvatarDropdown)}
          >
            Menu
          </button>
          <button
            type="button"
            className="jr-avatar"
            aria-label={`Signed in as ${adminName}`}
            onClick={() => setShowAvatarDropdown(!showAvatarDropdown)}
          >
            {adminInitials}
          </button>
          <LogoutButton />

          {showAvatarDropdown && (
            <div className="jr-menu" role="menu">
              <div className="jr-menu__identity">
                <strong>{adminName}</strong>
                <span>Admin access</span>
              </div>
              <div className="jr-menu__items">
                <button type="button" onClick={() => (window.location.href = "/admin")} className="jr-menu-item" role="menuitem">
                  <span>Admin Dashboard</span>
                </button>
                <button type="button" onClick={() => (window.location.href = "/job-assignments")} className="jr-menu-item" role="menuitem">
                  <span>Job Assignments</span>
                </button>
                <button type="button" onClick={() => (window.location.href = "/admin")} className="jr-menu-item" role="menuitem">
                  <span>Admin</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <nav className="jr-mobile-nav" aria-label="Primary">
        <button type="button" onClick={() => (window.location.href = "/admin")}>Dashboard</button>
        <button type="button" onClick={() => (window.location.href = "/job-assignments")}>Jobs</button>
        <button type="button" onClick={() => (window.location.href = "/live-clock-monitor")}>Live</button>
        <button type="button" onClick={() => (window.location.href = "/admin-inspections")}>Inspect</button>
        <button type="button" onClick={() => (window.location.href = "/admin")}>Admin</button>
      </nav>

      <main className="jr-main">
        <section className="jr-hero">
          <div>
            <p className="jr-eyebrow">Human approval queue</p>
            <h1>Jarvis Shadow Reviews</h1>
            <p>
            Review inbox for incoming approved change orders. Decisions are recorded only — no operational data is changed.
            </p>
          </div>
          <Button
            variant="outline"
            className="jr-button jr-button--quiet"
            onClick={() => (window.location.href = "/admin-dashboard")}
          >
            Back to Admin
          </Button>
        </section>

        <div className="jr-filters" aria-label="Review status filters">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={filter === option.value ? "jr-filter jr-filter--active" : "jr-filter"}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="jr-workbench">
          <div className="jr-panel jr-panel--inbox">
            <h2 className="jr-section-title">
              Inbox ({filtered.length})
            </h2>
            {isLoading ? (
              <div className="jr-empty">Loading review inbox...</div>
            ) : filtered.length === 0 ? (
              <div className="jr-empty">No changes in this view.</div>
            ) : (
              filtered.map((change) => {
                const isSelected =
                  selected?.changeOrderId === change.change_order_id &&
                  selected.revision === change.revision;
                return (
                  <button
                    key={change.change_id}
                    onClick={() =>
                      setSelected({ changeOrderId: change.change_order_id, revision: change.revision })
                    }
                    className={isSelected ? "jr-inbox-card jr-inbox-card--selected" : "jr-inbox-card"}
                  >
                    <div className="jr-card-heading">
                      <div className="jr-card-title">{change.title}</div>
                      {statusBadge(change.review_status)}
                    </div>
                    <div className="jr-card-meta">
                      <div>
                        CO: <span>{change.change_order_id}</span> · Rev{" "}
                        {change.revision}
                      </div>
                      <div>Project: {change.project_integration_id}</div>
                      <div>
                        {change.currency} {formatMinorAmount(change.approved_amount_minor)}
                      </div>
                      {change.reviewed_by ? (
                        <div>
                          Reviewed by {change.reviewed_by} on {formatTimestamp(change.reviewed_at)}
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="jr-panel jr-panel--detail">
            {selected === null ? (
              <div className="jr-empty">
                Select a change to review its full supplied information.
              </div>
            ) : detailLoading ? (
              <div className="jr-empty">Loading change detail...</div>
            ) : detail === undefined ? (
              <div className="jr-empty">Change detail could not be loaded.</div>
            ) : (
              <div className="jr-detail-stack">
                <div className="jr-detail-head">
                  <h2>{detail.title}</h2>
                  {statusBadge(detail.review_status)}
                </div>

                <div className="jr-facts">
                  <div className="jr-fact">
                    <div>Change Order ID</div>
                    <strong>{detail.change_order_id}</strong>
                  </div>
                  <div className="jr-fact">
                    <div>Revision</div>
                    <strong>{detail.revision}</strong>
                  </div>
                  <div className="jr-fact">
                    <div>Project (Integration ID)</div>
                    <strong>{detail.project_integration_id}</strong>
                  </div>
                  <div className="jr-fact">
                    <div>Amount</div>
                    <strong>
                      {detail.currency} {formatMinorAmount(detail.approved_amount_minor)}
                    </strong>
                  </div>
                  <div className="jr-fact">
                    <div>Approved By (Actor ID)</div>
                    <strong>{detail.approved_by_actor_id}</strong>
                  </div>
                  <div className="jr-fact">
                    <div>Approved At</div>
                    <strong>{formatTimestamp(detail.approved_at)}</strong>
                  </div>
                  <div className="jr-fact">
                    <div>Occurred At</div>
                    <strong>{formatTimestamp(detail.occurred_at)}</strong>
                  </div>
                  <div className="jr-fact">
                    <div>Received At</div>
                    <strong>{formatTimestamp(detail.received_at)}</strong>
                  </div>
                </div>

                <div className="jr-section-block">
                  <div className="jr-label">Scope</div>
                  <div className="jr-copy">{detail.scope}</div>
                </div>

                <div className="jr-section-block">
                  <div className="jr-label">Tasks</div>
                  <div className="jr-list">
                    {detail.tasks.map((task) => (
                      <div key={task.task_id} className="jr-list-item">
                        <div className="jr-list-title">{task.title}</div>
                        <div className="jr-card-meta">
                          {task.quantity} × {task.unit} · {detail.currency}{" "}
                          {formatMinorAmount(task.approved_amount_minor)}
                        </div>
                        <div className="jr-card-meta jr-prewrap">
                          {task.instructions}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="jr-subpanel">
                  <div className="jr-label">Application Readiness</div>
                  {readiness === undefined ? (
                    <div className="jr-muted">
                      Readiness is not available for this change.
                    </div>
                  ) : (
                    <div className="jr-substack">
                      <div className="jr-facts jr-facts--compact">
                        <div className="jr-fact">
                          <div>Project (Integration ID)</div>
                          <strong>{readiness.project_integration_id}</strong>
                        </div>
                        <div className="jr-fact">
                          <div>Status</div>
                          <span>{readinessBadge(readiness.status)}</span>
                        </div>
                      </div>

                      {readiness.mapping ? (
                        <div className="jr-substack">
                          <div className="jr-label">Mapped Job Tracker Job</div>
                          <div className="jr-copy">
                            {mappedJob
                              ? `${mappedJob.title} — ${mappedJob.location}`
                              : `#${readiness.mapping.job_id}`}
                          </div>
                          <div className="jr-muted">
                            ID: {readiness.mapping.job_id} · Mapped by {readiness.mapping.mapped_by}
                          </div>
                          {readiness.status === "ready" ? (
                            <div>
                              <Button
                                className="jr-button jr-button--primary"
                                disabled={applyMutation.isPending}
                                onClick={() => setApplyConfirmOpen(true)}
                              >
                                {applyMutation.isPending ? "Applying..." : "Apply to Job"}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ) : readiness.status === "pending_mapping" ? (
                        <div>
                          <Button
                            className="jr-button jr-button--primary"
                            onClick={() => setPickerOpen(true)}
                          >
                            Map Project
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="jr-subpanel">
                  <div className="jr-inline-head">
                    <div>
                      <div className="jr-label">WhatsApp Communication</div>
                      <div className="jr-muted">
                        Human-confirmed contractor instructions only. No automatic sends.
                      </div>
                    </div>
                    {appliedApplication && appliedJobId ? (
                      <Button
                        className="jr-button jr-button--success"
                        onClick={() => setContactOpen(true)}
                      >
                        Contact Contractor
                      </Button>
                    ) : null}
                  </div>

                  {!appliedApplication ? (
                    <div className="jr-muted">
                      WhatsApp contact is available after the change has been applied.
                    </div>
                  ) : (messageHistory?.messages ?? []).length === 0 ? (
                    <div className="jr-muted">No WhatsApp instructions for this application yet.</div>
                  ) : (
                    <div className="jr-substack">
                      {(messageHistory?.messages ?? []).map((message) => (
                        <div key={message.id} className="jr-message-card">
                          <div className="jr-inline-head">
                            <div>
                              <div className="jr-list-title">
                                {message.contractor_name ?? message.contractor_id}
                              </div>
                              <div className="jr-card-meta">{message.phone_e164}</div>
                            </div>
                            {whatsappStatusBadge(message)}
                          </div>

                          <div className="jr-card-meta">
                            Sent: {formatTimestamp(message.sent_at)}
                            {message.provider_message_id ? ` · Provider: ${message.provider_message_id}` : ""}
                          </div>
                          {message.delivered_at ? (
                            <div className="jr-card-meta">Delivered: {formatTimestamp(message.delivered_at)}</div>
                          ) : null}
                          {message.read_at ? (
                            <div className="jr-card-meta">Read: {formatTimestamp(message.read_at)}</div>
                          ) : null}
                          <div className="jr-card-meta">
                            {message.acknowledged_at ? "Acknowledged: Contractor replied." : "Awaiting Reply"}
                          </div>
                          {message.error_code ? (
                            <div className="jr-danger-text">Failure detail: {message.error_code}</div>
                          ) : null}
                          <div className="jr-message-body">
                            {message.body}
                          </div>
                          {message.replies.length > 0 ? (
                            <div className="jr-substack">
                              <div className="jr-label">Contractor replies</div>
                              {message.replies.map((reply) => (
                                <div key={reply.id} className="jr-reply-card">
                                  <div className="jr-card-meta">
                                    {reply.phone_e164} · {formatTimestamp(reply.created_at)}
                                  </div>
                                  <div className="jr-copy">{reply.body}</div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {detail.reviewed_by ? (
                  <div className="jr-muted">
                    Reviewed by {detail.reviewed_by} on {formatTimestamp(detail.reviewed_at)}
                    {detail.note ? (
                      <div className="jr-copy jr-copy--inline">Note: {detail.note}</div>
                    ) : null}
                  </div>
                ) : null}

                <div className="jr-actions">
                  <Button
                    className="jr-button jr-button--success"
                    onClick={() => openDecision("approved")}
                  >
                    Approve
                  </Button>
                  <Button
                    className="jr-button jr-button--danger"
                    onClick={() => openDecision("rejected")}
                  >
                    Reject
                  </Button>
                  <Button
                    className="jr-button jr-button--info"
                    onClick={() => openDecision("sent_back")}
                  >
                    Send Back
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="jr-panel">
          <div className="jr-inline-head">
            <div>
              <h2 className="jr-section-title">
                Unmatched WhatsApp Inbound
              </h2>
              <p className="jr-muted">Display-only messages that need human review.</p>
            </div>
            <Badge className="jr-badge jr-badge--bad">Needs Review</Badge>
          </div>
          {(unmatchedInbound?.messages ?? []).length === 0 ? (
            <div className="jr-empty">No unmatched inbound WhatsApp messages.</div>
          ) : (
            <div className="jr-card-grid">
              {(unmatchedInbound?.messages ?? []).map((message) => (
                <div key={message.id} className="jr-message-card">
                  <div className="jr-inline-head">
                    <div className="jr-list-title">{message.phone_e164}</div>
                    <Badge className="jr-badge jr-badge--bad">Needs Review</Badge>
                  </div>
                  <div className="jr-card-meta">Received: {formatTimestamp(message.created_at)}</div>
                  <div className="jr-card-meta">Reason: {message.unmatched_reason}</div>
                  <div className="jr-copy">{message.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <AlertDialog open={pendingDecision !== null} onOpenChange={(open) => !open && setPendingDecision(null)}>
        <AlertDialogContent className="jr-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="jr-dialog-title">
              Confirm {pendingDecision === "approved" ? "Approval" : pendingDecision === "rejected" ? "Rejection" : "Send Back"}
            </AlertDialogTitle>
            <AlertDialogDescription className="jr-dialog-description">
              This records your decision against change order {selected?.changeOrderId} (revision{" "}
              {selected?.revision}). It does NOT create or modify any operational Job Tracker data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional note for this decision"
            className="jr-field"
            maxLength={2000}
          />
          <AlertDialogFooter>
            <AlertDialogCancel
              className="jr-button jr-button--quiet"
              onClick={() => setNote("")}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="jr-button jr-button--primary"
              disabled={decisionMutation.isPending}
              onClick={confirmDecision}
            >
              {decisionMutation.isPending ? "Recording..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={pickerOpen} onOpenChange={(open) => !open && setPickerOpen(false)}>
        <DialogContent className="jr-dialog">
          <DialogHeader>
            <DialogTitle className="jr-dialog-title">Map Project to an Existing Job</DialogTitle>
            <DialogDescription className="jr-dialog-description">
              Manually select ONE existing Job Tracker job for project{" "}
              <span className="jr-strong">{readiness?.project_integration_id}</span>. Jobs are
              never auto-matched or auto-created.
            </DialogDescription>
          </DialogHeader>

          <div className="jr-substack">
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by title, location or contractor..."
              className="jr-field"
            />

            {jobSearchLoading ? (
              <div className="jr-empty">Searching jobs...</div>
            ) : jobSearchResults.length === 0 ? (
              <div className="jr-empty jr-empty--dashed">
                No matching jobs found.
                <div className="jr-muted">
                  No new job will be created. Adjust the search or cancel.
                </div>
              </div>
            ) : (
              <div className="jr-choice-list">
                {jobSearchResults.map((job) => {
                  const isSelected = selectedJob?.id === job.id;
                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => setSelectedJob(job)}
                      className={isSelected ? "jr-choice jr-choice--selected" : "jr-choice"}
                    >
                      <div className="jr-card-heading">
                        <div className="jr-card-title">{job.title}</div>
                        {jobStatusBadge(job.status)}
                      </div>
                      <div className="jr-card-meta">
                        <div>
                          ID: <span>{job.id}</span>
                        </div>
                        <div>{job.location}</div>
                        <div>
                          {job.contractor ? `Contractor: ${job.contractor.name}` : "Unassigned"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="jr-button jr-button--quiet"
              onClick={() => {
                setPickerOpen(false);
                setSelectedJob(null);
                setSearchTerm("");
                setDebouncedSearch("");
              }}
            >
              Cancel
            </Button>
            <Button
              className="jr-button jr-button--primary"
              disabled={selectedJob === null}
              onClick={() => setConfirmOpen(true)}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !open && setConfirmOpen(false)}>
        <AlertDialogContent className="jr-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="jr-dialog-title">Confirm Project Mapping</AlertDialogTitle>
            <AlertDialogDescription className="jr-dialog-description">
              Map project{" "}
              <span className="jr-strong">{readiness?.project_integration_id}</span>{" "}
              to Job Tracker job{" "}
              <span className="jr-strong">{selectedJob?.id}</span> —{" "}
              {selectedJob?.title} ({selectedJob?.location})? This only records the human mapping.
              No operational job/task data is changed and no application is created yet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="jr-button jr-button--quiet">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="jr-button jr-button--primary"
              disabled={mappingMutation.isPending}
              onClick={confirmMapping}
            >
              {mappingMutation.isPending ? "Mapping..." : "Confirm Mapping"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={applyConfirmOpen}
        onOpenChange={(open) => !open && setApplyConfirmOpen(false)}
      >
        <AlertDialogContent className="jr-dialog jr-dialog--scroll">
          <AlertDialogHeader>
            <AlertDialogTitle className="jr-dialog-title">Final Confirmation: Apply to Job</AlertDialogTitle>
            <AlertDialogDescription className="jr-dialog-description">
              This will append the approved scope and tasks to the mapped Job Tracker job. Existing
              job information will not be replaced.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="jr-substack">
            <div className="jr-subpanel">
              <div className="jr-label">Mapped Job Tracker Job</div>
              <div className="jr-copy">
                {mappedJob ? mappedJob.title : `Job ${readiness?.mapping?.job_id}`}
              </div>
              <div className="jr-card-meta">
                ID: {readiness?.mapping?.job_id} · Location: {mappedJob?.location ?? "—"}
              </div>
            </div>

            <div className="jr-facts">
              <div className="jr-fact">
                <div>Change Order ID</div>
                <strong>{readiness?.change_order_id}</strong>
              </div>
              <div className="jr-fact">
                <div>Revision</div>
                <strong>{readiness?.revision}</strong>
              </div>
            </div>

            <div className="jr-section-block">
              <div className="jr-label">Scope</div>
              <div className="jr-copy">
                {detail?.scope ?? readiness?.title}
              </div>
            </div>

            {detail && detail.tasks.length > 0 ? (
              <div className="jr-section-block">
                <div className="jr-label">Tasks</div>
                <div className="jr-list">
                  {detail.tasks.map((task) => (
                    <div key={task.task_id} className="jr-list-item">
                      <div className="jr-list-title">{task.title}</div>
                      <div className="jr-card-meta">
                        {task.quantity} × {task.unit}
                      </div>
                      <div className="jr-card-meta jr-prewrap">
                        {task.instructions}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="jr-subpanel jr-subpanel--accent">
              <div className="jr-copy">
                {readiness?.currency} {formatMinorAmount(readiness?.approved_amount_minor ?? 0)}
              </div>
              <div className="jr-muted">
                Reference only — not written to Job Tracker operational or financial data.
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="jr-button jr-button--quiet">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="jr-button jr-button--primary"
              disabled={applyMutation.isPending}
              onClick={confirmApply}
            >
              {applyMutation.isPending ? "Applying..." : "Confirm Apply"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={contactOpen}
        onOpenChange={(open) => {
          if (open) {
            setContactOpen(true);
          } else {
            resetContactDialog();
          }
        }}
      >
        <DialogContent className="jr-dialog jr-dialog--scroll">
          <DialogHeader>
            <DialogTitle className="jr-dialog-title">Contact Contractor</DialogTitle>
            <DialogDescription className="jr-dialog-description">
              Manually select a contractor, preview the exact WhatsApp instruction, then confirm before sending.
            </DialogDescription>
          </DialogHeader>

          <div className="jr-substack">
            <div className="jr-section-block">
              <div className="jr-label">Select Contractor</div>
              {contractorCandidatesLoading ? (
                <div className="jr-empty">Loading contractors...</div>
              ) : (contractorCandidates?.contractors ?? []).length === 0 ? (
                <div className="jr-empty jr-empty--dashed">
                  No contractor candidates with an approved phone were found for this job.
                </div>
              ) : (
                <div className="jr-choice-list jr-choice-list--short">
                  {(contractorCandidates?.contractors ?? []).map((contractor) => {
                    const isSelected = selectedContractor?.contractor_id === contractor.contractor_id;
                    return (
                      <button
                        key={contractor.contractor_id}
                        type="button"
                        onClick={() => {
                          setSelectedContractor(contractor);
                          setMessagePreview(null);
                        }}
                        className={isSelected ? "jr-choice jr-choice--success" : "jr-choice"}
                      >
                        <div className="jr-card-heading">
                          <div className="jr-card-title">{contractor.name}</div>
                          {contractor.assigned_job_id ? (
                            <Badge className="jr-badge jr-badge--info">Assigned Job</Badge>
                          ) : null}
                        </div>
                        <div className="jr-card-meta">{contractor.phone}</div>
                        {contractor.assigned_job_title ? (
                          <div className="jr-muted">{contractor.assigned_job_title}</div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {messagePreview ? (
              <div className="jr-subpanel jr-subpanel--accent">
                <div>
                  <div className="jr-label">Preview</div>
                  <div className="jr-muted">No WhatsApp message has been sent yet.</div>
                </div>
                <div className="jr-facts jr-facts--compact">
                  <div className="jr-fact">
                    <div>Contractor</div>
                    <strong>{messagePreview.contractor_name}</strong>
                  </div>
                  <div className="jr-fact">
                    <div>Destination Phone</div>
                    <strong>{messagePreview.phone_e164}</strong>
                  </div>
                </div>
                <div className="jr-section-block">
                  <div className="jr-label">Exact Message Body</div>
                  <div className="jr-message-body jr-message-body--large">
                    {messagePreview.body}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="jr-button jr-button--quiet"
              onClick={resetContactDialog}
            >
              Cancel
            </Button>
            <Button
              className="jr-button jr-button--primary"
              disabled={selectedContractor === null || previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              {previewMutation.isPending ? "Previewing..." : "Preview"}
            </Button>
            <Button
              className="jr-button jr-button--success"
              disabled={messagePreview === null}
              onClick={() => setSendConfirmOpen(true)}
            >
              Send WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={sendConfirmOpen}
        onOpenChange={(open) => !open && setSendConfirmOpen(false)}
      >
        <AlertDialogContent className="jr-dialog jr-dialog--scroll">
          <AlertDialogHeader>
            <AlertDialogTitle className="jr-dialog-title">Final Confirmation: Send WhatsApp</AlertDialogTitle>
            <AlertDialogDescription className="jr-dialog-description">
              This WhatsApp instruction will now be sent to the selected contractor.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {messagePreview ? (
            <div className="jr-substack">
              <div className="jr-subpanel">
                <div className="jr-label">Contractor</div>
                <div className="jr-copy">{messagePreview.contractor_name}</div>
                <div className="jr-card-meta">{messagePreview.phone_e164}</div>
              </div>
              <div className="jr-section-block">
                <div className="jr-label">Full Message Body</div>
                <div className="jr-message-body jr-message-body--large">
                  {messagePreview.body}
                </div>
              </div>
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel className="jr-button jr-button--quiet">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="jr-button jr-button--success"
              disabled={sendMessageMutation.isPending || messagePreview === null}
              onClick={() => sendMessageMutation.mutate()}
            >
              {sendMessageMutation.isPending ? "Sending..." : "Confirm Send"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
