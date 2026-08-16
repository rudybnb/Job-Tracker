import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface JobOption {
  id: string;
  title: string;
  clientId?: string | null;
  clientName?: string | null;
}

interface ClientOption {
  id: string;
  name: string;
}

interface PayableRow {
  id: string;
  job_id: string;
  job_title: string;
  payee_name: string;
  source_type: string;
  source_reference: string;
  gross_amount: string;
  cis_amount: string | null;
  net_payable: string;
  amount_paid: string;
  outstanding_amount: string;
  payable_status: string;
  source_status: string;
}

interface ReceivableRow {
  id: string;
  job_id: string;
  job_title: string;
  client_name: string | null;
  reference: string;
  invoice_date: string;
  due_date: string | null;
  gross_amount: string;
  amount_received: string;
  outstanding_amount: string;
  status: string;
  vat_status: string;
}

interface JobSummaryRow {
  job_id: string;
  job_title: string;
  quoted_amount: string | null;
  client_invoiced: string;
  client_received: string;
  client_outstanding: string;
  labour_cost: string;
  subcontractor_supplier_cost: string;
  total_committed_cost: string;
  total_paid: string;
  total_still_owed: string;
  current_gross_margin: string;
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DUE: "secondary",
  PARTIALLY_PAID: "outline",
  PAID: "default",
  DISPUTED: "destructive",
  UNDER_REVIEW: "outline",
  ISSUED: "secondary",
  PART_RECEIVED: "outline",
  RECEIVED: "default",
  CANCELLED: "destructive",
};

