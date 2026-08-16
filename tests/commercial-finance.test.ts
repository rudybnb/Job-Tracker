import { test } from "node:test";
import assert from "node:assert/strict";
import { CommercialFinanceError, CommercialFinanceRepository } from "../server/commercial-finance.ts";
import type { LabourCostExecutor, LabourCostRow, LabourCostTransaction } from "../server/labour-cost-repository.ts";

interface QueryCall {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

function createExecutor(rows: readonly LabourCostRow[] = []): { executor: LabourCostExecutor; calls: QueryCall[]; inserted: LabourCostRow[] } {
  const calls: QueryCall[] = [];
  const inserted: LabourCostRow[] = [];

  const query = async (sql: string, parameters: readonly unknown[]) => {
    calls.push({ sql, parameters });
    if (/INSERT INTO client_receivable/i.test(sql)) {
      const row: LabourCostRow = {
        id: parameters[0],
        client_id: parameters[1],
        job_id: parameters[2],
        reference: parameters[3],
        invoice_date: parameters[4],
        due_date: parameters[5],
        currency_code: "GBP",
        net_amount: parameters[6],
        vat_amount: "0.00",
        gross_amount: parameters[7],
        amount_received: parameters[8],
        status: parameters[9],
        vat_status: "NOT_REGISTERED_INACTIVE",
        source_evidence: parameters[10],
        notes: parameters[11],
        created_by: parameters[12],
      };
      inserted.push(row);
      return { rows: [row] };
    }
    return { rows };
  };

  const executor: LabourCostExecutor = {
    query,
    async transaction<T>(work: (transaction: LabourCostTransaction) => Promise<T>): Promise<T> {
      return work({ query });
    },
  };

  return { executor, calls, inserted };
}

test("commercial finance payables are job-filtered read models", async () => {
  const { executor, calls } = createExecutor([{ source_type: "LABOUR_SETTLEMENT", outstanding_amount: "160.00" }]);
  const repository = new CommercialFinanceRepository(executor);

  const rows = await repository.listPayables("job-123");

  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_type, "LABOUR_SETTLEMENT");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].parameters[0], "job-123");
  assert.match(calls[0].sql, /FROM labour_settlements settlement/);
  assert.match(calls[0].sql, /FROM contractor_valuation valuation/);
  assert.match(calls[0].sql, /FROM supplier_invoice invoice/);
});

test("commercial finance job summaries combine receivables, labour, suppliers and subcontractors", async () => {
  const { executor, calls } = createExecutor([{ job_id: "job-123", total_committed_cost: "875.00", current_gross_margin: "1125.00" }]);
  const repository = new CommercialFinanceRepository(executor);

  const rows = await repository.listJobSummaries();

  assert.equal(rows.length, 1);
  assert.equal(calls[0].parameters[0], null);
  assert.match(calls[0].sql, /WITH receivable AS/);
  assert.match(calls[0].sql, /FROM labour_settlements/);
  assert.match(calls[0].sql, /FROM supplier_invoice invoice/);
  assert.match(calls[0].sql, /FROM contractor_valuation valuation/);
});

test("creating a client receivable enforces VAT inactive zero-ready rules", async () => {
  const { executor, inserted } = createExecutor();
  const repository = new CommercialFinanceRepository(executor);

  const receivable = await repository.createReceivable({
    clientId: null,
    jobId: "job-123",
    reference: "INV-001",
    invoiceDate: "2026-08-14",
    dueDate: "2026-08-28",
    netAmount: "1000.00",
    grossAmount: "1000.00",
    amountReceived: "250.00",
    sourceEvidence: "client email",
    notes: null,
    createdBy: "admin",
  });

  assert.equal(inserted.length, 1);
  assert.equal(receivable.status, "PART_RECEIVED");
  assert.equal(receivable.vat_amount, "0.00");
  assert.equal(receivable.vat_status, "NOT_REGISTERED_INACTIVE");
});

test("creating a client receivable rejects VAT while VAT is inactive", async () => {
  const { executor } = createExecutor();
  const repository = new CommercialFinanceRepository(executor);

  await assert.rejects(
    () => repository.createReceivable({
      clientId: null,
      jobId: "job-123",
      reference: "INV-002",
      invoiceDate: "2026-08-14",
      dueDate: null,
      netAmount: "1000.00",
      grossAmount: "1200.00",
      amountReceived: "0.00",
      sourceEvidence: null,
      notes: null,
      createdBy: "admin",
    }),
    (error) => error instanceof CommercialFinanceError && error.code === "VAT_INACTIVE",
  );
});
