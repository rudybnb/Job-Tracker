import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertTriangle, CheckCircle, Clock, User, Building2, XCircle } from "lucide-react";

type TimeStatus = "UNVERIFIED" | "VERIFIED" | "REJECTED";

interface TimeRecordRow {
  id: string;
  job_id: string | null;
  worker_id: string | null;
  work_session_id: string | null;
  work_date: string | null;
  clock_in_at: string | null;
  clock_out_at: string | null;
  verified_payable_minutes: number | null;
  time_status: TimeStatus;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
  worker_first_name: string | null;
  worker_last_name: string | null;
  worker_type: string | null;
  job_title: string | null;
}

interface LabourVerificationDialog {
  kind: "verify" | "reject";
  record: TimeRecordRow;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function workedMinutes(record: TimeRecordRow): number | null {
  if (!record.clock_in_at || !record.clock_out_at) return null;
  const start = new Date(record.clock_in_at).getTime();
  const end = new Date(record.clock_out_at).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / 60000);
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

const statusVariant: Record<TimeStatus, "default" | "secondary" | "destructive" | "outline"> = {
  VERIFIED: "default",
  UNVERIFIED: "outline",
  REJECTED: "destructive",
};

function StatusBadge({ status }: { status: TimeStatus }) {
  return <Badge variant={statusVariant[status]}>{status}</Badge>;
}

export default function AdminLabourVerification() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("UNVERIFIED");
  const [dialog, setDialog] = useState<LabourVerificationDialog | null>(null);
  const [minutesInput, setMinutesInput] = useState<string>("");
  const [noteInput, setNoteInput] = useState<string>("");

