/**
 * Phase 3K — Labour Settlement & CIS Foundation.
 *
 * Creates reviewed settlement records from immutable RESOLVED labour-cost
 * calculations. This module creates no payments, bank transactions, VAT postings
 * or HMRC CIS submissions.
 */

import { randomUUID } from "node:crypto";
import type { LabourCostExecutor, LabourCostRow, LabourCostTransaction } from "./labour-cost-repository.ts";

export type PayeeCisStatus = "UNRESOLVED" | "NOT_APPLICABLE" | "GROSS_PAYMENT" | "NET_DEDUCTION" | "HIGHER_RATE_DEDUCTION";
export type LabourSettlementStatus = "UNRESOLVED" | "REVIEW_REQUIRED" | "APPROVED" | "VOIDED";
export type LabourSettlementKind = "DIRECT_SELF_EMPLOYED" | "AGENCY";

export interface CreateLabourSettlementInput {
  readonly calculationIds: readonly string[];
  readonly createdBy: string;
}

export interface ApproveLabourSettlementInput {
  readonly settlementId: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly reviewNotes?: string | null;
}

export interface UpsertPayeeCisProfileInput {
  readonly payeeId: string;
  readonly cisStatus: PayeeCisStatus;
  readonly deductionRate: string | null;
  readonly verificationReference?: string | null;
  readonly verifiedBy: string;
  readonly verifiedAt: string;
  readonly sourceEvidence?: string | null;
  readonly notes?: string | null;
}

export interface RefreshLabourSettlementInput {
  readonly settlementId: string;
  readonly refreshedBy: string;
  readonly refreshedAt: string;
}

export interface LabourSettlementRepositoryOptions {
  readonly now?: () => Date;
  readonly settlementId?: () => string;
  readonly lineId?: () => string;
}

export interface LabourSettlementRepository {
  listPayees(): Promise<readonly LabourCostRow[]>;
  listCisProfiles(): Promise<readonly LabourCostRow[]>;
  upsertCisProfile(input: UpsertPayeeCisProfileInput): Promise<LabourCostRow>;
  createSettlement(input: CreateLabourSettlementInput): Promise<LabourSettlementResult>;
  listSettlements(status?: LabourSettlementStatus): Promise<readonly LabourCostRow[]>;
  getSettlement(id: string): Promise<{ settlement: LabourCostRow; lines: readonly LabourCostRow[] } | null>;
  refreshSettlement(input: RefreshLabourSettlementInput): Promise<LabourCostRow | null>;
  approveSettlement(input: ApproveLabourSettlementInput): Promise<LabourCostRow | null>;
}

export class LabourSettlementError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LabourSettlementError";
    this.code = code;
  }
}

interface CalculationSettlementRow extends LabourCostRow {
  readonly calculation_id: string;
  readonly time_record_id: string;
  readonly job_id: string;
  readonly worker_id: string;
  readonly payee_id: string;
  readonly calculation_status: string;
  readonly calculated_cost: string;
  readonly currency_code: string;
  readonly verified_payable_minutes: number | null;
  readonly rate_type: string | null;
  readonly rate_amount: string | null;
  readonly standard_day_minutes: number | null;
  readonly work_date: string | null;
  readonly worker_type: string;
  readonly payee_type: string;
  readonly payee_worker_id: string | null;
  readonly payee_supplier_id: string | null;
  readonly agency_supplier_id: string | null;
  readonly supplier_type: string | null;
}

interface CisProfileRow extends LabourCostRow {
  readonly cis_status: string;
  readonly deduction_rate: string | null;
}

export interface LabourSettlementResult {
  readonly settlement: LabourCostRow;
  readonly lines: readonly LabourCostRow[];
}

