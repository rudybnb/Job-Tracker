import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type CalculationStatus = "PENDING" | "RESOLVED" | "UNRESOLVED" | "ERROR";
type SettlementStatus = "UNRESOLVED" | "REVIEW_REQUIRED" | "APPROVED" | "VOIDED";
type CisStatus = "UNRESOLVED" | "NOT_APPLICABLE" | "GROSS_PAYMENT" | "NET_DEDUCTION" | "HIGHER_RATE_DEDUCTION";

interface CalculationRow {
  calculation_id: string;
  time_record_id: string;
  calculation_status: CalculationStatus;
  unresolved_reason: string | null;
  calculated_cost: string | null;
  verified_payable_minutes: number | null;
  currency_code: string | null;
  job_title: string | null;
  worker_first_name: string | null;
  worker_last_name: string | null;
  worker_type: string | null;
  payee_name: string | null;
  payee_type: string | null;
}

interface PayeeRow {
  id: string;
  name: string;
  payee_type: string;
  worker_type: string | null;
  supplier_type: string | null;
  cis_status: CisStatus | null;
  deduction_rate: string | null;
  verification_reference: string | null;
  verified_by: string | null;
  verified_at: string | null;
  source_evidence: string | null;
  notes: string | null;
}

interface SettlementRow {
  id: string;
  payee_name: string | null;
  worker_names: string | null;
  job_title: string | null;
  period_start: string | null;
  period_end: string | null;
  gross_amount: string;
  cis_status: CisStatus;
  cis_deduction_rate: string | null;
  cis_deduction_amount: string | null;
  net_amount: string | null;
  status: SettlementStatus;
  unresolved_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  RESOLVED: "default",
  REVIEW_REQUIRED: "secondary",
  APPROVED: "default",
  UNRESOLVED: "outline",
  PENDING: "secondary",
  ERROR: "destructive",
  VOIDED: "destructive",
};

