/**
 * Phase 3H — Labour Cost Calculation Repository.
 *
 * Resolves verified time records against canonical identities (worker, job,
 * payee, approved labour rate) and persists auditable, versioned calculation
 * outcomes into labour_cost_calculations.
 *
 * Safety properties:
 *   - Only labour_time_records with time_status='VERIFIED' are processed.
 *   - Historical RESOLVED calculations are never overwritten: changes are
 *     written as new calculation_version rows (append-only versioning).
 *   - Identical re-runs produce no new row (outcome equivalence check).
 *   - The unique index (time_record_id, calculation_version) prevents duplicate
 *     active calculations for the same record/version.
 *   - Missing worker/job/payee/approved rate/day basis => UNRESOLVED row with a
 *     clear unresolved_reason. Nothing is fabricated.
 *
 * No payments, Monzo, CIS, VAT, invoices or settlements are created here.
 */

import { randomUUID } from "node:crypto";
import { calculateLabourCost, outcomesEquivalent, type LabourCostContext, type LabourCostOutcome, type LabourCostRate } from "./labour-cost-engine.ts";

export interface LabourCostRow {
  readonly [column: string]: unknown;
}

export interface LabourCostQueryResult {
  readonly rows: readonly LabourCostRow[];
}

export interface LabourCostTransaction {
  query(sql: string, parameters: readonly unknown[]): Promise<LabourCostQueryResult>;
}

export interface LabourCostExecutor extends LabourCostTransaction {
  transaction<T>(work: (transaction: LabourCostTransaction) => Promise<T>): Promise<T>;
}

export interface LabourCostTimeRecord {
  readonly id: string;
  readonly jobId: string | null;
  readonly workerId: string | null;
  readonly workDate: string | null;
  readonly verifiedPayableMinutes: number | null;
  readonly timeStatus: string;
}

export interface LabourCostPersisted {
  readonly id: string;
  readonly timeRecordId: string;
  readonly jobId: string | null;
  readonly workerId: string | null;
  readonly payeeId: string | null;
  readonly labourRateId: string | null;
  readonly rateType: string | null;
  readonly rateAmount: string | null;
  readonly standardDayMinutes: number | null;
  readonly currencyCode: string;
  readonly verifiedPayableMinutes: number | null;
  readonly calculationStatus: string;
  readonly unresolvedReason: string | null;
  readonly calculatedCost: string | null;
  readonly calculationVersion: number;
}

export interface LabourCostRepositoryOptions {
  readonly calculatedBy?: string;
  readonly calculationId?: () => string;
  readonly now?: () => Date;
}

const VERIFIED_TIME_RECORDS_SQL = `
  SELECT id, job_id, worker_id, work_date, verified_payable_minutes, time_status
  FROM labour_time_records
  WHERE time_status = 'VERIFIED'
  ORDER BY work_date, id
`;

const WORKER_SQL = `
  SELECT id, worker_type
  FROM workers
  WHERE id = $1
`;

const SELF_EMPLOYED_PAYEE_SQL = `
  SELECT id
  FROM payees
  WHERE payee_type = 'WORKER' AND worker_id = $1 AND is_active = true
  LIMIT 1
`;

const AGENCY_WORKER_SQL = `
  SELECT a.id AS agency_id, a.supplier_id
  FROM agency_workers aw
  JOIN agencies a ON a.id = aw.agency_id
  WHERE aw.worker_id = $1 AND aw.status = 'ACTIVE'
  LIMIT 1
`;

const AGENCY_PAYEE_SQL = `
  SELECT id
  FROM payees
  WHERE payee_type = 'SUPPLIER' AND supplier_id = $1 AND is_active = true
  LIMIT 1
`;

// Phase 3I job-scoped rate resolution. Priority (highest first):
//   a. approved worker + job specific rate
//   b. approved agency worker + job specific rate
//   c. approved worker/agency general rate
// Job-specific rates take precedence over general rates; the effective window
// must cover the work date. Nothing is fabricated when no rate matches.

const WORKER_JOB_RATE_SQL = `
  SELECT id, rate_type, rate_amount, standard_day_minutes, approval_status, currency_code
  FROM labour_rates
  WHERE worker_id = $1
    AND job_id = $3
    AND approval_status = 'APPROVED'
    AND (effective_from IS NULL OR effective_from <= $2::date)
    AND (effective_to IS NULL OR effective_to >= $2::date)
  ORDER BY effective_from DESC NULLS LAST
  LIMIT 1
`;