const LOAD_CALCULATIONS_SQL = `
  SELECT
    lcc.id AS calculation_id,
    lcc.time_record_id,
    lcc.job_id,
    lcc.worker_id,
    lcc.payee_id,
    lcc.calculation_status,
    lcc.calculated_cost,
    lcc.currency_code,
    lcc.verified_payable_minutes,
    lcc.rate_type,
    lcc.rate_amount,
    lcc.standard_day_minutes,
    ltr.work_date,
    w.worker_type,
    p.payee_type,
    p.worker_id AS payee_worker_id,
    p.supplier_id AS payee_supplier_id,
    a.supplier_id AS agency_supplier_id,
    s.supplier_type
  FROM labour_cost_calculations lcc
  JOIN labour_time_records ltr ON ltr.id = lcc.time_record_id
  JOIN workers w ON w.id = lcc.worker_id
  JOIN payees p ON p.id = lcc.payee_id
  LEFT JOIN agency_workers aw ON aw.worker_id = lcc.worker_id AND aw.status = 'ACTIVE'
  LEFT JOIN agencies a ON a.id = aw.agency_id
  LEFT JOIN suppliers s ON s.id = p.supplier_id
  WHERE lcc.id = ANY($1::varchar[])
  ORDER BY ltr.work_date, lcc.id
`;

const DUPLICATE_LINES_SQL = `
  SELECT labour_calculation_id
  FROM labour_settlement_lines
  WHERE labour_calculation_id = ANY($1::varchar[])
`;

const CIS_PROFILE_SQL = `
  SELECT cis_status, deduction_rate
  FROM payee_cis_profile
  WHERE payee_id = $1
`;

const LIST_PAYEES_SQL = `
  SELECT
    p.id,
    p.name,
    p.payee_type,
    p.worker_id,
    p.supplier_id,
    w.worker_type,
    s.supplier_type,
    pcp.cis_status,
    pcp.deduction_rate,
    pcp.verification_reference,
    pcp.verified_by,
    pcp.verified_at,
    pcp.source_evidence,
    pcp.notes
  FROM payees p
  LEFT JOIN workers w ON w.id = p.worker_id
  LEFT JOIN suppliers s ON s.id = p.supplier_id
  LEFT JOIN payee_cis_profile pcp ON pcp.payee_id = p.id
  WHERE p.is_active = true
  ORDER BY p.name, p.id
`;

const LIST_CIS_PROFILES_SQL = `
  SELECT pcp.*, p.name AS payee_name, p.payee_type
  FROM payee_cis_profile pcp
  JOIN payees p ON p.id = pcp.payee_id
  ORDER BY p.name, pcp.payee_id
`;

const UPSERT_CIS_PROFILE_SQL = `
  INSERT INTO payee_cis_profile (
    id, payee_id, cis_status, deduction_rate, verification_reference,
    verified_by, verified_at, source_evidence, notes, updated_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
  ON CONFLICT (payee_id) DO UPDATE
  SET cis_status = EXCLUDED.cis_status,
      deduction_rate = EXCLUDED.deduction_rate,
      verification_reference = EXCLUDED.verification_reference,
      verified_by = EXCLUDED.verified_by,
      verified_at = EXCLUDED.verified_at,
      source_evidence = EXCLUDED.source_evidence,
      notes = EXCLUDED.notes,
      updated_at = now()
  RETURNING *
`;

const INSERT_SETTLEMENT_SQL = `
  INSERT INTO labour_settlements (
    id, job_id, payee_id, settlement_kind, status, gross_amount,
    cis_status, cis_deduction_rate, cis_deduction_amount, net_amount,
    currency_code, unresolved_reason, source_evidence, created_by, created_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
  RETURNING *
`;

const INSERT_LINE_SQL = `
  INSERT INTO labour_settlement_lines (
    id, settlement_id, labour_calculation_id, time_record_id, job_id,
    worker_id, payee_id, line_number, gross_amount, currency_code,
    verified_payable_minutes, rate_type, rate_amount, standard_day_minutes,
    work_date, source_evidence
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
  RETURNING *
`;

const LIST_SETTLEMENTS_SQL = `
  SELECT
    ls.*,
    p.name AS payee_name,
    p.payee_type,
    j.title AS job_title,
    MIN(lsl.work_date) AS period_start,
    MAX(lsl.work_date) AS period_end,
    COUNT(lsl.id)::integer AS line_count,
    STRING_AGG(DISTINCT BTRIM(CONCAT(w.first_name, ' ', w.last_name)), ', ' ORDER BY BTRIM(CONCAT(w.first_name, ' ', w.last_name))) AS worker_names
  FROM labour_settlements ls
  JOIN payees p ON p.id = ls.payee_id
  JOIN jobs j ON j.id = ls.job_id
  LEFT JOIN labour_settlement_lines lsl ON lsl.settlement_id = ls.id
  LEFT JOIN workers w ON w.id = lsl.worker_id
  WHERE ($1::text IS NULL OR ls.status = $1)
  GROUP BY ls.id, p.name, p.payee_type, j.title
  ORDER BY ls.created_at DESC, ls.id
`;