function formatMoney(value: string | null | undefined, currency = "GBP"): string {
  if (!value) return "-";
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

function sumRows<T>(rows: T[], pick: (row: T) => string): string {
  return rows.reduce((sum, row) => sum + Number(pick(row) ?? 0), 0).toFixed(2);
}

export default function AdminCommercialFinance() {
  const { toast } = useToast();
  const [jobFilter, setJobFilter] = useState("ALL");
  const [form, setForm] = useState({
    jobId: "",
    clientId: "",
    reference: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    netAmount: "",
    amountReceived: "0.00",
    sourceEvidence: "",
    notes: "",
  });

  const queryFilter = jobFilter === "ALL" ? {} : { jobId: jobFilter };
  const jobsQuery = useQuery<JobOption[]>({ queryKey: ["/api/jobs"] });
  const clientsQuery = useQuery<ClientOption[]>({ queryKey: ["/api/financial/clients"] });
  const payablesQuery = useQuery<{ payables: PayableRow[] }>({ queryKey: ["/api/commercial-finance/payables", queryFilter] });
  const receivablesQuery = useQuery<{ receivables: ReceivableRow[] }>({ queryKey: ["/api/commercial-finance/receivables", queryFilter] });
  const summariesQuery = useQuery<{ jobs: JobSummaryRow[] }>({ queryKey: ["/api/commercial-finance/job-summary", queryFilter] });

  const jobs = jobsQuery.data ?? [];
  const clients = clientsQuery.data ?? [];
  const payables = payablesQuery.data?.payables ?? [];
  const receivables = receivablesQuery.data?.receivables ?? [];
  const summaries = summariesQuery.data?.jobs ?? [];
  const selectedJob = useMemo(() => jobs.find((job) => job.id === form.jobId) ?? null, [jobs, form.jobId]);

  const totals = {
    payableOutstanding: sumRows(payables, (row) => row.outstanding_amount),
    receivableOutstanding: sumRows(receivables, (row) => row.outstanding_amount),
    committedCost: sumRows(summaries, (row) => row.total_committed_cost),
    grossMargin: sumRows(summaries, (row) => row.current_gross_margin),
  };

  const invalidateCommercialFinance = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/commercial-finance/payables"] });
    queryClient.invalidateQueries({ queryKey: ["/api/commercial-finance/receivables"] });
    queryClient.invalidateQueries({ queryKey: ["/api/commercial-finance/job-summary"] });
  };

  const createReceivableMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/commercial-finance/receivables", {
        jobId: form.jobId,
        clientId: form.clientId || selectedJob?.clientId || undefined,
        reference: form.reference,
        invoiceDate: form.invoiceDate,
        dueDate: form.dueDate || undefined,
        netAmount: form.netAmount,
        grossAmount: form.netAmount,
        amountReceived: form.amountReceived || "0.00",
        sourceEvidence: form.sourceEvidence || undefined,
        notes: form.notes || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      invalidateCommercialFinance();
      setForm((current) => ({ ...current, reference: "", netAmount: "", amountReceived: "0.00", sourceEvidence: "", notes: "" }));
      toast({ title: "Receivable recorded", description: "Client amount due was recorded with VAT inactive." });
    },
    onError: (error: Error) => toast({ title: "Receivable failed", description: error.message, variant: "destructive" }),
  });

  const updateForm = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="min-h-screen bg-muted/30 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Commercial Finance</h1>
            <p className="text-sm text-muted-foreground">
              Read-only payables, client receivables and job-level commercial summary. This does not make bank payments, submit CIS or activate VAT.
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={jobFilter} onValueChange={setJobFilter}>
              <SelectTrigger className="w-full md:w-72"><SelectValue placeholder="Filter by job" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All jobs</SelectItem>
                {jobs.map((job) => <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={invalidateCommercialFinance}>Refresh</Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Money owed</p><p className="text-xl font-semibold">{formatMoney(totals.payableOutstanding)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Money due from clients</p><p className="text-xl font-semibold">{formatMoney(totals.receivableOutstanding)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Committed cost</p><p className="text-xl font-semibold">{formatMoney(totals.committedCost)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Current gross margin</p><p className="text-xl font-semibold">{formatMoney(totals.grossMargin)}</p></CardContent></Card>
        </div>

        <Tabs defaultValue="summary" className="space-y-4">
          <TabsList>
            <TabsTrigger value="summary">Job Summary</TabsTrigger>
            <TabsTrigger value="payables">Money Owed</TabsTrigger>
            <TabsTrigger value="receivables">Client Receivables</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-3">
            {summaries.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No job summaries in this view.</CardContent></Card> : null}
            {summaries.map((job) => (
              <Card key={job.job_id}>
                <CardHeader>
                  <CardTitle>{job.job_title}</CardTitle>
                  <CardDescription>Quoted {formatMoney(job.quoted_amount)} · invoiced {formatMoney(job.client_invoiced)} · received {formatMoney(job.client_received)}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm md:grid-cols-5">
                  <div><p className="text-muted-foreground">Client outstanding</p><p className="font-medium">{formatMoney(job.client_outstanding)}</p></div>
                  <div><p className="text-muted-foreground">Labour</p><p className="font-medium">{formatMoney(job.labour_cost)}</p></div>
                  <div><p className="text-muted-foreground">Subcontractor / supplier</p><p className="font-medium">{formatMoney(job.subcontractor_supplier_cost)}</p></div>
                  <div><p className="text-muted-foreground">Still owed</p><p className="font-medium">{formatMoney(job.total_still_owed)}</p></div>
                  <div><p className="text-muted-foreground">Gross margin</p><p className="font-medium">{formatMoney(job.current_gross_margin)}</p></div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="payables" className="space-y-3">
            {payables.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No payable items in this view.</CardContent></Card> : null}
            {payables.map((payable) => (
              <Card key={`${payable.source_type}-${payable.id}`}>
                <CardContent className="grid gap-3 p-4 text-sm md:grid-cols-6 md:items-center">
                  <div className="md:col-span-2"><p className="font-medium">{payable.payee_name}</p><p className="text-muted-foreground">{payable.job_title} · {payable.source_reference}</p></div>
                  <div><p className="text-muted-foreground">Source</p><p>{payable.source_type}</p></div>
                  <div><p className="text-muted-foreground">Net payable</p><p>{formatMoney(payable.net_payable)}</p></div>
                  <div><p className="text-muted-foreground">Outstanding</p><p className="font-medium">{formatMoney(payable.outstanding_amount)}</p></div>
                  <Badge variant={statusVariant[payable.payable_status] ?? "outline"}>{payable.payable_status}</Badge>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="receivables" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Record Client Amount Due</CardTitle>
                <CardDescription>VAT remains inactive: gross amount equals net amount and VAT is recorded as 0.00.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1 md:col-span-2"><Label>Job</Label><Select value={form.jobId} onValueChange={(value) => updateForm("jobId", value)}><SelectTrigger><SelectValue placeholder="Select job" /></SelectTrigger><SelectContent>{jobs.map((job) => <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1 md:col-span-2"><Label>Client</Label><Select value={form.clientId || selectedJob?.clientId || "NONE"} onValueChange={(value) => updateForm("clientId", value === "NONE" ? "" : value)}><SelectTrigger><SelectValue placeholder={selectedJob?.clientName ?? "Optional client"} /></SelectTrigger><SelectContent><SelectItem value="NONE">No linked client</SelectItem>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label>Reference</Label><Input value={form.reference} onChange={(event) => updateForm("reference", event.target.value)} placeholder="INV-001" /></div>
                <div className="space-y-1"><Label>Invoice date</Label><Input type="date" value={form.invoiceDate} onChange={(event) => updateForm("invoiceDate", event.target.value)} /></div>
                <div className="space-y-1"><Label>Due date</Label><Input type="date" value={form.dueDate} onChange={(event) => updateForm("dueDate", event.target.value)} /></div>
                <div className="space-y-1"><Label>Net / gross amount</Label><Input value={form.netAmount} onChange={(event) => updateForm("netAmount", event.target.value)} placeholder="1250.00" /></div>
                <div className="space-y-1"><Label>Amount received</Label><Input value={form.amountReceived} onChange={(event) => updateForm("amountReceived", event.target.value)} placeholder="0.00" /></div>
                <div className="space-y-1 md:col-span-3"><Label>Source evidence</Label><Input value={form.sourceEvidence} onChange={(event) => updateForm("sourceEvidence", event.target.value)} placeholder="Estimate, email or invoice reference" /></div>
                <div className="space-y-1 md:col-span-4"><Label>Notes</Label><Textarea value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} placeholder="Optional finance note" /></div>
                <div className="md:col-span-4"><Button disabled={createReceivableMutation.isPending} onClick={() => createReceivableMutation.mutate()}>Record receivable</Button></div>
              </CardContent>
            </Card>

            {receivables.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No client receivables in this view.</CardContent></Card> : null}
            {receivables.map((receivable) => (
              <Card key={receivable.id}>
                <CardContent className="grid gap-3 p-4 text-sm md:grid-cols-6 md:items-center">
                  <div className="md:col-span-2"><p className="font-medium">{receivable.client_name ?? "Unlinked client"}</p><p className="text-muted-foreground">{receivable.job_title} · {receivable.reference}</p></div>
                  <div><p className="text-muted-foreground">Invoice</p><p>{formatDate(receivable.invoice_date)}</p></div>
                  <div><p className="text-muted-foreground">Due</p><p>{formatDate(receivable.due_date)}</p></div>
                  <div><p className="text-muted-foreground">Outstanding</p><p className="font-medium">{formatMoney(receivable.outstanding_amount)}</p></div>
                  <Badge variant={statusVariant[receivable.status] ?? "outline"}>{receivable.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
