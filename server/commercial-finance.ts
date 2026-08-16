/**
 * Phase 3M — Core Commercial Finance read models.
 *
 * Aggregates approved labour settlements, subcontractor valuations/payments,
 * supplier invoices and client receivables. This module records obligations and
 * receipts only; it does not execute bank payments, connect Monzo, submit CIS or
 * activate VAT.
 */

import { randomUUID } from "node:crypto";
import type { LabourCostExecutor, LabourCostRow } from "./labour-cost-repository.ts";

export interface CreateClientReceivableInput {
  readonly clientId: string | null;
  readonly jobId: string;
  readonly reference: string;
  readonly invoiceDate: string;
  readonly dueDate: string | null;
  readonly netAmount: string;
  readonly grossAmount: string;
  readonly amountReceived: string;
  readonly sourceEvidence: string | null;
  readonly notes: string | null;
  readonly createdBy: string;
}

export class CommercialFinanceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CommercialFinanceError";
    this.code = code;
  }
}

const PAYABLES_SQL = `
  WITH subcontractor_paid AS (
    SELECT contractor_valuation_id,
           SUM(CASE WHEN payment_status = 'PAID' THEN payment_amount WHEN payment_status = 'REVERSED' THEN -payment_amount ELSE 0 END) AS paid_amount
    FROM contractor_payments
    WHERE contractor_valuation_id IS NOT NULL AND payment_status IN ('PAID', 'REVERSED')
    GROUP BY contractor_valuation_id
  ), subcontractor_values AS (
    SELECT valuation.id,
           SUM(line.current_value) AS gross_amount
    FROM contractor_valuation valuation
    JOIN contractor_valuation_line line ON line.contractor_valuation_id = valuation.id
    WHERE valuation.status = 'APPROVED'
    GROUP BY valuation.id
  ), supplier_invoice_values AS (
    SELECT invoice.id,
           SUM(line.actual_line_value) AS gross_amount
    FROM supplier_invoice invoice
    JOIN supplier_invoice_line line ON line.supplier_invoice_id = invoice.id
    WHERE invoice.status <> 'CANCELLED'
    GROUP BY invoice.id
  )
  SELECT * FROM (
    SELECT
      settlement.id::text AS id,
      settlement.job_id,
      job.title AS job_title,
      payee.name AS payee_name,
      settlement.payee_id::text AS payee_id,
      'LABOUR_SETTLEMENT'::text AS source_type,
      settlement.id::text AS source_reference,
      settlement.gross_amount,
      settlement.cis_deduction_amount AS cis_amount,
      NULL::numeric AS vat_amount,
      settlement.net_amount AS net_payable,
      NULL::date AS due_date,
      0::numeric AS amount_paid,
      settlement.net_amount AS outstanding_amount,
      'DUE'::text AS payable_status,
      settlement.status AS source_status
    FROM labour_settlements settlement
    JOIN payees payee ON payee.id = settlement.payee_id
    JOIN jobs job ON job.id = settlement.job_id
    WHERE settlement.status = 'APPROVED'

    UNION ALL

    SELECT
      valuation.id::text AS id,
      valuation.job_id,
      job.title AS job_title,
      contractor.name AS payee_name,
      contractor.id::text AS payee_id,
      'SUPPLY_AND_FIT_VALUATION'::text AS source_type,
      valuation.valuation_number AS source_reference,
      valuation_values.gross_amount,
      NULL::numeric AS cis_amount,
      NULL::numeric AS vat_amount,
      valuation_values.gross_amount AS net_payable,
      NULL::date AS due_date,
      COALESCE(paid.paid_amount, 0) AS amount_paid,
      valuation_values.gross_amount - COALESCE(paid.paid_amount, 0) AS outstanding_amount,
      CASE
        WHEN COALESCE(paid.paid_amount, 0) <= 0 THEN 'DUE'
        WHEN COALESCE(paid.paid_amount, 0) < valuation_values.gross_amount THEN 'PARTIALLY_PAID'
        ELSE 'PAID'
      END AS payable_status,
      valuation.status AS source_status
    FROM contractor_valuation valuation
    JOIN subcontractor_values valuation_values ON valuation_values.id = valuation.id
    JOIN contractors contractor ON contractor.id = valuation.contractor_id
    JOIN jobs job ON job.id = valuation.job_id
    LEFT JOIN subcontractor_paid paid ON paid.contractor_valuation_id = valuation.id

    UNION ALL

    SELECT
      invoice.id::text AS id,
      invoice.job_id,
      job.title AS job_title,
      invoice.supplier_name AS payee_name,
      NULL::text AS payee_id,
      'SUPPLIER_INVOICE'::text AS source_type,
      invoice.invoice_number AS source_reference,
      invoice_values.gross_amount,
      NULL::numeric AS cis_amount,
      NULL::numeric AS vat_amount,
      invoice_values.gross_amount AS net_payable,
      NULL::date AS due_date,
      0::numeric AS amount_paid,
      invoice_values.gross_amount AS outstanding_amount,
      CASE
        WHEN invoice.status = 'DISPUTED' THEN 'DISPUTED'
        WHEN invoice.status = 'APPROVED' THEN 'DUE'
        ELSE 'UNDER_REVIEW'
      END AS payable_status,
      invoice.status AS source_status
    FROM supplier_invoice invoice
    JOIN supplier_invoice_values invoice_values ON invoice_values.id = invoice.id
    JOIN jobs job ON job.id = invoice.job_id
  ) payable
  WHERE ($1::text IS NULL OR payable.job_id = $1)
  ORDER BY payable.job_title, payable.payee_name, payable.source_type, payable.source_reference
`;