function formatMoney(value: string | null, currency = "GBP"): string {
  if (value === null) return "-";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value));
  } catch {
    return value;
  }
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export default function AdminLabourReview() {
  const { toast } = useToast();
  const [calculationStatus, setCalculationStatus] = useState<CalculationStatus>("RESOLVED");
  const [settlementStatus, setSettlementStatus] = useState<SettlementStatus | "ALL">("ALL");
  const [payeeId, setPayeeId] = useState("");
  const [cisStatus, setCisStatus] = useState<CisStatus>("UNRESOLVED");
  const [deductionRate, setDeductionRate] = useState("");
  const [verificationReference, setVerificationReference] = useState("");
  const [sourceEvidence, setSourceEvidence] = useState("");
  const [notes, setNotes] = useState("");

  const calculationsQuery = useQuery<{ calculations: CalculationRow[] }>({
    queryKey: ["/api/labour/calculations", { status: calculationStatus }],
  });
  const payeesQuery = useQuery<{ payees: PayeeRow[] }>({ queryKey: ["/api/labour/payees"] });
  const settlementsQuery = useQuery<{ settlements: SettlementRow[] }>({
    queryKey: ["/api/labour/settlements", settlementStatus === "ALL" ? {} : { status: settlementStatus }],
  });

  const calculations = calculationsQuery.data?.calculations ?? [];
  const payees = payeesQuery.data?.payees ?? [];
  const settlements = settlementsQuery.data?.settlements ?? [];

  const selectedPayee = useMemo(() => payees.find((payee) => payee.id === payeeId) ?? null, [payees, payeeId]);

  const invalidateLabour = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/labour/calculations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/labour/payees"] });
    queryClient.invalidateQueries({ queryKey: ["/api/labour/settlements"] });
  };

  const saveCisMutation = useMutation({
    mutationFn: async () => {
      if (!payeeId) throw new Error("Select a payee first");
      const body: Record<string, unknown> = {
        cisStatus,
        verificationReference: verificationReference.trim() || undefined,
        sourceEvidence: sourceEvidence.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      if (deductionRate.trim()) body.deductionRate = deductionRate.trim();
      const response = await apiRequest("PUT", `/api/labour/payees/${payeeId}/cis-profile`, body);
      return response.json();
    },
    onSuccess: () => {
      invalidateLabour();
      toast({ title: "CIS profile saved", description: "Refresh unresolved settlements to use the verified profile." });
    },
    onError: (error: Error) => toast({ title: "CIS save failed", description: error.message, variant: "destructive" }),
  });

  const createSettlementMutation = useMutation({
    mutationFn: async (calculationId: string) => {
      const response = await apiRequest("POST", "/api/labour/settlements", { calculationIds: [calculationId] });
      return response.json();
    },
    onSuccess: () => {
      invalidateLabour();
      toast({ title: "Settlement created", description: "Review CIS/net amount before approving." });
    },
    onError: (error: Error) => toast({ title: "Settlement failed", description: error.message, variant: "destructive" }),
  });

  const refreshMutation = useMutation({
    mutationFn: async (settlementId: string) => {
      const response = await apiRequest("POST", `/api/labour/settlements/${settlementId}/refresh`, {});
      return response.json();
    },
    onSuccess: () => {
      invalidateLabour();
      toast({ title: "Settlement refreshed", description: "Unlocked settlement recalculated from current CIS profile." });
    },
    onError: (error: Error) => toast({ title: "Refresh failed", description: error.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async (settlementId: string) => {
      const response = await apiRequest("POST", `/api/labour/settlements/${settlementId}/approve`, { reviewNotes: "Amount owed confirmed" });
      return response.json();
    },
    onSuccess: () => {
      invalidateLabour();
      toast({ title: "Settlement approved", description: "Amount owed is confirmed. No payment has been created." });
    },
    onError: (error: Error) => toast({ title: "Approval failed", description: error.message, variant: "destructive" }),
  });

  const choosePayee = (value: string) => {
    setPayeeId(value);
    const payee = payees.find((candidate) => candidate.id === value);
    setCisStatus(payee?.cis_status ?? "UNRESOLVED");
    setDeductionRate(payee?.deduction_rate ?? "");
    setVerificationReference(payee?.verification_reference ?? "");
    setSourceEvidence(payee?.source_evidence ?? "");
    setNotes(payee?.notes ?? "");
  };

  return (
    <div className="min-h-screen bg-muted/30 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Labour Settlement Review</h1>
          <p className="text-sm text-muted-foreground">
            Review CIS profiles, create settlements from RESOLVED labour calculations, and approve confirmed amounts owed. This screen does not create payments.
          </p>
        </div>

        <Tabs defaultValue="settlements" className="space-y-4">
          <TabsList>
            <TabsTrigger value="settlements">Settlements</TabsTrigger>
            <TabsTrigger value="cis">CIS profiles</TabsTrigger>
            <TabsTrigger value="calculations">Resolved labour</TabsTrigger>
          </TabsList>

          <TabsContent value="settlements" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Select value={settlementStatus} onValueChange={(value) => setSettlementStatus(value as SettlementStatus | "ALL")}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All settlements</SelectItem>
                  <SelectItem value="UNRESOLVED">UNRESOLVED</SelectItem>
                  <SelectItem value="REVIEW_REQUIRED">REVIEW_REQUIRED</SelectItem>
                  <SelectItem value="APPROVED">APPROVED</SelectItem>
                  <SelectItem value="VOIDED">VOIDED</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={invalidateLabour}>Refresh</Button>
            </div>
            <div className="space-y-3">
              {settlements.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No settlements in this view.</CardContent></Card> : null}
              {settlements.map((settlement) => (
                <Card key={settlement.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={statusVariant[settlement.status]}>{settlement.status}</Badge>
                          <span className="font-medium">{settlement.payee_name ?? "Unknown payee"}</span>
                          <span className="text-sm text-muted-foreground">{settlement.job_title ?? "No job"}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span>Workers: {settlement.worker_names ?? "-"}</span>
                          <span>Period: {formatDate(settlement.period_start)} to {formatDate(settlement.period_end)}</span>
                          <span>CIS: {settlement.cis_status}{settlement.cis_deduction_rate ? ` @ ${settlement.cis_deduction_rate}%` : ""}</span>
                        </div>
                        {settlement.unresolved_reason ? <p className="text-xs text-destructive">{settlement.unresolved_reason}</p> : null}
                        {settlement.approved_by ? <p className="text-xs text-muted-foreground">Approved by {settlement.approved_by} on {formatDate(settlement.approved_at)}</p> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-right text-sm">
                          <div>Gross <strong>{formatMoney(settlement.gross_amount)}</strong></div>
                          <div>CIS <strong>{formatMoney(settlement.cis_deduction_amount)}</strong></div>
                          <div>Net <strong>{formatMoney(settlement.net_amount)}</strong></div>
                        </div>
                        {settlement.status !== "APPROVED" ? <Button variant="outline" size="sm" onClick={() => refreshMutation.mutate(settlement.id)}>Refresh</Button> : null}
                        {settlement.status === "REVIEW_REQUIRED" && settlement.net_amount && !settlement.unresolved_reason ? (
                          <Button size="sm" onClick={() => approveMutation.mutate(settlement.id)}>Approve amount owed</Button>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="cis" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>CIS profile review</CardTitle>
                <CardDescription>Set only verified CIS information. Leave unresolved when status or rate is not known.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Payee</label>
                  <Select value={payeeId} onValueChange={choosePayee}>
                    <SelectTrigger><SelectValue placeholder="Select payee" /></SelectTrigger>
                    <SelectContent>
                      {payees.map((payee) => <SelectItem key={payee.id} value={payee.id}>{payee.name} ({payee.payee_type})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {selectedPayee ? <p className="text-xs text-muted-foreground">Current: {selectedPayee.cis_status ?? "UNRESOLVED"}{selectedPayee.deduction_rate ? ` @ ${selectedPayee.deduction_rate}%` : ""}</p> : null}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">CIS status</label>
                  <Select value={cisStatus} onValueChange={(value) => setCisStatus(value as CisStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNRESOLVED">UNRESOLVED</SelectItem>
                      <SelectItem value="NOT_APPLICABLE">NOT_APPLICABLE</SelectItem>
                      <SelectItem value="GROSS_PAYMENT">GROSS_PAYMENT</SelectItem>
                      <SelectItem value="NET_DEDUCTION">NET_DEDUCTION</SelectItem>
                      <SelectItem value="HIGHER_RATE_DEDUCTION">HIGHER_RATE_DEDUCTION</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Deduction rate</label>
                  <Input value={deductionRate} onChange={(event) => setDeductionRate(event.target.value)} placeholder="Only when verified/applicable" />
                  <p className="text-xs text-muted-foreground">Use blank for UNRESOLVED/NOT_APPLICABLE. Use explicit 0.00 for verified GROSS_PAYMENT.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Verification reference</label>
                  <Input value={verificationReference} onChange={(event) => setVerificationReference(event.target.value)} placeholder="HMRC/reference note" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">Evidence / notes</label>
                  <Textarea value={sourceEvidence} onChange={(event) => setSourceEvidence(event.target.value)} placeholder="Evidence location, not fabricated data" rows={2} />
                  <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional admin note" rows={2} />
                </div>
                <div className="md:col-span-2">
                  <Button onClick={() => saveCisMutation.mutate()} disabled={saveCisMutation.isPending || !payeeId}>Save verified CIS profile</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="calculations" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Select value={calculationStatus} onValueChange={(value) => setCalculationStatus(value as CalculationStatus)}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RESOLVED">RESOLVED</SelectItem>
                  <SelectItem value="UNRESOLVED">UNRESOLVED</SelectItem>
                  <SelectItem value="PENDING">PENDING</SelectItem>
                  <SelectItem value="ERROR">ERROR</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={invalidateLabour}>Refresh</Button>
            </div>
            <div className="space-y-3">
              {calculations.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No calculations in this view.</CardContent></Card> : null}
              {calculations.map((row) => (
                <Card key={row.calculation_id}>
                  <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusVariant[row.calculation_status]}>{row.calculation_status}</Badge>
                        <span className="font-medium">{row.worker_first_name} {row.worker_last_name}</span>
                        <span className="text-sm text-muted-foreground">{row.job_title ?? "No job"}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Payee: {row.payee_name ?? "-"} ({row.payee_type ?? "-"}) | Payable: {row.verified_payable_minutes ?? "-"} min | Worker type: {row.worker_type ?? "-"}</p>
                      {row.unresolved_reason ? <p className="text-xs text-destructive">{row.unresolved_reason}</p> : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <strong>{formatMoney(row.calculated_cost, row.currency_code ?? "GBP")}</strong>
                      {row.calculation_status === "RESOLVED" ? <Button size="sm" onClick={() => createSettlementMutation.mutate(row.calculation_id)}>Create settlement</Button> : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