  const { data: records = [], isLoading } = useQuery<TimeRecordRow[]>({
    queryKey: ["/api/labour/time-records", { status: statusFilter }],
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/labour/time-records"] });
  };

  const verifyMutation = useMutation({
    mutationFn: async (payload: { id: string; verifiedPayableMinutes: number; note?: string }) => {
      const response = await apiRequest("POST", `/api/labour/time-records/${payload.id}/verify`, {
        verifiedPayableMinutes: payload.verifiedPayableMinutes,
        note: payload.note,
      });
      return response.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Time record verified", description: "Re-run calculations to produce the updated cost." });
    },
    onError: (error: Error) => {
      toast({ title: "Verification failed", description: error.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (payload: { id: string; note?: string }) => {
      const response = await apiRequest("POST", `/api/labour/time-records/${payload.id}/reject`, {
        note: payload.note,
      });
      return response.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Time record rejected", description: "The record will be excluded from labour costs." });
    },
    onError: (error: Error) => {
      toast({ title: "Rejection failed", description: error.message, variant: "destructive" });
    },
  });

  const openDialog = (kind: "verify" | "reject", record: TimeRecordRow) => {
    setMinutesInput(record.verified_payable_minutes?.toString() ?? (workedMinutes(record)?.toString() ?? ""));
    setNoteInput(record.notes ?? "");
    setDialog({ kind, record });
  };

  const pending = verifyMutation.isPending || rejectMutation.isPending;

  const submitDialog = () => {
    if (!dialog) return;
    if (dialog.kind === "verify") {
      const minutes = Number(minutesInput);
      if (!Number.isInteger(minutes) || minutes <= 0) {
        toast({ title: "Invalid minutes", description: "Enter a positive whole number of payable minutes.", variant: "destructive" });
        return;
      }
      verifyMutation.mutate(
        { id: dialog.record.id, verifiedPayableMinutes: minutes, note: noteInput.trim() || undefined },
        { onSuccess: () => setDialog(null) },
      );
    } else {
      rejectMutation.mutate(
        { id: dialog.record.id, note: noteInput.trim() || undefined },
        { onSuccess: () => setDialog(null) },
      );
    }
  };

  const summary = useMemo(() => {
    const verified = records.filter((row) => row.time_status === "VERIFIED").length;
    const rejected = records.filter((row) => row.time_status === "REJECTED").length;
    const pendingCount = records.length;
    return { pendingCount, verified, rejected };
  }, [records]);

  const actionable = records.filter((row) => row.time_status !== "REJECTED");

  return (
    <div className="min-h-screen bg-muted/30 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Labour Time Verification</h1>
          <p className="text-sm text-muted-foreground">
            Review worker clock-in/clock-out records, confirm payable time, and reject incorrect entries. Only VERIFIED time is used in labour cost calculations.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>In current filter</CardDescription>
              <CardTitle>{summary.pendingCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Verified</CardDescription>
              <CardTitle>{summary.verified}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Rejected</CardDescription>
              <CardTitle>{summary.rejected}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="flex items-center justify-between gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UNVERIFIED">UNVERIFIED</SelectItem>
              <SelectItem value="VERIFIED">VERIFIED</SelectItem>
              <SelectItem value="REJECTED">REJECTED</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => invalidate()}
            disabled={isLoading}
          >
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading time records…</p>
        ) : records.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No {statusFilter.toLowerCase()} time records. Clock-in/clock-out data will appear here as workers log sessions.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {records.map((record) => (
              <Card key={record.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={record.time_status} />
                        <span className="flex items-center gap-1 text-sm font-medium">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {record.worker_first_name} {record.worker_last_name}
                          {record.worker_type ? <span className="text-muted-foreground">({record.worker_type})</span> : null}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {record.job_title ?? "—"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDateTime(record.clock_in_at)} → {formatDateTime(record.clock_out_at)}
                        </span>
                        <span>
                          Worked: <strong className="text-foreground">{formatDuration(workedMinutes(record))}</strong>
                        </span>
                        {record.verified_payable_minutes !== null && (
                          <span>
                            Payable: <strong className="text-foreground">{record.verified_payable_minutes} min</strong>
                          </span>
                        )}
                      </div>
                      {record.notes ? (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">Note:</span> {record.notes}
                        </p>
                      ) : null}
                      {record.verified_by ? (
                        <p className="text-xs text-muted-foreground">
                          {record.time_status === "REJECTED" ? "Rejected" : "Verified"} by {record.verified_by} on {formatDateTime(record.verified_at)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {record.time_status === "REJECTED" ? (
                        <Button variant="outline" size="sm" onClick={() => openDialog("verify", record)}>
                          <CheckCircle className="mr-1 h-4 w-4" />
                          Re-verify
                        </Button>
                      ) : (
                        <>
                          <Button variant="default" size="sm" onClick={() => openDialog("verify", record)}>
                            <CheckCircle className="mr-1 h-4 w-4" />
                            Verify
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => openDialog("reject", record)}>
                            <XCircle className="mr-1 h-4 w-4" />
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open && !pending) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.kind === "verify" ? "Verify time record" : "Reject time record"}
            </DialogTitle>
            <DialogDescription>
              {dialog?.kind === "verify"
                ? "Confirm the verified payable minutes used for the labour cost calculation. Only VERIFIED records are calculated."
                : "Rejected records are excluded from labour cost calculations. Add a short reason where useful."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {dialog?.kind === "verify" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Verified payable minutes</label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={minutesInput}
                  onChange={(event) => setMinutesInput(event.target.value)}
                  placeholder="e.g. 480"
                />
                <p className="text-xs text-muted-foreground">
                  Calculated worked time:{" "}
                  {dialog ? formatDuration(workedMinutes(dialog.record)) : "—"}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                This will clear any verified payable minutes for the record.
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Note / reason (optional)</label>
              <Textarea
                value={noteInput}
                onChange={(event) => setNoteInput(event.target.value)}
                placeholder={dialog?.kind === "verify" ? "e.g. verified against session clock" : "e.g. clock-out missing, time incorrect"}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant={dialog?.kind === "verify" ? "default" : "destructive"}
              onClick={submitDialog}
              disabled={pending}
            >
              {pending ? "Saving…" : dialog?.kind === "verify" ? "Verify record" : "Reject record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {actionable.length === 0 && records.length > 0 ? (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          All records in this view have been decided. Use the filter above to review other statuses.
        </p>
      ) : null}
    </div>
  );
}