const RECEIVABLES_SQL = `
  SELECT
    receivable.*,
    client.name AS client_name,
    job.title AS job_title,
    receivable.gross_amount - receivable.amount_received AS outstanding_amount
  FROM client_receivable receivable
  LEFT JOIN clients client ON client.id = receivable.client_id
  JOIN jobs job ON job.id = receivable.job_id
  WHERE ($1::text IS NULL OR receivable.job_id = $1)
  ORDER BY receivable.invoice_date DESC, receivable.reference
`;

const JOB_SUMMARY_SQL = `
  WITH receivable AS (
    SELECT job_id,
           SUM(gross_amount) FILTER (WHERE status <> 'CANCELLED') AS client_invoiced,
           SUM(amount_received) FILTER (WHERE status <> 'CANCELLED') AS client_received
    FROM client_receivable
    GROUP BY job_id
  ), labour AS (
    SELECT job_id,
           SUM(gross_amount) FILTER (WHERE status = 'APPROVED') AS labour_cost,
           SUM(net_amount) FILTER (WHERE status = 'APPROVED') AS labour_owed
    FROM labour_settlements
    GROUP BY job_id
  ), supplier_invoice AS (
    SELECT invoice.job_id,
           SUM(line.actual_line_value) FILTER (WHERE invoice.status = 'APPROVED') AS supplier_cost
    FROM supplier_invoice invoice
    JOIN supplier_invoice_line line ON line.supplier_invoice_id = invoice.id
    GROUP BY invoice.job_id
  ), subcontractor_value AS (
    SELECT valuation.job_id,
           SUM(line.current_value) FILTER (WHERE valuation.status = 'APPROVED') AS subcontractor_cost
    FROM contractor_valuation valuation
    JOIN contractor_valuation_line line ON line.contractor_valuation_id = valuation.id
    GROUP BY valuation.job_id
  ), subcontractor_paid AS (
    SELECT payment.job_id,
           SUM(CASE WHEN payment_status = 'PAID' THEN payment_amount WHEN payment_status = 'REVERSED' THEN -payment_amount ELSE 0 END) AS paid_amount
    FROM contractor_payments payment
    WHERE payment_status IN ('PAID', 'REVERSED')
    GROUP BY payment.job_id
  )
  SELECT
    job.id AS job_id,
    job.title AS job_title,
    job.quoted_amount,
    COALESCE(receivable.client_invoiced, 0) AS client_invoiced,
    COALESCE(receivable.client_received, 0) AS client_received,
    COALESCE(receivable.client_invoiced, 0) - COALESCE(receivable.client_received, 0) AS client_outstanding,
    COALESCE(labour.labour_cost, 0) AS labour_cost,
    COALESCE(subcontractor_value.subcontractor_cost, 0) + COALESCE(supplier_invoice.supplier_cost, 0) AS subcontractor_supplier_cost,
    COALESCE(labour.labour_cost, 0) + COALESCE(subcontractor_value.subcontractor_cost, 0) + COALESCE(supplier_invoice.supplier_cost, 0) AS total_committed_cost,
    COALESCE(subcontractor_paid.paid_amount, 0) AS total_paid,
    COALESCE(labour.labour_owed, 0)
      + GREATEST(COALESCE(subcontractor_value.subcontractor_cost, 0) - COALESCE(subcontractor_paid.paid_amount, 0), 0)
      + COALESCE(supplier_invoice.supplier_cost, 0) AS total_still_owed,
    COALESCE(receivable.client_invoiced, 0) - (COALESCE(labour.labour_cost, 0) + COALESCE(subcontractor_value.subcontractor_cost, 0) + COALESCE(supplier_invoice.supplier_cost, 0)) AS current_gross_margin
  FROM jobs job
  LEFT JOIN receivable ON receivable.job_id = job.id
  LEFT JOIN labour ON labour.job_id = job.id
  LEFT JOIN supplier_invoice ON supplier_invoice.job_id = job.id
  LEFT JOIN subcontractor_value ON subcontractor_value.job_id = job.id
  LEFT JOIN subcontractor_paid ON subcontractor_paid.job_id = job.id
  WHERE ($1::text IS NULL OR job.id = $1)
  ORDER BY job.title, job.id
`;