const AGENCY_JOB_RATE_SQL = `
  SELECT id, rate_type, rate_amount, standard_day_minutes, approval_status, currency_code
  FROM labour_rates
  WHERE agency_id = $1
    AND job_id = $3
    AND approval_status = 'APPROVED'
    AND (effective_from IS NULL OR effective_from <= $2::date)
    AND (effective_to IS NULL OR effective_to >= $2::date)
  ORDER BY effective_from DESC NULLS LAST
  LIMIT 1
`;

const WORKER_GENERAL_RATE_SQL = `
  SELECT id, rate_type, rate_amount, standard_day_minutes, approval_status, currency_code
  FROM labour_rates
  WHERE worker_id = $1
    AND job_id IS NULL
    AND approval_status = 'APPROVED'
    AND (effective_from IS NULL OR effective_from <= $2::date)
    AND (effective_to IS NULL OR effective_to >= $2::date)
  ORDER BY effective_from DESC NULLS LAST
  LIMIT 1
`;

const AGENCY_GENERAL_RATE_SQL = `
  SELECT id, rate_type, rate_amount, standard_day_minutes, approval_status, currency_code
  FROM labour_rates
  WHERE agency_id = $1
    AND job_id IS NULL
    AND approval_status = 'APPROVED'
    AND (effective_from IS NULL OR effective_from <= $2::date)
    AND (effective_to IS NULL OR effective_to >= $2::date)
  ORDER BY effective_from DESC NULLS LAST
  LIMIT 1
`;

const LATEST_CALCULATION_SQL = `
  SELECT id, time_record_id, job_id, worker_id, payee_id, labour_rate_id,
         rate_type, rate_amount, standard_day_minutes, currency_code,
         verified_payable_minutes, calculation_status, unresolved_reason,
         calculated_cost, calculation_version
  FROM labour_cost_calculations
  WHERE time_record_id = $1
  ORDER BY calculation_version DESC
  LIMIT 1
`;

const INSERT_CALCULATION_SQL = `
  INSERT INTO labour_cost_calculations (
    id, time_record_id, job_id, worker_id, payee_id, labour_rate_id,
    rate_type, rate_amount, standard_day_minutes, currency_code,
    verified_payable_minutes, calculation_status, unresolved_reason,
    calculated_cost, calculation_version, calculated_at, calculated_by,
    source_evidence
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
  ON CONFLICT (time_record_id, calculation_version) DO NOTHING
  RETURNING id
`;

function toLabourCostTimeRecord(row: LabourCostRow): LabourCostTimeRecord {
  return {
    id: String(row.id ?? ""),
    jobId: row.job_id == null ? null : String(row.job_id),
    workerId: row.worker_id == null ? null : String(row.worker_id),
    workDate: row.work_date == null ? null : String(row.work_date),
    verifiedPayableMinutes: row.verified_payable_minutes == null ? null : Number(row.verified_payable_minutes),
    timeStatus: String(row.time_status ?? ""),
  };
}

function toPersisted(row: LabourCostRow): LabourCostPersisted {
  return {
    id: String(row.id ?? ""),
    timeRecordId: String(row.time_record_id ?? ""),
    jobId: row.job_id == null ? null : String(row.job_id),
    workerId: row.worker_id == null ? null : String(row.worker_id),
    payeeId: row.payee_id == null ? null : String(row.payee_id),
    labourRateId: row.labour_rate_id == null ? null : String(row.labour_rate_id),
    rateType: row.rate_type == null ? null : String(row.rate_type),
    rateAmount: row.rate_amount == null ? null : String(row.rate_amount),
    standardDayMinutes: row.standard_day_minutes == null ? null : Number(row.standard_day_minutes),
    currencyCode: String(row.currency_code ?? "GBP"),
    verifiedPayableMinutes: row.verified_payable_minutes == null ? null : Number(row.verified_payable_minutes),
    calculationStatus: String(row.calculation_status ?? ""),
    unresolvedReason: row.unresolved_reason == null ? null : String(row.unresolved_reason),
    calculatedCost: row.calculated_cost == null ? null : String(row.calculated_cost),
    calculationVersion: Number(row.calculation_version ?? 1),
  };
}

