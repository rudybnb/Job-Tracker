import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface BankTransactionRow {
  id: string;
  provider_transaction_id: string;
  direction: "INCOMING" | "OUTGOING";
  amount: string;
  currency_code: string;
  transaction_at: string;
  description: string;
  reference: string | null;
  counterparty_name: string | null;
  merchant_name: string | null;
  remaining_amount: string;
  reconciliation_status: string;
}

interface MonzoStatus {
  configured: boolean;
  connected: boolean;
  status: string | null;
  selectedProviderAccountId: string | null;
  tokenExpiresAt: string | null;
  authorizedAt: string | null;
  lastSyncAt: string | null;
  disconnectedAt: string | null;
}

interface MonzoAccount {
  id: string;
  description?: string;
  type?: string;
  currency?: string;
}

interface CandidateRow {
  target_type: string;
  target_id: string;
  job_id: string | null;
  job_title: string | null;
  counterparty_name: string | null;
  source_reference: string;
  remaining_amount: string;
  proposed_match_type: string;
}

const badgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  CONFIRMED: "default",
  PART_CONFIRMED: "secondary",
  PROPOSED: "outline",
  UNMATCHED: "destructive",
  INCOMING: "default",
  OUTGOING: "secondary",
};

function formatMoney(value: string | null | undefined, currency = "GBP"): string {
  if (!value) return "-";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Math.abs(Number(value)));
  } catch {
    return value;
  }
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function AdminBankReconciliation() {
  const { toast } = useToast();
  const [direction, setDirection] = useState<"ALL" | "INCOMING" | "OUTGOING">("ALL");
  const [since, setSince] = useState("");
  const [accountId, setAccountId] = useState("");
  const [selectedTransaction, setSelectedTransaction] = useState<BankTransactionRow | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateRow | null>(null);
  const [matchedAmount, setMatchedAmount] = useState("");
  const [evidence, setEvidence] = useState("");

  const queryFilter = direction === "ALL" ? {} : { direction };
  const monzoStatusQuery = useQuery<{ monzo: MonzoStatus }>({ queryKey: ["/api/bank/monzo/status"] });
  const accountsQuery = useQuery<{ accounts: MonzoAccount[] }>({ queryKey: ["/api/bank/monzo/accounts"], enabled: monzoStatusQuery.data?.monzo.connected === true });
  const transactionsQuery = useQuery<{ transactions: BankTransactionRow[] }>({ queryKey: ["/api/bank/transactions", queryFilter] });
  const candidatesQuery = useQuery<{ candidates: CandidateRow[] }>({
    queryKey: selectedTransaction ? [`/api/bank/transactions/${selectedTransaction.id}/candidates`] : ["/api/bank/transactions/no-selection/candidates"],
    enabled: selectedTransaction !== null,
  });

  const transactions = transactionsQuery.data?.transactions ?? [];
  const candidates = candidatesQuery.data?.candidates ?? [];
  const monzo = monzoStatusQuery.data?.monzo;
  const accounts = accountsQuery.data?.accounts ?? [];

  const refreshBank = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/bank/transactions"] });
    if (selectedTransaction) queryClient.invalidateQueries({ queryKey: [`/api/bank/transactions/${selectedTransaction.id}/candidates`] });
  };

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/bank/monzo/sync", { accountId: accountId || undefined, since: since || undefined, limit: 100 });
      return response.json();
    },
    onSuccess: (data) => {
      refreshBank();
      toast({ title: "Monzo sync complete", description: `${data.sync.transactionsInserted} imported, ${data.sync.duplicatesSkipped} duplicates skipped.` });
    },
    onError: (error: Error) => toast({ title: "Monzo sync failed", description: error.message, variant: "destructive" }),
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/bank/monzo/connect", {});
      return response.json() as Promise<{ authorizationUrl: string }>;
    },
    onSuccess: (data) => {
      window.location.href = data.authorizationUrl;
    },
    onError: (error: Error) => toast({ title: "Monzo connect failed", description: error.message, variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/bank/monzo/disconnect", {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank/monzo/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bank/monzo/accounts"] });
      toast({ title: "Monzo disconnected", description: "Encrypted reusable tokens were removed locally. No Monzo transaction was modified." });
    },
    onError: (error: Error) => toast({ title: "Disconnect failed", description: error.message, variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTransaction || !selectedCandidate) throw new Error("Select a transaction and proposed match first");
      const response = await apiRequest("POST", "/api/bank/reconciliation/confirm", {
        bankTransactionId: selectedTransaction.id,
        matches: [{
          targetType: selectedCandidate.target_type,
          targetId: selectedCandidate.target_id,
          jobId: selectedCandidate.job_id,
          counterpartyName: selectedCandidate.counterparty_name,
          matchedAmount: matchedAmount || selectedTransaction.remaining_amount,
          evidence: evidence || `Admin confirmed ${selectedCandidate.proposed_match_type} match`,
        }],
      });
      return response.json();
    },
    onSuccess: () => {
      setSelectedCandidate(null);
      setMatchedAmount("");
      setEvidence("");
      refreshBank();
      toast({ title: "Match confirmed", description: "The transaction was reconciled. No bank payment was made." });
    },
    onError: (error: Error) => toast({ title: "Confirmation failed", description: error.message, variant: "destructive" }),
  });

  const chooseTransaction = (transaction: BankTransactionRow) => {
    setSelectedTransaction(transaction);
    setSelectedCandidate(null);
    setMatchedAmount(transaction.remaining_amount);
    setEvidence("");
  };

  const chooseCandidate = (candidate: CandidateRow) => {
    setSelectedCandidate(candidate);
    const transactionRemaining = selectedTransaction ? Number(selectedTransaction.remaining_amount) : 0;
    setMatchedAmount(Math.min(transactionRemaining, Number(candidate.remaining_amount)).toFixed(2));
  };

  return (
    <div className="min-h-screen bg-muted/30 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bank Reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Read-only Monzo import and manual reconciliation. This screen never initiates payments, transfers, VAT returns or CIS submissions.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Monzo Connection</CardTitle>
            <CardDescription>Confidential server-side OAuth. Tokens are encrypted server-side and never exposed to the browser.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-5 md:items-end">
            <div className="space-y-1">
              <Label>Status</Label>
              <div className="flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm">
                <Badge variant={monzo?.connected ? "default" : monzo?.configured ? "secondary" : "destructive"}>{monzo?.connected ? "CONNECTED" : monzo?.configured ? monzo.status ?? "READY" : "NOT CONFIGURED"}</Badge>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Account</Label>
              <Select value={accountId || monzo?.selectedProviderAccountId || "AUTO"} onValueChange={(value) => setAccountId(value === "AUTO" ? "" : value)} disabled={!monzo?.connected}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO">Auto / saved account</SelectItem>
                  {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.description ?? account.id}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Since</Label>
              <Input type="datetime-local" value={since} onChange={(event) => setSince(event.target.value)} disabled={!monzo?.connected} />
            </div>
            <div className="space-y-1">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(value) => setDirection(value as "ALL" | "INCOMING" | "OUTGOING")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="INCOMING">Incoming</SelectItem>
                  <SelectItem value="OUTGOING">Outgoing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {monzo?.connected ? <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>Sync Monzo</Button> : <Button onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending || monzo?.configured === false}>Connect Monzo</Button>}
            <div className="flex gap-2"><Button variant="outline" onClick={refreshBank}>Refresh</Button>{monzo?.connected ? <Button variant="outline" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>Disconnect</Button> : null}</div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-3">
            {transactions.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No imported bank transactions in this view.</CardContent></Card> : null}
            {transactions.map((transaction) => (
              <Card key={transaction.id} className={selectedTransaction?.id === transaction.id ? "border-primary" : undefined}>
                <CardContent className="grid gap-3 p-4 text-sm md:grid-cols-6 md:items-center">
                  <div className="md:col-span-2">
                    <p className="font-medium">{transaction.counterparty_name ?? transaction.merchant_name ?? transaction.description}</p>
                    <p className="text-muted-foreground">{formatDateTime(transaction.transaction_at)} · {transaction.reference ?? transaction.provider_transaction_id}</p>
                  </div>
                  <Badge variant={badgeVariant[transaction.direction] ?? "outline"}>{transaction.direction}</Badge>
                  <div><p className="text-muted-foreground">Amount</p><p>{formatMoney(transaction.amount, transaction.currency_code)}</p></div>
                  <div><p className="text-muted-foreground">Remaining</p><p className="font-medium">{formatMoney(transaction.remaining_amount, transaction.currency_code)}</p></div>
                  <div className="flex items-center gap-2"><Badge variant={badgeVariant[transaction.reconciliation_status] ?? "outline"}>{transaction.reconciliation_status}</Badge><Button size="sm" variant="outline" onClick={() => chooseTransaction(transaction)}>Review</Button></div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Review Match</CardTitle>
              <CardDescription>Confirm only when the evidence is sufficient. Leave unmatched otherwise.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedTransaction ? <p className="text-sm text-muted-foreground">Select a bank transaction to review proposed matches.</p> : null}
              {selectedTransaction ? (
                <div className="rounded-md border p-3 text-sm">
                  <p className="font-medium">{selectedTransaction.description}</p>
                  <p className="text-muted-foreground">{formatMoney(selectedTransaction.remaining_amount, selectedTransaction.currency_code)} remaining to reconcile</p>
                </div>
              ) : null}
              <div className="space-y-2">
                {candidates.map((candidate) => (
                  <button key={`${candidate.target_type}-${candidate.target_id}`} type="button" onClick={() => chooseCandidate(candidate)} className={`w-full rounded-md border p-3 text-left text-sm ${selectedCandidate?.target_id === candidate.target_id ? "border-primary bg-primary/5" : "bg-background"}`}>
                    <span className="block font-medium">{candidate.counterparty_name ?? "Unknown counterparty"}</span>
                    <span className="block text-muted-foreground">{candidate.job_title ?? "No job"} · {candidate.source_reference}</span>
                    <span className="mt-1 block">{candidate.proposed_match_type} · {formatMoney(candidate.remaining_amount)}</span>
                  </button>
                ))}
                {selectedTransaction && candidates.length === 0 ? <p className="text-sm text-muted-foreground">No candidate found. Do not fabricate a job allocation.</p> : null}
              </div>
              <div className="space-y-1"><Label>Matched amount</Label><Input value={matchedAmount} onChange={(event) => setMatchedAmount(event.target.value)} placeholder="0.00" /></div>
              <div className="space-y-1"><Label>Evidence</Label><Textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Why this match is confirmed" /></div>
              <Button disabled={!selectedTransaction || !selectedCandidate || confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>Confirm match</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