const CREATE_RECEIVABLE_SQL = `
  INSERT INTO client_receivable (
    id, client_id, job_id, reference, invoice_date, due_date, currency_code,
    net_amount, vat_amount, gross_amount, amount_received, status, vat_status,
    source_evidence, notes, created_by
  ) VALUES ($1, $2, $3, $4, $5, $6, 'GBP', $7, 0, $8, $9, $10, 'NOT_REGISTERED_INACTIVE', $11, $12, $13)
  RETURNING *
`;

function parseAmount(value: string): number | null {
  return /^\d+(?:\.\d{1,2})?$/.test(value) ? Number(value) : null;
}

function validateDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

export class CommercialFinanceRepository {
  private readonly executor: LabourCostExecutor;

  constructor(executor: LabourCostExecutor) {
    this.executor = executor;
  }

  async listPayables(jobId?: string): Promise<readonly LabourCostRow[]> {
    const result = await this.executor.query(PAYABLES_SQL, [jobId ?? null]);
    return result.rows;
  }

  async listReceivables(jobId?: string): Promise<readonly LabourCostRow[]> {
    const result = await this.executor.query(RECEIVABLES_SQL, [jobId ?? null]);
    return result.rows;
  }

  async listJobSummaries(jobId?: string): Promise<readonly LabourCostRow[]> {
    const result = await this.executor.query(JOB_SUMMARY_SQL, [jobId ?? null]);
    return result.rows;
  }

  async createReceivable(input: CreateClientReceivableInput): Promise<LabourCostRow> {
    if (!input.jobId.trim()) throw new CommercialFinanceError("JOB_REQUIRED", "jobId is required");
    if (!input.reference.trim()) throw new CommercialFinanceError("REFERENCE_REQUIRED", "reference is required");
    if (!validateDate(input.invoiceDate)) throw new CommercialFinanceError("INVOICE_DATE_INVALID", "invoiceDate must be YYYY-MM-DD");
    if (input.dueDate !== null && !validateDate(input.dueDate)) throw new CommercialFinanceError("DUE_DATE_INVALID", "dueDate must be YYYY-MM-DD when supplied");
    if (input.dueDate !== null && input.dueDate < input.invoiceDate) throw new CommercialFinanceError("DUE_DATE_INVALID", "dueDate cannot be before invoiceDate");

    const net = parseAmount(input.netAmount);
    const gross = parseAmount(input.grossAmount);
    const received = parseAmount(input.amountReceived);
    if (net === null || gross === null || received === null) throw new CommercialFinanceError("AMOUNT_INVALID", "amounts must be non-negative decimals");
    if (net !== gross) throw new CommercialFinanceError("VAT_INACTIVE", "VAT is inactive; grossAmount must equal netAmount and vatAmount is 0.00");
    if (received > gross) throw new CommercialFinanceError("RECEIVED_EXCEEDS_GROSS", "amountReceived cannot exceed grossAmount");

    const status = received === 0 ? "ISSUED" : received < gross ? "PART_RECEIVED" : "RECEIVED";
    const result = await this.executor.query(CREATE_RECEIVABLE_SQL, [
      randomUUID(),
      input.clientId,
      input.jobId,
      input.reference.trim(),
      input.invoiceDate,
      input.dueDate,
      input.netAmount,
      input.grossAmount,
      input.amountReceived,
      status,
      input.sourceEvidence,
      input.notes,
      input.createdBy,
    ]);
    return result.rows[0];
  }
}