const GET_SETTLEMENT_SQL = `
  SELECT
    ls.*,
    p.name AS payee_name,
    p.payee_type,
    j.title AS job_title,
    MIN(lsl.work_date) AS period_start,
    MAX(lsl.work_date) AS period_end,
    COUNT(lsl.id)::integer AS line_count,
    STRING_AGG(DISTINCT BTRIM(CONCAT(w.first_name, ' ', w.last_name)), ', ' ORDER BY BTRIM(CONCAT(w.first_name, ' ', w.last_name))) AS worker_names
  FROM labour_settlements ls
  JOIN payees p ON p.id = ls.payee_id
  JOIN jobs j ON j.id = ls.job_id
  LEFT JOIN labour_settlement_lines lsl ON lsl.settlement_id = ls.id
  LEFT JOIN workers w ON w.id = lsl.worker_id
  WHERE ls.id = $1
  GROUP BY ls.id, p.name, p.payee_type, j.title
`;

const GET_SETTLEMENT_LINES_SQL = `
  SELECT lsl.*, w.first_name AS worker_first_name, w.last_name AS worker_last_name
  FROM labour_settlement_lines lsl
  JOIN workers w ON w.id = lsl.worker_id
  WHERE lsl.settlement_id = $1
  ORDER BY lsl.line_number
`;

const APPROVE_SETTLEMENT_SQL = `
  UPDATE labour_settlements
  SET status = 'APPROVED',
      approved_by = $2,
      approved_at = $3,
      review_notes = CASE WHEN $4::text IS NULL THEN review_notes ELSE $4 END,
      updated_at = now()
  WHERE id = $1
    AND status = 'REVIEW_REQUIRED'
    AND net_amount IS NOT NULL
    AND unresolved_reason IS NULL
  RETURNING *
`;

const REFRESH_SETTLEMENT_INPUT_SQL = `
  SELECT
    ls.id,
    ls.payee_id,
    ls.status,
    ls.currency_code,
    COALESCE(SUM(lsl.gross_amount), 0)::numeric(14,2) AS gross_amount
  FROM labour_settlements ls
  JOIN labour_settlement_lines lsl ON lsl.settlement_id = ls.id
  WHERE ls.id = $1
  GROUP BY ls.id, ls.payee_id, ls.status, ls.currency_code
`;

const REFRESH_SETTLEMENT_SQL = `
  UPDATE labour_settlements
  SET status = $2,
      gross_amount = $3,
      cis_status = $4,
      cis_deduction_rate = $5,
      cis_deduction_amount = $6,
      net_amount = $7,
      unresolved_reason = $8,
      review_notes = CASE
        WHEN NULLIF(BTRIM(review_notes), '') IS NULL THEN $9
        ELSE review_notes || E'\n' || $9
      END,
      source_evidence = CASE
        WHEN NULLIF(BTRIM(source_evidence), '') IS NULL THEN $10
        ELSE source_evidence || ';' || $10
      END,
      updated_at = now()
  WHERE id = $1 AND status <> 'APPROVED'
  RETURNING *
`;

function parseMoneyToCents(amount: string | null | undefined): number | null {
  if (amount == null) return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(amount).trim());
  if (!match) return null;
  return Number.parseInt(match[1], 10) * 100 + Number.parseInt((match[2] ?? "").padEnd(2, "0"), 10);
}