function toRate(row: LabourCostRow | undefined): LabourCostRate | null {
  if (!row) return null;
  const rawStatus = String(row.approval_status ?? "UNKNOWN");
  const approvalStatus: LabourCostRate["approvalStatus"] =
    rawStatus === "APPROVED" || rawStatus === "SUPERSEDED" ? rawStatus : "UNKNOWN";
  return {
    rateId: String(row.id ?? ""),
    rateType: String(row.rate_type ?? "HOURLY") === "DAILY" ? "DAILY" : "HOURLY",
    rateAmount: row.rate_amount == null ? null : String(row.rate_amount),
    standardDayMinutes: row.standard_day_minutes == null ? null : Number(row.standard_day_minutes),
    approvalStatus,
    currencyCode: String(row.currency_code ?? "GBP"),
  };
}

function buildContext(
  record: LabourCostTimeRecord,
  payeeId: string | null,
  rate: LabourCostRate | null,
): LabourCostContext {
  return {
    timeRecordId: record.id,
    jobId: record.jobId,
    workerId: record.workerId,
    payeeId,
    verified: record.timeStatus === "VERIFIED",
    verifiedPayableMinutes: record.verifiedPayableMinutes,
    rate,
  };
}

async function resolvePayeeAndRate(
  transaction: LabourCostTransaction,
  record: LabourCostTimeRecord,
): Promise<{ payeeId: string | null; rate: LabourCostRate | null }> {
  if (!record.workerId || !record.workDate) {
    return { payeeId: null, rate: null };
  }

  const workerRows = await transaction.query(WORKER_SQL, [record.workerId]);
  const workerType = workerRows.rows[0] ? String(workerRows.rows[0].worker_type ?? "") : "";

  let payeeId: string | null = null;
  let agencyId: string | null = null;

  if (workerType === "DIRECT_SELF_EMPLOYED") {
    const payeeRows = await transaction.query(SELF_EMPLOYED_PAYEE_SQL, [record.workerId]);
    payeeId = payeeRows.rows[0] ? String(payeeRows.rows[0].id) : null;
  } else if (workerType === "AGENCY") {
    const agencyRows = await transaction.query(AGENCY_WORKER_SQL, [record.workerId]);
    if (agencyRows.rows[0]) {
      agencyId = String(agencyRows.rows[0].agency_id);
      const supplierId = agencyRows.rows[0].supplier_id == null ? null : String(agencyRows.rows[0].supplier_id);
      if (supplierId) {
        const payeeRows = await transaction.query(AGENCY_PAYEE_SQL, [supplierId]);
        payeeId = payeeRows.rows[0] ? String(payeeRows.rows[0].id) : null;
      }
    }
  }

  // Rate resolution priority (Phase 3I):
  //   a. approved worker + job specific rate
  //   b. approved agency worker + job specific rate
  //   c. approved worker/agency general rate
  // Job-specific rates win over general rates; effective window must cover the
  // work date. Nothing is fabricated when no rate matches.
  let rate: LabourCostRate | null = null;
  const workDate = record.workDate;
  const jobId = record.jobId;

  if (workDate && jobId) {
    const jobRows = await transaction.query(WORKER_JOB_RATE_SQL, [record.workerId, workDate, jobId]);
    if (jobRows.rows[0]) {
      rate = toRate(jobRows.rows[0]);
    } else if (workerType === "AGENCY" && agencyId) {
      const agencyJobRows = await transaction.query(AGENCY_JOB_RATE_SQL, [agencyId, workDate, jobId]);
      if (agencyJobRows.rows[0]) {
        rate = toRate(agencyJobRows.rows[0]);
      }
    }
  }

  if (!rate && workDate) {
    const generalRows = await transaction.query(WORKER_GENERAL_RATE_SQL, [record.workerId, workDate]);
    if (generalRows.rows[0]) {
      rate = toRate(generalRows.rows[0]);
    } else if (workerType === "AGENCY" && agencyId) {
      const agencyGeneralRows = await transaction.query(AGENCY_GENERAL_RATE_SQL, [agencyId, workDate]);
      if (agencyGeneralRows.rows[0]) {
        rate = toRate(agencyGeneralRows.rows[0]);
      }
    }
  }

  return { payeeId, rate };
}

async function loadLatestCalculation(
  transaction: LabourCostTransaction,
  timeRecordId: string,
): Promise<LabourCostPersisted | null> {
  const rows = await transaction.query(LATEST_CALCULATION_SQL, [timeRecordId]);
  return rows.rows[0] ? toPersisted(rows.rows[0]) : null;
}

/**
 * Calculates one verified time record and persists the outcome as a new
 * calculation_version row unless an identical outcome already exists.
 * Historical resolved rows are never overwritten.
 */
