/**
 * Phase 3I — Labour Review & Settlement Preparation routes.
 *
 * Admin-only operational workflow for running, reviewing and correcting labour
 * cost calculations before any settlement/payment phase:
 *
 *   POST /api/labour/calculations/run
 *     Manual trigger: re-runs every VERIFIED labour_time_record through the
 *     Phase 3H engine. Append-only versioning — historical RESOLVED rows are
 *     never overwritten; changed outcomes write a new calculation_version.
 *
 *   GET  /api/labour/calculations?status=&jobId=&workerId=
 *     Latest calculation per time record (RESOLVED / UNRESOLVED review list)
 *     with worker, job, payee, verified minutes, rate used, cost, version.
 *
 *   GET  /api/labour/calculations/:timeRecordId
 *     Full version history for one time record.
 *
 *   GET  /api/labour/time-records?status=
 *     Verified/unverified time records for review.
 *
 *   POST /api/labour/time-records/:id/verify
 *     Correction: set verified_payable_minutes + VERIFIED. Re-running the
 *     trigger then produces a new versioned calculation (no silent edits).
 *
 *   POST /api/labour/rates
 *     Correction: create an APPROVED job-scoped or general labour rate for a
 *     worker or agency. Re-running the trigger then re-resolves.
 *
 * Every route enforces a server-side admin session guard (requireAdmin).
 * No payments, Monzo, CIS, VAT, invoices or settlements are created here.
 */

import express, { type Request, type Response, type Router } from "express";
import {
  processVerifiedTimeRecords,
  type LabourCostExecutor,
} from "./labour-cost-repository.ts";
import {
  SqlLabourCostReviewRepository,
  type LabourCostReviewRepository,
} from "./labour-cost-review.ts";
import {
  LabourSettlementError,
  SqlLabourSettlementRepository,
  type PayeeCisStatus,
  type LabourSettlementRepository,
  type LabourSettlementStatus,
} from "./labour-settlement.ts";
import { requireAdmin } from "./integration-review-route.ts";

export const LABOUR_CALCULATIONS_RUN_ROUTE = "/api/labour/calculations/run";
export const LABOUR_CALCULATIONS_LIST_ROUTE = "/api/labour/calculations";
export const LABOUR_TIME_RECORDS_LIST_ROUTE = "/api/labour/time-records";
export const LABOUR_RATES_CREATE_ROUTE = "/api/labour/rates";
export const LABOUR_SETTLEMENTS_ROUTE = "/api/labour/settlements";
export const LABOUR_PAYEES_ROUTE = "/api/labour/payees";
export const LABOUR_CIS_PROFILES_ROUTE = "/api/labour/cis-profiles";

const CALCULATION_STATUSES = new Set(["PENDING", "RESOLVED", "UNRESOLVED", "ERROR"]);
const TIME_RECORD_STATUSES = new Set(["UNVERIFIED", "VERIFIED", "REJECTED"]);
const RATE_TYPES = new Set(["HOURLY", "DAILY"]);
const SETTLEMENT_STATUSES = new Set(["UNRESOLVED", "REVIEW_REQUIRED", "APPROVED", "VOIDED"]);
const CIS_STATUSES = new Set(["UNRESOLVED", "NOT_APPLICABLE", "GROSS_PAYMENT", "NET_DEDUCTION", "HIGHER_RATE_DEDUCTION"]);

export interface LabourCostRouteSession {
  readonly userId?: unknown;
  readonly username?: string;
  readonly role?: string;
}

export interface LabourCostRouteOptions {
  readonly executor: LabourCostExecutor;
  readonly repository?: LabourCostReviewRepository;
  readonly settlementRepository?: LabourSettlementRepository;
  readonly now?: () => Date;
  readonly calculationId?: () => string;
}

function sessionUsername(request: Request): string {
  const session = (request as unknown as { session?: LabourCostRouteSession }).session;
  return typeof session?.username === "string" ? session.username : "admin";
}

function validPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value !== "string") return null;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseDecimalString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d+(?:\.\d{1,2})?$/.test(trimmed) ? trimmed : null;
}

function settlementErrorStatus(error: LabourSettlementError): number {
  if (error.code === "ALREADY_SETTLED") return 409;
  if (error.code === "SETTLEMENT_LOCKED") return 409;
  return 400;
}