function centsToMoney(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function parseRateToBasisPoints(rate: string | null | undefined): number | null {
  if (rate == null) return null;
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(String(rate).trim());
  if (!match) return null;
  const basisPoints = Number.parseInt(match[1], 10) * 100 + Number.parseInt((match[2] ?? "").padEnd(2, "0"), 10);
  return basisPoints <= 10_000 ? basisPoints : null;
}

function roundHalfAway(value: number): number {
  return Math.floor(value + 0.5);
}

function validateCisProfileInput(input: UpsertPayeeCisProfileInput): void {
  const rateBasisPoints = parseRateToBasisPoints(input.deductionRate);
  if (input.cisStatus === "UNRESOLVED") {
    if (input.deductionRate !== null) {
      throw new LabourSettlementError("CIS_RATE_NOT_ALLOWED", "UNRESOLVED CIS status must not include a deduction rate");
    }
    return;
  }
  if (input.cisStatus === "NOT_APPLICABLE") {
    if (input.deductionRate !== null) {
      throw new LabourSettlementError("CIS_RATE_NOT_ALLOWED", "NOT_APPLICABLE CIS status must not include a deduction rate");
    }
    return;
  }
  if (input.cisStatus === "GROSS_PAYMENT") {
    if (rateBasisPoints !== 0) {
      throw new LabourSettlementError("CIS_RATE_REQUIRED", "GROSS_PAYMENT requires an explicitly verified 0.00 deduction rate");
    }
    return;
  }
  if (rateBasisPoints === null || rateBasisPoints <= 0) {
    throw new LabourSettlementError("CIS_RATE_REQUIRED", "CIS deduction status requires a verified positive deduction rate");
  }
}

function normalizeCalculationRows(rows: readonly LabourCostRow[]): CalculationSettlementRow[] {
  return rows.map((row) => ({
    ...row,
    calculation_id: String(row.calculation_id ?? ""),
    time_record_id: String(row.time_record_id ?? ""),
    job_id: String(row.job_id ?? ""),
    worker_id: String(row.worker_id ?? ""),
    payee_id: String(row.payee_id ?? ""),
    calculation_status: String(row.calculation_status ?? ""),
    calculated_cost: String(row.calculated_cost ?? ""),
    currency_code: String(row.currency_code ?? "GBP"),
    verified_payable_minutes: row.verified_payable_minutes == null ? null : Number(row.verified_payable_minutes),
    rate_type: row.rate_type == null ? null : String(row.rate_type),
    rate_amount: row.rate_amount == null ? null : String(row.rate_amount),
    standard_day_minutes: row.standard_day_minutes == null ? null : Number(row.standard_day_minutes),
    work_date: row.work_date == null ? null : String(row.work_date),
    worker_type: String(row.worker_type ?? ""),
    payee_type: String(row.payee_type ?? ""),
    payee_worker_id: row.payee_worker_id == null ? null : String(row.payee_worker_id),
    payee_supplier_id: row.payee_supplier_id == null ? null : String(row.payee_supplier_id),
    agency_supplier_id: row.agency_supplier_id == null ? null : String(row.agency_supplier_id),
    supplier_type: row.supplier_type == null ? null : String(row.supplier_type),
  }));
}

function validateRows(ids: readonly string[], rows: readonly CalculationSettlementRow[]): LabourSettlementKind {
  if (rows.length !== ids.length) {
    throw new LabourSettlementError("CALCULATION_NOT_FOUND", "all requested labour calculations must exist");
  }

  const first = rows[0];
  const kind = first.worker_type === "AGENCY" ? "AGENCY" : first.worker_type === "DIRECT_SELF_EMPLOYED" ? "DIRECT_SELF_EMPLOYED" : null;
  if (kind === null) {
    throw new LabourSettlementError("UNSUPPORTED_LABOUR_TYPE", "only direct self-employed and agency labour can be settled here");
  }

  for (const row of rows) {
    if (row.calculation_status !== "RESOLVED" || parseMoneyToCents(row.calculated_cost) === null) {
      throw new LabourSettlementError("CALCULATION_NOT_RESOLVED", "settlement can only reference RESOLVED labour-cost calculations");
    }
    if (row.job_id !== first.job_id || row.payee_id !== first.payee_id || row.currency_code !== first.currency_code) {
      throw new LabourSettlementError("MIXED_SETTLEMENT_SCOPE", "one settlement can only cover one job, payee and currency");
    }
    if (kind === "DIRECT_SELF_EMPLOYED") {
      if (row.worker_type !== "DIRECT_SELF_EMPLOYED" || row.payee_type !== "WORKER" || row.payee_worker_id !== row.worker_id) {
        throw new LabourSettlementError("INVALID_DIRECT_PAYEE", "direct self-employed labour must settle to the worker payee");
      }
    } else if (row.worker_type !== "AGENCY" || row.payee_type !== "SUPPLIER" || row.supplier_type !== "AGENCY" || row.payee_supplier_id !== row.agency_supplier_id) {
      throw new LabourSettlementError("INVALID_AGENCY_PAYEE", "agency labour must settle to the agency supplier payee, not the worker");
    }
  }

  return kind;
}

function cisSnapshot(profile: CisProfileRow | undefined, grossCents: number): {
  status: LabourSettlementStatus;
  cisStatus: PayeeCisStatus;
  rate: string | null;
  deduction: string | null;
  net: string | null;
  unresolvedReason: string | null;
} {
  if (!profile || profile.cis_status === "UNRESOLVED") {
    return {
      status: "UNRESOLVED",
      cisStatus: "UNRESOLVED",
      rate: null,
      deduction: null,
      net: null,
      unresolvedReason: "CIS_UNRESOLVED: payee CIS status/rate is not verified in payee_cis_profile",
    };
  }

  const cisStatus = profile.cis_status as PayeeCisStatus;
  if (cisStatus === "NOT_APPLICABLE") {
    return { status: "REVIEW_REQUIRED", cisStatus, rate: null, deduction: "0.00", net: centsToMoney(grossCents), unresolvedReason: null };
  }

  const rateBasisPoints = parseRateToBasisPoints(profile.deduction_rate);
  if (rateBasisPoints === null) {
    return {
      status: "UNRESOLVED",
      cisStatus: "UNRESOLVED",
      rate: null,
      deduction: null,
      net: null,
      unresolvedReason: "CIS_RATE_UNRESOLVED: payee CIS deduction rate is missing or invalid",
    };
  }

  const deductionCents = roundHalfAway((grossCents * rateBasisPoints) / 10_000);
  return {
    status: "REVIEW_REQUIRED",
    cisStatus,
    rate: profile.deduction_rate,
    deduction: centsToMoney(deductionCents),
    net: centsToMoney(grossCents - deductionCents),
    unresolvedReason: null,
  };
}

export class SqlLabourSettlementRepository implements LabourSettlementRepository {
  private readonly executor: LabourCostExecutor;
  private readonly now: () => Date;
  private readonly settlementId: () => string;
  private readonly lineId: () => string;

  constructor(executor: LabourCostExecutor, options: LabourSettlementRepositoryOptions = {}) {
    this.executor = executor;
    this.now = options.now ?? (() => new Date());
    this.settlementId = options.settlementId ?? randomUUID;
    this.lineId = options.lineId ?? randomUUID;
  }

  async listPayees(): Promise<readonly LabourCostRow[]> {
    const result = await this.executor.query(LIST_PAYEES_SQL, []);
    return result.rows;
  }

  async listCisProfiles(): Promise<readonly LabourCostRow[]> {
    const result = await this.executor.query(LIST_CIS_PROFILES_SQL, []);
    return result.rows;
  }

  async upsertCisProfile(input: UpsertPayeeCisProfileInput): Promise<LabourCostRow> {
    validateCisProfileInput(input);
    const result = await this.executor.query(UPSERT_CIS_PROFILE_SQL, [
      randomUUID(),
      input.payeeId,
      input.cisStatus,
      input.deductionRate,
      input.verificationReference ?? null,
      input.verifiedBy,
      input.verifiedAt,
      input.sourceEvidence ?? null,
      input.notes ?? null,
    ]);
    return result.rows[0];
  }

  async createSettlement(input: CreateLabourSettlementInput): Promise<LabourSettlementResult> {
    const calculationIds = input.calculationIds.map((id) => id.trim()).filter((id) => id.length > 0);
    if (calculationIds.length === 0) {
      throw new LabourSettlementError("NO_CALCULATIONS", "at least one labour calculation is required");
    }
    if (new Set(calculationIds).size !== calculationIds.length) {
      throw new LabourSettlementError("DUPLICATE_INPUT", "calculation ids must be unique");
    }

    return this.executor.transaction(async (transaction: LabourCostTransaction) => {
      const duplicateRows = await transaction.query(DUPLICATE_LINES_SQL, [calculationIds]);
      if (duplicateRows.rows.length > 0) {
        throw new LabourSettlementError("ALREADY_SETTLED", "one or more labour calculations already has a settlement line");
      }

      const loaded = await transaction.query(LOAD_CALCULATIONS_SQL, [calculationIds]);
      const rows = normalizeCalculationRows(loaded.rows);
      const kind = validateRows(calculationIds, rows);
      const grossCents = rows.reduce((sum, row) => sum + (parseMoneyToCents(row.calculated_cost) ?? 0), 0);
      const profileRows = await transaction.query(CIS_PROFILE_SQL, [rows[0].payee_id]);
      const cis = cisSnapshot(profileRows.rows[0] as CisProfileRow | undefined, grossCents);
      const settlementId = this.settlementId();
      const createdAt = this.now().toISOString();
      const sourceEvidence = `labour_calculations=${calculationIds.join(",")}`;

      const settlementResult = await transaction.query(INSERT_SETTLEMENT_SQL, [
        settlementId,
        rows[0].job_id,
        rows[0].payee_id,
        kind,
        cis.status,
        centsToMoney(grossCents),
        cis.cisStatus,
        cis.rate,
        cis.deduction,
        cis.net,
        rows[0].currency_code,
        cis.unresolvedReason,
        sourceEvidence,
        input.createdBy,
        createdAt,
      ]);

      const lines: LabourCostRow[] = [];
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const insertedLine = await transaction.query(INSERT_LINE_SQL, [
          this.lineId(),
          settlementId,
          row.calculation_id,
          row.time_record_id,
          row.job_id,
          row.worker_id,
          row.payee_id,
          index + 1,
          row.calculated_cost,
          row.currency_code,
          row.verified_payable_minutes,
          row.rate_type,
          row.rate_amount,
          row.standard_day_minutes,
          row.work_date,
          `labour_calculation=${row.calculation_id};time_record=${row.time_record_id}`,
        ]);
        lines.push(insertedLine.rows[0]);
      }

      return { settlement: settlementResult.rows[0], lines };
    });
  }

  async listSettlements(status?: LabourSettlementStatus): Promise<readonly LabourCostRow[]> {
    const result = await this.executor.query(LIST_SETTLEMENTS_SQL, [status ?? null]);
    return result.rows;
  }

  async getSettlement(id: string): Promise<{ settlement: LabourCostRow; lines: readonly LabourCostRow[] } | null> {
    const settlement = await this.executor.query(GET_SETTLEMENT_SQL, [id]);
    if (!settlement.rows[0]) return null;
    const lines = await this.executor.query(GET_SETTLEMENT_LINES_SQL, [id]);
    return { settlement: settlement.rows[0], lines: lines.rows };
  }

  async refreshSettlement(input: RefreshLabourSettlementInput): Promise<LabourCostRow | null> {
    return this.executor.transaction(async (transaction) => {
      const rows = await transaction.query(REFRESH_SETTLEMENT_INPUT_SQL, [input.settlementId]);
      const settlement = rows.rows[0];
      if (!settlement) return null;
      if (settlement.status === "APPROVED") {
        throw new LabourSettlementError("SETTLEMENT_LOCKED", "approved settlements are locked and cannot be refreshed");
      }

      const grossCents = parseMoneyToCents(String(settlement.gross_amount ?? ""));
      if (grossCents === null) {
        throw new LabourSettlementError("SETTLEMENT_GROSS_INVALID", "settlement gross amount could not be recalculated");
      }

      const profileRows = await transaction.query(CIS_PROFILE_SQL, [String(settlement.payee_id)]);
      const cis = cisSnapshot(profileRows.rows[0] as CisProfileRow | undefined, grossCents);
      const refreshNote = `Refreshed ${input.refreshedAt} by ${input.refreshedBy}; status=${cis.status}; cis=${cis.cisStatus}`;
      const sourceEvidence = `refresh=${input.refreshedAt};by=${input.refreshedBy}`;
      const result = await transaction.query(REFRESH_SETTLEMENT_SQL, [
        input.settlementId,
        cis.status,
        centsToMoney(grossCents),
        cis.cisStatus,
        cis.rate,
        cis.deduction,
        cis.net,
        cis.unresolvedReason,
        refreshNote,
        sourceEvidence,
      ]);
      return result.rows[0] ?? null;
    });
  }

  async approveSettlement(input: ApproveLabourSettlementInput): Promise<LabourCostRow | null> {
    const result = await this.executor.query(APPROVE_SETTLEMENT_SQL, [
      input.settlementId,
      input.approvedBy,
      input.approvedAt,
      input.reviewNotes ?? null,
    ]);
    return result.rows[0] ?? null;
  }
}
