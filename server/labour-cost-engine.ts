/**
 * Phase 3H — Labour Cost Calculation Engine.
 *
 * Pure, dependency-free calculation rules for converting verified clock-in/out
 * time into an auditable labour cost. This module performs NO database access
 * and NO payment/payroll side-effects. The repository layer is responsible for
 * resolving identities/rates from the database and persisting the outcome.
 *
 * Business rules implemented:
 *   5. HOURLY:  cost = verified_payable_minutes / 60 * approved rate_amount
 *   6. DAILY:   cost = verified_payable_minutes / standard_day_minutes * approved rate_amount
 *      No assumed day length — missing/absent standard_day_minutes => UNRESOLVED.
 *   3/7. Missing worker, job, payee, approved rate, approval, or day basis
 *      => UNRESOLVED with a clear unresolved_reason. Nothing is fabricated.
 *   1/2. Only verified time may be calculated (verified flag guard).
 *   4. No fabricated rates — a rate without an approved amount is UNRESOLVED.
 */

export type LabourRateKind = "HOURLY" | "DAILY";
export type LabourApprovalStatus = "UNKNOWN" | "APPROVED" | "SUPERSEDED";
export type LabourCalculationStatus = "PENDING" | "RESOLVED" | "UNRESOLVED" | "ERROR";

export interface LabourCostRate {
  readonly rateId: string;
  readonly rateType: LabourRateKind;
  readonly rateAmount: string | null; // decimal string, e.g. "25.00"
  readonly standardDayMinutes: number | null;
  readonly approvalStatus: LabourApprovalStatus;
  readonly currencyCode: string;
}

export interface LabourCostContext {
  readonly timeRecordId: string;
  readonly jobId: string | null;
  readonly workerId: string | null;
  readonly payeeId: string | null;
  readonly verified: boolean;
  readonly verifiedPayableMinutes: number | null;
  readonly rate: LabourCostRate | null;
}

export interface LabourCostOutcome {
  readonly status: LabourCalculationStatus;
  readonly calculatedCost: string | null;
  readonly unresolvedReason: string | null;
  readonly rateSnapshot: LabourCostRate | null;
}

export const LABOUR_CALCULATION_REASONS = {
  WORKER_UNRESOLVED: "WORKER_UNRESOLVED: worker identity could not be resolved",
  JOB_UNRESOLVED: "JOB_UNRESOLVED: job could not be resolved",
  PAYEE_UNRESOLVED: "PAYEE_UNRESOLVED: payee could not be resolved",
  TIME_UNVERIFIED: "TIME_UNVERIFIED: time record is not verified",
  TIME_INVALID: "TIME_INVALID: verified payable minutes are missing or invalid",
  RATE_UNRESOLVED: "RATE_UNRESOLVED: no approved labour rate could be resolved",
  RATE_NOT_APPROVED: "RATE_NOT_APPROVED: labour rate is not approved",
  RATE_AMOUNT_UNRESOLVED: "RATE_AMOUNT_UNRESOLVED: approved rate has no amount",
  DAY_BASIS_UNRESOLVED: "DAY_BASIS_UNRESOLVED: daily rate has no approved standard_day_minutes",
} as const;

function parseAmountToCents(amount: string | null): number | null {
  if (amount === null) return null;
  const match = /^(-?\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) return null;
  const whole = Number.parseInt(match[1], 10);
  const frac = match[2] ? match[2].padEnd(2, "0").slice(0, 2) : "00";
  return whole * 100 + Number.parseInt(frac, 10);
}

function roundHalfAwayFromZero(value: number): number {
  return value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
}

function centsToAmountString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function unresolved(reason: string, rate: LabourCostRate | null): LabourCostOutcome {
  return { status: "UNRESOLVED", calculatedCost: null, unresolvedReason: reason, rateSnapshot: rate };
}

export function calculateLabourCost(context: LabourCostContext): LabourCostOutcome {
  const { jobId, workerId, payeeId, verified, verifiedPayableMinutes, rate } = context;

  if (!verified) {
    return unresolved(LABOUR_CALCULATION_REASONS.TIME_UNVERIFIED, rate);
  }
  if (!workerId) {
    return unresolved(LABOUR_CALCULATION_REASONS.WORKER_UNRESOLVED, rate);
  }
  if (!jobId) {
    return unresolved(LABOUR_CALCULATION_REASONS.JOB_UNRESOLVED, rate);
  }
  if (!payeeId) {
    return unresolved(LABOUR_CALCULATION_REASONS.PAYEE_UNRESOLVED, rate);
  }
  if (
    verifiedPayableMinutes === null ||
    verifiedPayableMinutes === undefined ||
    !Number.isInteger(verifiedPayableMinutes) ||
    verifiedPayableMinutes <= 0
  ) {
    return unresolved(LABOUR_CALCULATION_REASONS.TIME_INVALID, rate);
  }
  if (!rate) {
    return unresolved(LABOUR_CALCULATION_REASONS.RATE_UNRESOLVED, rate);
  }
  if (rate.approvalStatus !== "APPROVED") {
    return unresolved(LABOUR_CALCULATION_REASONS.RATE_NOT_APPROVED, rate);
  }

  const rateCents = parseAmountToCents(rate.rateAmount);
  if (rateCents === null) {
    return unresolved(LABOUR_CALCULATION_REASONS.RATE_AMOUNT_UNRESOLVED, rate);
  }

  if (rate.rateType === "DAILY") {
    if (
      rate.standardDayMinutes === null ||
      rate.standardDayMinutes === undefined ||
      !Number.isInteger(rate.standardDayMinutes) ||
      rate.standardDayMinutes <= 0
    ) {
      return unresolved(LABOUR_CALCULATION_REASONS.DAY_BASIS_UNRESOLVED, rate);
    }
    const costCents = roundHalfAwayFromZero((verifiedPayableMinutes * rateCents) / rate.standardDayMinutes);
    return {
      status: "RESOLVED",
      calculatedCost: centsToAmountString(costCents),
      unresolvedReason: null,
      rateSnapshot: rate,
    };
  }

  // HOURLY (default): cost = verified minutes / 60 * rate amount
  const costCents = roundHalfAwayFromZero((verifiedPayableMinutes * rateCents) / 60);
  return {
    status: "RESOLVED",
    calculatedCost: centsToAmountString(costCents),
    unresolvedReason: null,
    rateSnapshot: rate,
  };
}

/**
 * Compares two outcomes by their snapshot-relevant fields so a re-run that
 * produces an identical result never creates a redundant new version.
 */
export function outcomesEquivalent(
  left: LabourCostOutcome,
  right: LabourCostOutcome,
): boolean {
  if (left.status !== right.status) return false;
  if (left.calculatedCost !== right.calculatedCost) return false;
  if ((left.unresolvedReason ?? null) !== (right.unresolvedReason ?? null)) return false;
  const lr = left.rateSnapshot;
  const rr = right.rateSnapshot;
  if ((lr === null) !== (rr === null)) return false;
  if (lr === null || rr === null) return true;
  return (
    lr.rateId === rr.rateId &&
    lr.rateType === rr.rateType &&
    lr.rateAmount === rr.rateAmount &&
    lr.standardDayMinutes === rr.standardDayMinutes &&
    lr.approvalStatus === rr.approvalStatus &&
    lr.currencyCode === rr.currencyCode
  );
}