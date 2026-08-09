import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

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

export default function AdminJarvisReviews() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<ReviewStatus | "all">("all");
  const [selected, setSelected] = useState<{ changeOrderId: string; revision: number } | null>(null);
  const [pendingDecision, setPendingDecision] = useState<ReviewDecision | null>(null);
  const [note, setNote] = useState("");

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
    </div>
  );
}
