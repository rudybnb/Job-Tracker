/**
 * Phase 3I — Labour Cost Review Repository.
 *
 * Read-side queries that surface labour calculations (RESOLVED / UNRESOLVED) and
 * verified time records for the admin review workflow, plus the two minimal
 * correction operations that feed the versioned recalculation model:
 *   - verify a labour time record (verified_payable_minutes + VERIFIED status)
 *   - create an APPROVED job-scoped or general labour rate
 *
 * Corrections NEVER overwrite historical RESOLVED calculations: the manual run
 * trigger re-executes the Phase 3H engine, which writes a new
 * calculation_version row whenever the outcome changes (append-only versioning).
 *
 * No payments, Monzo, CIS, VAT, invoices or settlements are created here.
 */

import { randomUUID } from "node:crypto";
import type {
  LabourCostExecutor,
  LabourCostRow,
  LabourCostTransaction,
} from "./labour-cost-repository.ts";

export interface LabourCalculationReviewRow {
  readonly [column: string]: unknown;
}

export interface LabourCalculationReviewFilter {
  readonly status?: string;
  readonly jobId?: string;
  readonly workerId?: string;
}

export interface VerifyTimeRecordInput {
  readonly id: string;
  readonly verifiedPayableMinutes: number;
  readonly verifiedBy: string;
  readonly verifiedAt: string;
  readonly note?: string | null;
}

export interface RejectTimeRecordInput {
  readonly id: string;
  readonly rejectedBy: string;
  readonly rejectedAt: string;
  readonly note?: string | null;
}

export interface CreateLabourRateInput {
  readonly workerId: string | null;
  readonly agencyId: string | null;
  readonly jobId: string | null;
  readonly rateType: "HOURLY" | "DAILY";
  readonly rateAmount: string;
  readonly standardDayMinutes: number | null;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly notes?: string | null;
}

export interface LabourCostReviewRepository {
  listLatestCalculations(filter: LabourCalculationReviewFilter): Promise<readonly LabourCalculationReviewRow[]>;
  listCalculationVersions(timeRecordId: string): Promise<readonly LabourCalculationReviewRow[]>;
  listTimeRecords(status?: string): Promise<readonly LabourCalculationReviewRow[]>;
  verifyTimeRecord(input: VerifyTimeRecordInput): Promise<LabourCalculationReviewRow | null>;
  rejectTimeRecord(input: RejectTimeRecordInput): Promise<LabourCalculationReviewRow | null>;
  createLabourRate(input: CreateLabourRateInput): Promise<LabourCalculationReviewRow>;
}

const LATEST_CALCULATIONS_SQL = `
  SELECT DISTINCT ON (lcc.time_record_id)
    lcc.id AS calculation_id,
    lcc.time_record_id,
    lcc.calculation_version,
    lcc.calculation_status,
    lcc.unresolved_reason,
    lcc.calculated_cost,
    lcc.verified_payable_minutes,
    lcc.rate_type,
    lcc.rate_amount,
    lcc.standard_day_minutes,
    lcc.currency_code,
    lcc.job_id,
    lcc.worker_id,
    lcc.payee_id,
    lcc.labour_rate_id,
    lcc.calculated_at,
    lcc.calculated_by,
    w.first_name AS worker_first_name,
    w.last_name AS worker_last_name,
    w.worker_type,
    j.title AS job_title,
    p.name AS payee_name,
    p.payee_type
  FROM labour_cost_calculations lcc
  LEFT JOIN workers w ON w.id = lcc.worker_id
  LEFT JOIN jobs j ON j.id = lcc.job_id
  LEFT JOIN payees p ON p.id = lcc.payee_id
  WHERE ($1::text IS NULL OR lcc.calculation_status = $1)
    AND ($2::text IS NULL OR lcc.job_id = $2)
    AND ($3::text IS NULL OR lcc.worker_id = $3)
  ORDER BY lcc.time_record_id, lcc.calculation_version DESC
`;

const CALCULATION_VERSIONS_SQL = `
  SELECT
    lcc.id AS calculation_id,
    lcc.time_record_id,
    lcc.calculation_version,
    lcc.calculation_status,
    lcc.unresolved_reason,
    lcc.calculated_cost,
    lcc.verified_payable_minutes,
    lcc.rate_type,
    lcc.rate_amount,
    lcc.standard_day_minutes,
    lcc.currency_code,
    lcc.job_id,
    lcc.worker_id,
    lcc.payee_id,
    lcc.labour_rate_id,
    lcc.calculated_at,
    lcc.calculated_by,
    w.first_name AS worker_first_name,
    w.last_name AS worker_last_name,
    w.worker_type,
    j.title AS job_title,
    p.name AS payee_name,
    p.payee_type
  FROM labour_cost_calculations lcc
  LEFT JOIN workers w ON w.id = lcc.worker_id
  LEFT JOIN jobs j ON j.id = lcc.job_id
  LEFT JOIN payees p ON p.id = lcc.payee_id
  WHERE lcc.time_record_id = $1
  ORDER BY lcc.calculation_version DESC
`;