export async function calculateAndPersistTimeRecord(
  transaction: LabourCostTransaction,
  record: LabourCostTimeRecord,
  options: LabourCostRepositoryOptions = {},
): Promise<LabourCostPersisted> {
  const { payeeId, rate } = await resolvePayeeAndRate(transaction, record);
  const context = buildContext(record, payeeId, rate);
  const outcome = calculateLabourCost(context);
  const latest = await loadLatestCalculation(transaction, record.id);

  if (latest) {
    const latestOutcome: LabourCostOutcome = {
      status: latest.calculationStatus as LabourCostOutcome["status"],
      calculatedCost: latest.calculatedCost,
      unresolvedReason: latest.unresolvedReason,
      rateSnapshot: latest.labourRateId
        ? {
            rateId: latest.labourRateId,
            rateType: latest.rateType === "DAILY" ? "DAILY" : "HOURLY",
            rateAmount: latest.rateAmount,
            standardDayMinutes: latest.standardDayMinutes,
            approvalStatus: latest.rateType ? "APPROVED" : "UNKNOWN",
            currencyCode: latest.currencyCode,
          }
        : null,
    };
    if (outcomesEquivalent(latestOutcome, outcome)) {
      return latest;
    }
  }

  const nextVersion = (latest?.calculationVersion ?? 0) + 1;
  const id = options.calculationId?.() ?? randomUUID();
  const now = (options.now?.() ?? new Date()).toISOString();
  const sourceEvidence = `time_record=${record.id};status=${outcome.status};version=${nextVersion}`;

  const inserted = await transaction.query(INSERT_CALCULATION_SQL, [
    id,
    record.id,
    record.jobId,
    record.workerId,
    payeeId,
    rate?.rateId ?? null,
    rate?.rateType ?? null,
    rate?.rateAmount ?? null,
    rate?.standardDayMinutes ?? null,
    rate?.currencyCode ?? "GBP",
    record.verifiedPayableMinutes,
    outcome.status,
    outcome.unresolvedReason,
    outcome.calculatedCost,
    nextVersion,
    now,
    options.calculatedBy ?? null,
    sourceEvidence,
  ]);

  const returned = inserted.rows[0];
  if (returned) {
    return {
      id: String(returned.id),
      timeRecordId: record.id,
      jobId: record.jobId,
      workerId: record.workerId,
      payeeId,
      labourRateId: rate?.rateId ?? null,
      rateType: rate?.rateType ?? null,
      rateAmount: rate?.rateAmount ?? null,
      standardDayMinutes: rate?.standardDayMinutes ?? null,
      currencyCode: rate?.currencyCode ?? "GBP",
      verifiedPayableMinutes: record.verifiedPayableMinutes,
      calculationStatus: outcome.status,
      unresolvedReason: outcome.unresolvedReason,
      calculatedCost: outcome.calculatedCost,
      calculationVersion: nextVersion,
    };
  }

  // ON CONFLICT DO NOTHING: another writer already persisted this version.
  const reloaded = await loadLatestCalculation(transaction, record.id);
  return reloaded ?? {
    id,
    timeRecordId: record.id,
    jobId: record.jobId,
    workerId: record.workerId,
    payeeId,
    labourRateId: rate?.rateId ?? null,
    rateType: rate?.rateType ?? null,
    rateAmount: rate?.rateAmount ?? null,
    standardDayMinutes: rate?.standardDayMinutes ?? null,
    currencyCode: rate?.currencyCode ?? "GBP",
    verifiedPayableMinutes: record.verifiedPayableMinutes,
    calculationStatus: outcome.status,
    unresolvedReason: outcome.unresolvedReason,
    calculatedCost: outcome.calculatedCost,
    calculationVersion: nextVersion,
  };
}

export interface LabourCostBatchResult {
  readonly recordsProcessed: number;
  readonly calculations: readonly LabourCostPersisted[];
}

/**
 * Processes every verified time record and persists the resulting calculations.
 * Runs inside a single transaction so the batch is atomic.
 */
export async function processVerifiedTimeRecords(
  executor: LabourCostExecutor,
  options: LabourCostRepositoryOptions = {},
): Promise<LabourCostBatchResult> {
  return executor.transaction(async (transaction) => {
    const rows = await transaction.query(VERIFIED_TIME_RECORDS_SQL, []);
    const calculations: LabourCostPersisted[] = [];
    for (const row of rows.rows) {
      const record = toLabourCostTimeRecord(row);
      calculations.push(await calculateAndPersistTimeRecord(transaction, record, options));
    }
    return { recordsProcessed: rows.rows.length, calculations };
  });
}