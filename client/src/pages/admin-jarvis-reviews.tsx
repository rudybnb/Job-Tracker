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
      return <Badge className="bg-green-600 text-white">Approved</Badge>;
    case "rejected":
      return <Badge className="bg-red-600 text-white">Rejected</Badge>;
    case "sent_back":
      return <Badge className="bg-blue-600 text-white">Sent Back</Badge>;
    default:
      return <Badge className="bg-yellow-600 text-black">Pending</Badge>;
  }
}

function readinessBadge(status: ApplicationStatus) {
  switch (status) {
    case "ready":
      return <Badge className="bg-green-600 text-white">Ready</Badge>;
    case "pending_mapping":
      return <Badge className="bg-yellow-600 text-black">Pending Mapping</Badge>;
    default:
      return <Badge className="bg-slate-600 text-white">{status.replace(/_/g, " ")}</Badge>;
  }
}

function jobStatusBadge(status: string) {
  const classes =
    status === "completed"
      ? "bg-green-600 text-white"
      : status === "assigned"
        ? "bg-blue-600 text-white"
        : "bg-yellow-600 text-black";
  return <Badge className={classes}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

function whatsappStatusBadge(message: ContractorMessageHistoryItem) {
  if (message.status === "failed" || message.delivery_status === "failed") {
    return <Badge className="bg-red-600 text-white">Failed</Badge>;
  }
  if (message.delivery_status === "read") {
    return <Badge className="bg-green-600 text-white">Read</Badge>;
  }
  if (message.delivery_status === "delivered") {
    return <Badge className="bg-blue-600 text-white">Delivered</Badge>;
  }
  if (message.delivery_status === "sent" || message.status === "sent") {
    return <Badge className="bg-yellow-600 text-black">Sent</Badge>;
  }
  return <Badge className="bg-slate-600 text-white">Queued</Badge>;
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
    <div className="min-h-screen bg-slate-800">
      <div className="bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Jarvis Shadow Reviews</h1>
          <p className="text-sm text-slate-400">
            Review inbox for incoming approved change orders. Decisions are recorded only — no operational data is changed.
          </p>
        </div>
        <Button
          variant="outline"
          className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600"
          onClick={() => (window.location.href = "/admin-dashboard")}
        >
          Back to Admin
        </Button>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                filter === option.value
                  ? "bg-yellow-600 text-black"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-slate-900 rounded-lg border border-slate-700 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
              Inbox ({filtered.length})
            </h2>
            {isLoading ? (
              <div className="text-slate-400 text-sm">Loading review inbox...</div>
            ) : filtered.length === 0 ? (
              <div className="text-slate-400 text-sm">No changes in this view.</div>
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
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${
                      isSelected
                        ? "border-yellow-600 bg-slate-800"
                        : "border-slate-700 bg-slate-800 hover:border-slate-500"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-white truncate">{change.title}</div>
                      {statusBadge(change.review_status)}
                    </div>
                    <div className="mt-1 text-xs text-slate-400 space-y-0.5">
                      <div>
                        CO: <span className="text-slate-300">{change.change_order_id}</span> · Rev{" "}
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

          <div className="bg-slate-900 rounded-lg border border-slate-700 p-4">
            {selected === null ? (
              <div className="text-slate-400 text-sm">
                Select a change to review its full supplied information.
              </div>
            ) : detailLoading ? (
              <div className="text-slate-400 text-sm">Loading change detail...</div>
            ) : detail === undefined ? (
              <div className="text-slate-400 text-sm">Change detail could not be loaded.</div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-white">{detail.title}</h2>
                  {statusBadge(detail.review_status)}
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-slate-400">Change Order ID</div>
                    <div className="text-slate-200">{detail.change_order_id}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Revision</div>
                    <div className="text-slate-200">{detail.revision}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Project (Integration ID)</div>
                    <div className="text-slate-200">{detail.project_integration_id}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Amount</div>
                    <div className="text-slate-200">
                      {detail.currency} {formatMinorAmount(detail.approved_amount_minor)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Approved By (Actor ID)</div>
                    <div className="text-slate-200">{detail.approved_by_actor_id}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Approved At</div>
                    <div className="text-slate-200">{formatTimestamp(detail.approved_at)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Occurred At</div>
                    <div className="text-slate-200">{formatTimestamp(detail.occurred_at)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Received At</div>
                    <div className="text-slate-200">{formatTimestamp(detail.received_at)}</div>
                  </div>
                </div>

                <div>
                  <div className="text-slate-400 text-sm">Scope</div>
                  <div className="text-slate-200 text-sm whitespace-pre-wrap">{detail.scope}</div>
                </div>

                <div>
                  <div className="text-slate-400 text-sm mb-1">Tasks</div>
                  <div className="rounded-lg border border-slate-700 divide-y divide-slate-700">
                    {detail.tasks.map((task) => (
                      <div key={task.task_id} className="p-3 space-y-1">
                        <div className="text-sm font-medium text-white">{task.title}</div>
                        <div className="text-xs text-slate-400">
                          {task.quantity} × {task.unit} · {detail.currency}{" "}
                          {formatMinorAmount(task.approved_amount_minor)}
                        </div>
                        <div className="text-xs text-slate-400 whitespace-pre-wrap">
                          {task.instructions}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-700 p-3 space-y-2">
                  <div className="text-slate-400 text-sm font-medium">Application Readiness</div>
                  {readiness === undefined ? (
                    <div className="text-xs text-slate-500">
                      Readiness is not available for this change.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div>
                          <div className="text-slate-400 text-xs">Project (Integration ID)</div>
                          <div className="text-slate-200">{readiness.project_integration_id}</div>
                        </div>
                        <div>
                          <div className="text-slate-400 text-xs">Status</div>
                          <div className="pt-1">{readinessBadge(readiness.status)}</div>
                        </div>
                      </div>

                      {readiness.mapping ? (
                        <div className="space-y-2">
                          <div className="text-slate-400 text-xs">Mapped Job Tracker Job</div>
                          <div className="text-slate-200 text-sm">
                            {mappedJob
                              ? `${mappedJob.title} — ${mappedJob.location}`
                              : `#${readiness.mapping.job_id}`}
                          </div>
                          <div className="text-xs text-slate-500">
                            ID: {readiness.mapping.job_id} · Mapped by {readiness.mapping.mapped_by}
                          </div>
                          {readiness.status === "ready" ? (
                            <div className="pt-1">
                              <Button
                                className="bg-yellow-600 text-black hover:bg-yellow-700"
                                disabled={applyMutation.isPending}
                                onClick={() => setApplyConfirmOpen(true)}
                              >
                                {applyMutation.isPending ? "Applying..." : "Apply to Job"}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ) : readiness.status === "pending_mapping" ? (
                        <div className="pt-1">
                          <Button
                            className="bg-yellow-600 text-black hover:bg-yellow-700"
                            onClick={() => setPickerOpen(true)}
                          >
                            Map Project
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-slate-700 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-slate-400 text-sm font-medium">WhatsApp Communication</div>
                      <div className="text-xs text-slate-500">
                        Human-confirmed contractor instructions only. No automatic sends.
                      </div>
                    </div>
                    {appliedApplication && appliedJobId ? (
                      <Button
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => setContactOpen(true)}
                      >
                        Contact Contractor
                      </Button>
                    ) : null}
                  </div>

                  {!appliedApplication ? (
                    <div className="text-xs text-slate-500">
                      WhatsApp contact is available after the change has been applied.
                    </div>
                  ) : (messageHistory?.messages ?? []).length === 0 ? (
                    <div className="text-xs text-slate-500">No WhatsApp instructions for this application yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {(messageHistory?.messages ?? []).map((message) => (
                        <div key={message.id} className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-sm font-medium text-white">
                                {message.contractor_name ?? message.contractor_id}
                              </div>
                              <div className="text-xs text-slate-400">{message.phone_e164}</div>
                            </div>
                            {whatsappStatusBadge(message)}
                          </div>

                          <div className="text-xs text-slate-400">
                            Sent: {formatTimestamp(message.sent_at)}
                            {message.provider_message_id ? ` · Provider: ${message.provider_message_id}` : ""}
                          </div>
                          {message.delivered_at ? (
                            <div className="text-xs text-slate-400">Delivered: {formatTimestamp(message.delivered_at)}</div>
                          ) : null}
                          {message.read_at ? (
                            <div className="text-xs text-slate-400">Read: {formatTimestamp(message.read_at)}</div>
                          ) : null}
                          <div className="text-xs text-slate-400">
                            {message.acknowledged_at ? "Acknowledged: Contractor replied." : "Awaiting Reply"}
                          </div>
                          {message.error_code ? (
                            <div className="text-xs text-red-300">Failure detail: {message.error_code}</div>
                          ) : null}
                          <div className="rounded border border-slate-700 bg-slate-950/50 p-2 text-xs text-slate-200 whitespace-pre-wrap">
                            {message.body}
                          </div>
                          {message.replies.length > 0 ? (
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-slate-400">Contractor replies</div>
                              {message.replies.map((reply) => (
                                <div key={reply.id} className="rounded border border-slate-700 bg-slate-800 p-2">
                                  <div className="text-xs text-slate-400">
                                    {reply.phone_e164} · {formatTimestamp(reply.created_at)}
                                  </div>
                                  <div className="text-sm text-slate-200 whitespace-pre-wrap">{reply.body}</div>
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
                  <div className="text-xs text-slate-400">
                    Reviewed by {detail.reviewed_by} on {formatTimestamp(detail.reviewed_at)}
                    {detail.note ? (
                      <div className="mt-1 text-slate-300 whitespace-pre-wrap">Note: {detail.note}</div>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => openDecision("approved")}
                  >
                    Approve
                  </Button>
                  <Button
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => openDecision("rejected")}
                  >
                    Reject
                  </Button>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => openDecision("sent_back")}
                  >
                    Send Back
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-900 rounded-lg border border-slate-700 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
                Unmatched WhatsApp Inbound
              </h2>
              <p className="text-xs text-slate-500">Display-only messages that need human review.</p>
            </div>
            <Badge className="bg-red-600 text-white">Needs Review</Badge>
          </div>
          {(unmatchedInbound?.messages ?? []).length === 0 ? (
            <div className="text-sm text-slate-500">No unmatched inbound WhatsApp messages.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(unmatchedInbound?.messages ?? []).map((message) => (
                <div key={message.id} className="rounded-lg border border-slate-700 bg-slate-800 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-white">{message.phone_e164}</div>
                    <Badge className="bg-red-600 text-white">Needs Review</Badge>
                  </div>
                  <div className="text-xs text-slate-400">Received: {formatTimestamp(message.created_at)}</div>
                  <div className="text-xs text-slate-400">Reason: {message.unmatched_reason}</div>
                  <div className="text-sm text-slate-200 whitespace-pre-wrap">{message.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={pendingDecision !== null} onOpenChange={(open) => !open && setPendingDecision(null)}>
        <AlertDialogContent className="bg-slate-800 border-slate-600">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Confirm {pendingDecision === "approved" ? "Approval" : pendingDecision === "rejected" ? "Rejection" : "Send Back"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300">
              This records your decision against change order {selected?.changeOrderId} (revision{" "}
              {selected?.revision}). It does NOT create or modify any operational Job Tracker data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional note for this decision"
            className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-400"
            maxLength={2000}
          />
          <AlertDialogFooter>
            <AlertDialogCancel
              className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600"
              onClick={() => setNote("")}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-yellow-600 text-black hover:bg-yellow-700"
              disabled={decisionMutation.isPending}
              onClick={confirmDecision}
            >
              {decisionMutation.isPending ? "Recording..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={pickerOpen} onOpenChange={(open) => !open && setPickerOpen(false)}>
        <DialogContent className="bg-slate-800 border-slate-600 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Map Project to an Existing Job</DialogTitle>
            <DialogDescription className="text-slate-300">
              Manually select ONE existing Job Tracker job for project{" "}
              <span className="text-slate-100">{readiness?.project_integration_id}</span>. Jobs are
              never auto-matched or auto-created.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by title, location or contractor..."
              className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-400"
            />

            {jobSearchLoading ? (
              <div className="text-sm text-slate-400">Searching jobs...</div>
            ) : jobSearchResults.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400 border border-dashed border-slate-600 rounded-lg">
                No matching jobs found.
                <div className="mt-1 text-xs text-slate-500">
                  No new job will be created. Adjust the search or cancel.
                </div>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-700 divide-y divide-slate-700">
                {jobSearchResults.map((job) => {
                  const isSelected = selectedJob?.id === job.id;
                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => setSelectedJob(job)}
                      className={`w-full text-left p-3 border-l-4 transition-colors ${
                        isSelected
                          ? "bg-slate-700 border-yellow-600"
                          : "border-transparent hover:bg-slate-700/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-white truncate">{job.title}</div>
                        {jobStatusBadge(job.status)}
                      </div>
                      <div className="mt-1 text-xs text-slate-400 space-y-0.5">
                        <div>
                          ID: <span className="text-slate-300">{job.id}</span>
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
              className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600"
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
              className="bg-yellow-600 text-black hover:bg-yellow-700"
              disabled={selectedJob === null}
              onClick={() => setConfirmOpen(true)}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !open && setConfirmOpen(false)}>
        <AlertDialogContent className="bg-slate-800 border-slate-600">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Confirm Project Mapping</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300">
              Map project{" "}
              <span className="text-slate-100 font-medium">{readiness?.project_integration_id}</span>{" "}
              to Job Tracker job{" "}
              <span className="text-slate-100 font-medium">{selectedJob?.id}</span> —{" "}
              {selectedJob?.title} ({selectedJob?.location})? This only records the human mapping.
              No operational job/task data is changed and no application is created yet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-yellow-600 text-black hover:bg-yellow-700"
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
        <AlertDialogContent className="bg-slate-800 border-slate-600 max-h-[85vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Final Confirmation: Apply to Job</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300">
              This will append the approved scope and tasks to the mapped Job Tracker job. Existing
              job information will not be replaced.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-slate-700 p-3 space-y-1">
              <div className="text-slate-400 text-xs font-medium">Mapped Job Tracker Job</div>
              <div className="text-slate-100">
                {mappedJob ? mappedJob.title : `Job ${readiness?.mapping?.job_id}`}
              </div>
              <div className="text-slate-300">
                ID: {readiness?.mapping?.job_id} · Location: {mappedJob?.location ?? "—"}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-slate-400 text-xs">Change Order ID</div>
                <div className="text-slate-200">{readiness?.change_order_id}</div>
              </div>
              <div>
                <div className="text-slate-400 text-xs">Revision</div>
                <div className="text-slate-200">{readiness?.revision}</div>
              </div>
            </div>

            <div>
              <div className="text-slate-400 text-xs">Scope</div>
              <div className="text-slate-200 whitespace-pre-wrap">
                {detail?.scope ?? readiness?.title}
              </div>
            </div>

            {detail && detail.tasks.length > 0 ? (
              <div>
                <div className="text-slate-400 text-xs mb-1">Tasks</div>
                <div className="rounded-lg border border-slate-700 divide-y divide-slate-700">
                  {detail.tasks.map((task) => (
                    <div key={task.task_id} className="p-2 space-y-0.5">
                      <div className="font-medium text-white">{task.title}</div>
                      <div className="text-xs text-slate-400">
                        {task.quantity} × {task.unit}
                      </div>
                      <div className="text-xs text-slate-400 whitespace-pre-wrap">
                        {task.instructions}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
              <div className="text-slate-300">
                {readiness?.currency} {formatMinorAmount(readiness?.approved_amount_minor ?? 0)}
              </div>
              <div className="text-xs text-slate-500">
                Reference only — not written to Job Tracker operational or financial data.
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-yellow-600 text-black hover:bg-yellow-700"
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
        <DialogContent className="bg-slate-800 border-slate-600 text-white max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Contact Contractor</DialogTitle>
            <DialogDescription className="text-slate-300">
              Manually select a contractor, preview the exact WhatsApp instruction, then confirm before sending.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-slate-300 mb-2">Select Contractor</div>
              {contractorCandidatesLoading ? (
                <div className="text-sm text-slate-400">Loading contractors...</div>
              ) : (contractorCandidates?.contractors ?? []).length === 0 ? (
                <div className="text-sm text-slate-400 border border-dashed border-slate-600 rounded-lg p-4">
                  No contractor candidates with an approved phone were found for this job.
                </div>
              ) : (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-700 divide-y divide-slate-700">
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
                        className={`w-full text-left p-3 border-l-4 transition-colors ${
                          isSelected
                            ? "bg-slate-700 border-green-600"
                            : "border-transparent hover:bg-slate-700/60"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-white">{contractor.name}</div>
                          {contractor.assigned_job_id ? (
                            <Badge className="bg-blue-600 text-white">Assigned Job</Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-slate-400">{contractor.phone}</div>
                        {contractor.assigned_job_title ? (
                          <div className="text-xs text-slate-500">{contractor.assigned_job_title}</div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {messagePreview ? (
              <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-3">
                <div>
                  <div className="text-sm font-medium text-slate-300">Preview</div>
                  <div className="text-xs text-slate-500">No WhatsApp message has been sent yet.</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-slate-400 text-xs">Contractor</div>
                    <div className="text-slate-100">{messagePreview.contractor_name}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-xs">Destination Phone</div>
                    <div className="text-slate-100">{messagePreview.phone_e164}</div>
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs mb-1">Exact Message Body</div>
                  <div className="rounded border border-slate-700 bg-slate-950/50 p-3 text-sm text-slate-200 whitespace-pre-wrap">
                    {messagePreview.body}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600"
              onClick={resetContactDialog}
            >
              Cancel
            </Button>
            <Button
              className="bg-yellow-600 text-black hover:bg-yellow-700"
              disabled={selectedContractor === null || previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              {previewMutation.isPending ? "Previewing..." : "Preview"}
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
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
        <AlertDialogContent className="bg-slate-800 border-slate-600 max-h-[85vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Final Confirmation: Send WhatsApp</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300">
              This WhatsApp instruction will now be sent to the selected contractor.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {messagePreview ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-slate-700 p-3">
                <div className="text-slate-400 text-xs">Contractor</div>
                <div className="text-slate-100">{messagePreview.contractor_name}</div>
                <div className="text-slate-300">{messagePreview.phone_e164}</div>
              </div>
              <div>
                <div className="text-slate-400 text-xs mb-1">Full Message Body</div>
                <div className="rounded border border-slate-700 bg-slate-950/50 p-3 text-slate-200 whitespace-pre-wrap">
                  {messagePreview.body}
                </div>
              </div>
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700 text-white"
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