const TIME_RECORDS_SQL = `
  SELECT
    ltr.id,
    ltr.job_id,
    ltr.worker_id,
    ltr.work_session_id,
    ltr.work_date,
    ltr.clock_in_at,
    ltr.clock_out_at,
    ltr.verified_payable_minutes,
    ltr.time_status,
    ltr.verified_by,
    ltr.verified_at,
    ltr.notes,
    w.first_name AS worker_first_name,
    w.last_name AS worker_last_name,
    w.worker_type,
    j.title AS job_title
  FROM labour_time_records ltr
  LEFT JOIN workers w ON w.id = ltr.worker_id
  LEFT JOIN jobs j ON j.id = ltr.job_id
  WHERE ($1::text IS NULL OR ltr.time_status = $1)
  ORDER BY ltr.work_date, ltr.id
`;

const VERIFY_TIME_RECORD_SQL = `
  UPDATE labour_time_records
  SET verified_payable_minutes = $2,
      time_status = 'VERIFIED',
      verified_by = $3,
      verified_at = $4,
      notes = CASE WHEN $5::text IS NULL THEN notes ELSE $5 END,
      updated_at = now()
  WHERE id = $1
  RETURNING id, job_id, worker_id, work_session_id, work_date,
            verified_payable_minutes, time_status, verified_by, verified_at, notes
`;

const REJECT_TIME_RECORD_SQL = `
  UPDATE labour_time_records
  SET verified_payable_minutes = NULL,
      time_status = 'REJECTED',
      verified_by = $2,
      verified_at = $3,
      notes = CASE WHEN $4::text IS NULL THEN notes ELSE $4 END,
      updated_at = now()
  WHERE id = $1
  RETURNING id, job_id, worker_id, work_session_id, work_date,
            verified_payable_minutes, time_status, verified_by, verified_at, notes
`;

const CREATE_LABOUR_RATE_SQL = `
  INSERT INTO labour_rates (
    id, worker_id, agency_id, job_id, rate_type, rate_amount, currency_code,
    standard_day_minutes, approval_status, approved_by, approved_at, notes
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'APPROVED', $9, $10, $11)
  RETURNING id, worker_id, agency_id, job_id, rate_type, rate_amount, currency_code,
            standard_day_minutes, approval_status, approved_by, approved_at, notes
`;

export class SqlLabourCostReviewRepository implements LabourCostReviewRepository {
  private readonly executor: LabourCostExecutor;

  constructor(executor: LabourCostExecutor) {
    this.executor = executor;
  }

  async listLatestCalculations(
    filter: LabourCalculationReviewFilter = {},
  ): Promise<readonly LabourCalculationReviewRow[]> {
    const { status = null, jobId = null, workerId = null } = filter;
    const result = await this.executor.query(LATEST_CALCULATIONS_SQL, [status, jobId, workerId]);
    return result.rows;
  }

  async listCalculationVersions(timeRecordId: string): Promise<readonly LabourCalculationReviewRow[]> {
    const result = await this.executor.query(CALCULATION_VERSIONS_SQL, [timeRecordId]);
    return result.rows;
  }

  async listTimeRecords(status: string | undefined): Promise<readonly LabourCalculationReviewRow[]> {
    const result = await this.executor.query(TIME_RECORDS_SQL, [status ?? null]);
    return result.rows;
  }

  async verifyTimeRecord(input: VerifyTimeRecordInput): Promise<LabourCalculationReviewRow | null> {
    const result = await this.executor.query(VERIFY_TIME_RECORD_SQL, [
      input.id,
      input.verifiedPayableMinutes,
      input.verifiedBy,
      input.verifiedAt,
      input.note ?? null,
    ]);
    return result.rows[0] ?? null;
  }

  async rejectTimeRecord(input: RejectTimeRecordInput): Promise<LabourCalculationReviewRow | null> {
    const result = await this.executor.query(REJECT_TIME_RECORD_SQL, [
      input.id,
      input.rejectedBy,
      input.rejectedAt,
      input.note ?? null,
    ]);
    return result.rows[0] ?? null;
  }

  async createLabourRate(input: CreateLabourRateInput): Promise<LabourCalculationReviewRow> {
    const id = randomUUID();
    const result = await this.executor.query(CREATE_LABOUR_RATE_SQL, [
      id,
      input.workerId,
      input.agencyId,
      input.jobId,
      input.rateType,
      input.rateAmount,
      "GBP",
      input.standardDayMinutes,
      input.approvedBy,
      input.approvedAt,
      input.notes ?? null,
    ]);
    return result.rows[0];
  }
}

export type { LabourCostRow, LabourCostTransaction };