export function createLabourCostReviewRouter(options: LabourCostRouteOptions): Router {
  const router = express.Router();
  const now = options.now ?? (() => new Date());
  const executor = options.executor;
  const repository = options.repository ?? new SqlLabourCostReviewRepository(executor);
  const settlementRepository = options.settlementRepository ?? new SqlLabourSettlementRepository(executor, { now });

  router.use(requireAdmin as express.RequestHandler);

  router.post(LABOUR_CALCULATIONS_RUN_ROUTE, async (request: Request, response) => {
    try {
      const username = sessionUsername(request);
      const result = await processVerifiedTimeRecords(executor, {
        calculatedBy: username,
        now,
        calculationId: options.calculationId,
      });
      response.json({
        recordsProcessed: result.recordsProcessed,
        calculations: result.calculations,
      });
    } catch (error) {
      console.error("Error running labour calculations:", error);
      response.status(500).json({ error: "Failed to run labour calculations" });
    }
  });

  router.get(LABOUR_CALCULATIONS_LIST_ROUTE, async (request: Request, response) => {
    try {
      const status = typeof request.query.status === "string" && request.query.status.length > 0
        ? request.query.status
        : undefined;
      if (status !== undefined && !CALCULATION_STATUSES.has(status)) {
        response.status(400).json({ error: "invalid calculation status filter" });
        return;
      }
      const jobId = typeof request.query.jobId === "string" && request.query.jobId.length > 0
        ? request.query.jobId
        : undefined;
      const workerId = typeof request.query.workerId === "string" && request.query.workerId.length > 0
        ? request.query.workerId
        : undefined;
      const calculations = await repository.listLatestCalculations({ status, jobId, workerId });
      response.json({ calculations });
    } catch (error) {
      console.error("Error listing labour calculations:", error);
      response.status(500).json({ error: "Failed to list labour calculations" });
    }
  });

  router.get(
    `${LABOUR_CALCULATIONS_LIST_ROUTE}/:timeRecordId`,
    async (request: Request, response) => {
      try {
        const versions = await repository.listCalculationVersions(request.params.timeRecordId);
        if (versions.length === 0) {
          response.status(404).json({ error: "no calculations found for time record" });
          return;
        }
        response.json({ calculations: versions });
      } catch (error) {
        console.error("Error listing calculation versions:", error);
        response.status(500).json({ error: "Failed to list calculation versions" });
      }
    },
  );

  router.get(LABOUR_TIME_RECORDS_LIST_ROUTE, async (request: Request, response) => {
    try {
      const status = typeof request.query.status === "string" && request.query.status.length > 0
        ? request.query.status
        : undefined;
      if (status !== undefined && !TIME_RECORD_STATUSES.has(status)) {
        response.status(400).json({ error: "invalid time record status filter" });
        return;
      }
      const timeRecords = await repository.listTimeRecords(status);
      response.json({ timeRecords });
    } catch (error) {
      console.error("Error listing time records:", error);
      response.status(500).json({ error: "Failed to list time records" });
    }
  });

  router.post(
    `${LABOUR_TIME_RECORDS_LIST_ROUTE}/:id/verify`,
    async (request: Request, response) => {
      try {
        const minutes = validPositiveInteger(request.body?.verifiedPayableMinutes)
          ? request.body.verifiedPayableMinutes
          : null;
        if (minutes === null) {
          response.status(400).json({ error: "verifiedPayableMinutes must be a positive integer" });
          return;
        }
        const username = sessionUsername(request);
        const verifiedAt = now().toISOString();
        const timeRecord = await repository.verifyTimeRecord({
          id: request.params.id,
          verifiedPayableMinutes: minutes,
          verifiedBy: username,
          verifiedAt,
          note: typeof request.body?.note === "string" && request.body.note.trim().length > 0
            ? request.body.note.trim()
            : null,
        });
        if (timeRecord === null) {
          response.status(404).json({ error: "time record not found" });
          return;
        }
        response.json({ timeRecord });
      } catch (error) {
        console.error("Error verifying time record:", error);
        response.status(500).json({ error: "Failed to verify time record" });
      }
    },
  );

  router.post(
    `${LABOUR_TIME_RECORDS_LIST_ROUTE}/:id/reject`,
    async (request: Request, response) => {
      try {
        const username = sessionUsername(request);
        const rejectedAt = now().toISOString();
        const timeRecord = await repository.rejectTimeRecord({
          id: request.params.id,
          rejectedBy: username,
          rejectedAt,
          note: typeof request.body?.note === "string" && request.body.note.trim().length > 0
            ? request.body.note.trim()
            : null,
        });
        if (timeRecord === null) {
          response.status(404).json({ error: "time record not found" });
          return;
        }
        response.json({ timeRecord });
      } catch (error) {
        console.error("Error rejecting time record:", error);
        response.status(500).json({ error: "Failed to reject time record" });
      }
    },
  );

  router.post(LABOUR_RATES_CREATE_ROUTE, async (request: Request, response) => {
    try {
      const body = request.body ?? {};
      const workerId = typeof body.workerId === "string" && body.workerId.length > 0 ? body.workerId : null;
      const agencyId = typeof body.agencyId === "string" && body.agencyId.length > 0 ? body.agencyId : null;
      const jobId = typeof body.jobId === "string" && body.jobId.length > 0 ? body.jobId : null;

      if ((workerId === null) === (agencyId === null)) {
        response.status(400).json({ error: "exactly one of workerId or agencyId is required" });
        return;
      }
      const rateType = typeof body.rateType === "string" ? body.rateType.toUpperCase() : "HOURLY";
      if (!RATE_TYPES.has(rateType)) {
        response.status(400).json({ error: "rateType must be HOURLY or DAILY" });
        return;
      }
      const rateAmount = typeof body.rateAmount === "string" ? body.rateAmount : null;
      if (rateAmount === null || !/^\d+(?:\.\d{1,2})?$/.test(rateAmount)) {
        response.status(400).json({ error: "rateAmount must be a non-negative decimal" });
        return;
      }
      let standardDayMinutes: number | null = null;
      if (rateType === "DAILY") {
        standardDayMinutes = parsePositiveInteger(body.standardDayMinutes);
        if (standardDayMinutes === null) {
          response.status(400).json({ error: "DAILY rates require standardDayMinutes" });
          return;
        }
      }
      const approvedBy = sessionUsername(request);
      const rate = await repository.createLabourRate({
        workerId,
        agencyId,
        jobId,
        rateType: rateType as "HOURLY" | "DAILY",
        rateAmount,
        standardDayMinutes,
        approvedBy,
        approvedAt: now().toISOString(),
        notes: typeof body.notes === "string" ? body.notes : null,
      });
      response.status(201).json({ rate });
    } catch (error) {
      console.error("Error creating labour rate:", error);
      response.status(500).json({ error: "Failed to create labour rate" });
    }
  });

  router.get(LABOUR_PAYEES_ROUTE, async (_request: Request, response) => {
    try {
      const payees = await settlementRepository.listPayees();
      response.json({ payees });
    } catch (error) {
      console.error("Error listing labour payees:", error);
      response.status(500).json({ error: "Failed to list labour payees" });
    }
  });

  router.get(LABOUR_CIS_PROFILES_ROUTE, async (_request: Request, response) => {
    try {
      const profiles = await settlementRepository.listCisProfiles();
      response.json({ profiles });
    } catch (error) {
      console.error("Error listing CIS profiles:", error);
      response.status(500).json({ error: "Failed to list CIS profiles" });
    }
  });

  router.put(`${LABOUR_PAYEES_ROUTE}/:payeeId/cis-profile`, async (request: Request, response) => {
    try {
      const body = request.body ?? {};
      const cisStatus = typeof body.cisStatus === "string" ? body.cisStatus.toUpperCase() : "";
      if (!CIS_STATUSES.has(cisStatus)) {
        response.status(400).json({ error: "cisStatus is required and must be a supported CIS status" });
        return;
      }
      const deductionRate = parseDecimalString(body.deductionRate);
      if (body.deductionRate !== undefined && body.deductionRate !== null && body.deductionRate !== "" && deductionRate === null) {
        response.status(400).json({ error: "deductionRate must be a non-negative decimal when supplied" });
        return;
      }
      const profile = await settlementRepository.upsertCisProfile({
        payeeId: request.params.payeeId,
        cisStatus: cisStatus as PayeeCisStatus,
        deductionRate,
        verificationReference: typeof body.verificationReference === "string" && body.verificationReference.trim().length > 0
          ? body.verificationReference.trim()
          : null,
        verifiedBy: sessionUsername(request),
        verifiedAt: now().toISOString(),
        sourceEvidence: typeof body.sourceEvidence === "string" && body.sourceEvidence.trim().length > 0
          ? body.sourceEvidence.trim()
          : null,
        notes: typeof body.notes === "string" && body.notes.trim().length > 0 ? body.notes.trim() : null,
      });
      response.json({ profile });
    } catch (error) {
      if (error instanceof LabourSettlementError) {
        response.status(settlementErrorStatus(error)).json({ error: error.message, code: error.code });
        return;
      }
      console.error("Error saving CIS profile:", error);
      response.status(500).json({ error: "Failed to save CIS profile" });
    }
  });

  router.get(LABOUR_SETTLEMENTS_ROUTE, async (request: Request, response) => {
    try {
      const status = typeof request.query.status === "string" && request.query.status.length > 0
        ? request.query.status
        : undefined;
      if (status !== undefined && !SETTLEMENT_STATUSES.has(status)) {
        response.status(400).json({ error: "invalid settlement status filter" });
        return;
      }
      const settlements = await settlementRepository.listSettlements(status as LabourSettlementStatus | undefined);
      response.json({ settlements });
    } catch (error) {
      console.error("Error listing labour settlements:", error);
      response.status(500).json({ error: "Failed to list labour settlements" });
    }
  });

  router.post(LABOUR_SETTLEMENTS_ROUTE, async (request: Request, response) => {
    try {
      const calculationIds = Array.isArray(request.body?.calculationIds)
        ? request.body.calculationIds.filter((value: unknown): value is string => typeof value === "string")
        : [];
      const result = await settlementRepository.createSettlement({
        calculationIds,
        createdBy: sessionUsername(request),
      });
      response.status(201).json(result);
    } catch (error) {
      if (error instanceof LabourSettlementError) {
        response.status(settlementErrorStatus(error)).json({ error: error.message, code: error.code });
        return;
      }
      console.error("Error creating labour settlement:", error);
      response.status(500).json({ error: "Failed to create labour settlement" });
    }
  });

  router.get(`${LABOUR_SETTLEMENTS_ROUTE}/:id`, async (request: Request, response) => {
    try {
      const settlement = await settlementRepository.getSettlement(request.params.id);
      if (settlement === null) {
        response.status(404).json({ error: "settlement not found" });
        return;
      }
      response.json(settlement);
    } catch (error) {
      console.error("Error reading labour settlement:", error);
      response.status(500).json({ error: "Failed to read labour settlement" });
    }
  });

  router.post(`${LABOUR_SETTLEMENTS_ROUTE}/:id/refresh`, async (request: Request, response) => {
    try {
      const settlement = await settlementRepository.refreshSettlement({
        settlementId: request.params.id,
        refreshedBy: sessionUsername(request),
        refreshedAt: now().toISOString(),
      });
      if (settlement === null) {
        response.status(404).json({ error: "settlement not found" });
        return;
      }
      response.json({ settlement });
    } catch (error) {
      if (error instanceof LabourSettlementError) {
        response.status(settlementErrorStatus(error)).json({ error: error.message, code: error.code });
        return;
      }
      console.error("Error refreshing labour settlement:", error);
      response.status(500).json({ error: "Failed to refresh labour settlement" });
    }
  });

  router.post(`${LABOUR_SETTLEMENTS_ROUTE}/:id/approve`, async (request: Request, response) => {
    try {
      const settlement = await settlementRepository.approveSettlement({
        settlementId: request.params.id,
        approvedBy: sessionUsername(request),
        approvedAt: now().toISOString(),
        reviewNotes: typeof request.body?.reviewNotes === "string" && request.body.reviewNotes.trim().length > 0
          ? request.body.reviewNotes.trim()
          : null,
      });
      if (settlement === null) {
        response.status(409).json({ error: "settlement is not ready for approval or does not exist" });
        return;
      }
      response.json({ settlement });
    } catch (error) {
      console.error("Error approving labour settlement:", error);
      response.status(500).json({ error: "Failed to approve labour settlement" });
    }
  });

  return router;
}
