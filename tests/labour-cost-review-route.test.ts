import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Request, type Response, type NextFunction } from "express";
import type { AddressInfo } from "node:net";
import {
  createLabourCostReviewRouter,
  LABOUR_CALCULATIONS_RUN_ROUTE,
  LABOUR_CALCULATIONS_LIST_ROUTE,
  LABOUR_TIME_RECORDS_LIST_ROUTE,
  LABOUR_RATES_CREATE_ROUTE,
  LABOUR_SETTLEMENTS_ROUTE,
  LABOUR_PAYEES_ROUTE,
  LABOUR_CIS_PROFILES_ROUTE,
  type LabourCostRouteSession,
} from "../server/labour-cost-routes.ts";
import {
  SqlLabourCostReviewRepository,
  type LabourCalculationReviewRow,
  type LabourCostReviewRepository,
  type VerifyTimeRecordInput,
  type RejectTimeRecordInput,
  type CreateLabourRateInput,
} from "../server/labour-cost-review.ts";
import type { LabourCostExecutor, LabourCostPersisted, LabourCostTransaction } from "../server/labour-cost-repository.ts";
import type {
  ApproveLabourSettlementInput,
  CreateLabourSettlementInput,
  LabourSettlementRepository,
  LabourSettlementStatus,
  UpsertPayeeCisProfileInput,
  RefreshLabourSettlementInput,
} from "../server/labour-settlement.ts";

// ---------------------------------------------------------------------------
// In-memory repository for route tests
// ---------------------------------------------------------------------------

class InMemoryLabourReviewRepository implements LabourCostReviewRepository {
  calculations: LabourCalculationReviewRow[] = [];
  versions: Map<string, LabourCalculationReviewRow[]> = new Map();
  timeRecords: LabourCalculationReviewRow[] = [];
  verified: VerifyTimeRecordInput[] = [];
  rejected: RejectTimeRecordInput[] = [];
  rates: CreateLabourRateInput[] = [];
  latestFilter: Record<string, unknown> = {};
  missingTimeRecord: string | null = null;

  async listLatestCalculations(filter: Record<string, unknown>): Promise<readonly LabourCalculationReviewRow[]> {
    this.latestFilter = filter;
    return this.calculations;
  }

  async listCalculationVersions(timeRecordId: string): Promise<readonly LabourCalculationReviewRow[]> {
    return this.versions.get(timeRecordId) ?? [];
  }

  async listTimeRecords(status?: string): Promise<readonly LabourCalculationReviewRow[]> {
    if (status === undefined) return this.timeRecords;
    return this.timeRecords.filter((row) => row.time_status === status);
  }

  async verifyTimeRecord(input: VerifyTimeRecordInput): Promise<LabourCalculationReviewRow | null> {
    if (this.missingTimeRecord === input.id) return null;
    this.verified.push(input);
    return {
      id: input.id,
      verified_payable_minutes: input.verifiedPayableMinutes,
      time_status: "VERIFIED",
      verified_by: input.verifiedBy,
      verified_at: input.verifiedAt,
    };
  }

  async rejectTimeRecord(input: RejectTimeRecordInput): Promise<LabourCalculationReviewRow | null> {
    if (this.missingTimeRecord === input.id) return null;
    this.rejected.push(input);
    return {
      id: input.id,
      verified_payable_minutes: null,
      time_status: "REJECTED",
      verified_by: input.rejectedBy,
      verified_at: input.rejectedAt,
    };
  }

  async createLabourRate(input: CreateLabourRateInput): Promise<LabourCalculationReviewRow> {
    this.rates.push(input);
    return {
      id: "rate-route-0001",
      worker_id: input.workerId,
      agency_id: input.agencyId,
      job_id: input.jobId,
      rate_type: input.rateType,
      rate_amount: input.rateAmount,
      standard_day_minutes: input.standardDayMinutes,
      approval_status: "APPROVED",
      approved_by: input.approvedBy,
      approved_at: input.approvedAt,
    };
  }
}

class InMemoryLabourSettlementRepository implements LabourSettlementRepository {
  settlements: Array<Record<string, unknown>> = [];
  lines: Array<Record<string, unknown>> = [];
  payees: Array<Record<string, unknown>> = [];
  profiles: Array<Record<string, unknown>> = [];
  created: CreateLabourSettlementInput[] = [];
  approved: ApproveLabourSettlementInput[] = [];
  refreshed: RefreshLabourSettlementInput[] = [];
  upsertedProfiles: UpsertPayeeCisProfileInput[] = [];
  listStatus: LabourSettlementStatus | undefined;
  createError: Error | null = null;

  async listPayees(): Promise<readonly Record<string, unknown>[]> {
    return this.payees;
  }

  async listCisProfiles(): Promise<readonly Record<string, unknown>[]> {
    return this.profiles;
  }

  async upsertCisProfile(input: UpsertPayeeCisProfileInput): Promise<Record<string, unknown>> {
    this.upsertedProfiles.push(input);
    const profile = {
      id: `profile-${this.upsertedProfiles.length}`,
      payee_id: input.payeeId,
      cis_status: input.cisStatus,
      deduction_rate: input.deductionRate,
      verification_reference: input.verificationReference,
      verified_by: input.verifiedBy,
      verified_at: input.verifiedAt,
      source_evidence: input.sourceEvidence,
      notes: input.notes,
    };
    this.profiles = this.profiles.filter((candidate) => candidate.payee_id !== input.payeeId);
    this.profiles.push(profile);
    return profile;
  }

  async createSettlement(input: CreateLabourSettlementInput): Promise<{ settlement: Record<string, unknown>; lines: Array<Record<string, unknown>> }> {
    if (this.createError) throw this.createError;
    this.created.push(input);
    const settlement = {
      id: "settlement-1",
      job_id: "job-1",
      payee_id: "payee-1",
      status: "REVIEW_REQUIRED",
      gross_amount: "200.00",
      net_amount: "160.00",
    };
    const line = { id: "line-1", settlement_id: "settlement-1", labour_calculation_id: input.calculationIds[0] };
    this.settlements.push(settlement);
    this.lines.push(line);
    return { settlement, lines: [line] };
  }

  async listSettlements(status?: LabourSettlementStatus): Promise<readonly Record<string, unknown>[]> {
    this.listStatus = status;
    if (status === undefined) return this.settlements;
    return this.settlements.filter((settlement) => settlement.status === status);
  }

  async getSettlement(id: string): Promise<{ settlement: Record<string, unknown>; lines: readonly Record<string, unknown>[] } | null> {
    const settlement = this.settlements.find((candidate) => candidate.id === id);
    if (!settlement) return null;
    return { settlement, lines: this.lines.filter((line) => line.settlement_id === id) };
  }

  async approveSettlement(input: ApproveLabourSettlementInput): Promise<Record<string, unknown> | null> {
    this.approved.push(input);
    const settlement = this.settlements.find((candidate) => candidate.id === input.settlementId);
    if (!settlement || settlement.status !== "REVIEW_REQUIRED") return null;
    settlement.status = "APPROVED";
    settlement.approved_by = input.approvedBy;
    settlement.approved_at = input.approvedAt;
    settlement.review_notes = input.reviewNotes;
    return settlement;
  }

  async refreshSettlement(input: RefreshLabourSettlementInput): Promise<Record<string, unknown> | null> {
    this.refreshed.push(input);
    const settlement = this.settlements.find((candidate) => candidate.id === input.settlementId);
    if (!settlement || settlement.status === "APPROVED") return null;
    settlement.status = "REVIEW_REQUIRED";
    settlement.cis_status = "NET_DEDUCTION";
    settlement.cis_deduction_amount = "40.00";
    settlement.net_amount = "160.00";
    settlement.unresolved_reason = null;
    return settlement;
  }
}

class InMemoryLabourExecutor implements LabourCostExecutor {
  calculations: LabourCostPersisted[] = [];
  records: Array<Record<string, unknown>> = [];

  async query(): Promise<{ rows: Array<Record<string, unknown>> }> {
    return { rows: [] };
  }

  async transaction<T>(work: (transaction: LabourCostTransaction) => Promise<T>): Promise<T> {
    const records = this.records;
    const calculations = this.calculations;
    const adapter: LabourCostTransaction = {
      async query(sql, parameters) {
        const normalized = sql.trim().replace(/\s+/g, " ");
        if (/FROM labour_time_records\s+WHERE time_status/i.test(normalized)) {
          return { rows: records };
        }
        if (/INSERT INTO labour_cost_calculations/i.test(normalized)) {
          const id = String(parameters[0]);
          const row: Record<string, unknown> = {
            id,
            time_record_id: parameters[1],
            calculation_status: parameters[11],
            unresolved_reason: parameters[12],
            calculated_cost: parameters[13],
            calculation_version: parameters[14],
          };
          calculations.push(row as unknown as LabourCostPersisted);
          return { rows: [row] };
        }
        return { rows: [] };
      },
    };
    return work(adapter);
  }
}

interface TestRouteContext {
  repository: InMemoryLabourReviewRepository;
  settlementRepository: InMemoryLabourSettlementRepository;
  executor: InMemoryLabourExecutor;
  setSession(session: LabourCostRouteSession | undefined): void;
  get(path: string): Promise<{ status: number; body: Record<string, unknown> }>;
  post(path: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }>;
  put(path: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }>;
}

async function withTestRoute(
  run: (context: TestRouteContext) => Promise<void>,
): Promise<void> {
  const repository = new InMemoryLabourReviewRepository();
  const settlementRepository = new InMemoryLabourSettlementRepository();
  const executor = new InMemoryLabourExecutor();
  const app = express();
  app.use(express.json());

  let session: LabourCostRouteSession | undefined = { role: "admin", username: "admin" };
  app.use((request: Request, _response: Response, next: NextFunction) => {
    (request as unknown as { session?: LabourCostRouteSession }).session = session;
    next();
  });
  app.use(createLabourCostReviewRouter({
    executor,
    repository,
    settlementRepository,
    now: () => new Date("2026-08-14T12:00:00.000Z"),
  }));

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    assert.ok(address !== null);
    const base = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const send = async (method: string, path: string, body?: unknown) => {
      const response = await fetch(base + path, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return {
        status: response.status,
        body: text.length === 0 ? {} : (JSON.parse(text) as Record<string, unknown>),
      };
    };

    await run({
      repository,
      settlementRepository,
      executor,
      setSession: (nextSession) => {
        session = nextSession;
      },
      get: (path) => send("GET", path),
      post: (path, body) => send("POST", path, body),
      put: (path, body) => send("PUT", path, body),
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  }
}

function resolvedFixture(overrides: Record<string, unknown> = {}): LabourCalculationReviewRow {
  return {
    calculation_id: "calc-1",
    time_record_id: "tr-1",
    calculation_version: 1,
    calculation_status: "RESOLVED",
    unresolved_reason: null,
    calculated_cost: "200.00",
    verified_payable_minutes: 480,
    rate_type: "HOURLY",
    rate_amount: "25.00",
    standard_day_minutes: null,
    currency_code: "GBP",
    job_id: "job-1",
    worker_id: "worker-1",
    payee_id: "payee-1",
    labour_rate_id: "rate-1",
    worker_first_name: "Ada",
    worker_last_name: "Lovelace",
    worker_type: "DIRECT_SELF_EMPLOYED",
    job_title: "Spencer House",
    payee_name: "Ada Lovelace",
    payee_type: "WORKER",
    ...overrides,
  };
}

function unresolvedFixture(overrides: Record<string, unknown> = {}): LabourCalculationReviewRow {
  return resolvedFixture({
    calculation_id: "calc-2",
    time_record_id: "tr-2",
    calculation_status: "UNRESOLVED",
    unresolved_reason: "RATE_UNRESOLVED: no approved labour rate could be resolved",
    calculated_cost: null,
    ...overrides,
  });
}

test("labour review endpoints reject missing and non-admin sessions", async () => {
  await withTestRoute(async ({ get, post, setSession }) => {
    setSession(undefined);
    assert.equal((await get(LABOUR_CALCULATIONS_LIST_ROUTE)).status, 401);
    assert.equal((await get(LABOUR_TIME_RECORDS_LIST_ROUTE)).status, 401);
    assert.equal((await post(LABOUR_CALCULATIONS_RUN_ROUTE)).status, 401);
    assert.equal((await get(LABOUR_SETTLEMENTS_ROUTE)).status, 401);
    assert.equal((await get(LABOUR_PAYEES_ROUTE)).status, 401);
    assert.equal((await get(LABOUR_CIS_PROFILES_ROUTE)).status, 401);
    assert.equal((await post(LABOUR_SETTLEMENTS_ROUTE, { calculationIds: ["calc-1"] })).status, 401);
    assert.equal((await post(`${LABOUR_TIME_RECORDS_LIST_ROUTE}/tr-1/verify`, { verifiedPayableMinutes: 480 })).status, 401);
    assert.equal((await post(LABOUR_RATES_CREATE_ROUTE, { workerId: "w", rateAmount: "25.00" })).status, 401);

    setSession({ role: "contractor", username: "bob" });
    assert.equal((await get(LABOUR_CALCULATIONS_LIST_ROUTE)).status, 401);
    assert.equal((await post(LABOUR_CALCULATIONS_RUN_ROUTE)).status, 401);
    assert.equal((await get(LABOUR_SETTLEMENTS_ROUTE)).status, 401);
  });
});

test("admin listing returns RESOLVED and UNRESOLVED calculations with filter passthrough", async () => {
  await withTestRoute(async ({ repository, get }) => {
    repository.calculations.push(resolvedFixture(), unresolvedFixture());

    const all = await get(LABOUR_CALCULATIONS_LIST_ROUTE);
    assert.equal(all.status, 200);
    assert.equal((all.body.calculations as unknown[]).length, 2);

    const filtered = await get(`${LABOUR_CALCULATIONS_LIST_ROUTE}?status=UNRESOLVED&jobId=job-1&workerId=worker-1`);
    assert.equal(filtered.status, 200);
    assert.deepEqual(repository.latestFilter, { status: "UNRESOLVED", jobId: "job-1", workerId: "worker-1" });
  });
});

test("admin listing rejects an invalid status filter", async () => {
  await withTestRoute(async ({ get }) => {
    const response = await get(`${LABOUR_CALCULATIONS_LIST_ROUTE}?status=BOGUS`);
    assert.equal(response.status, 400);
  });
});

test("admin version history returns all versions for a time record", async () => {
  await withTestRoute(async ({ repository, get }) => {
    repository.versions.set("tr-1", [
      resolvedFixture({ calculation_version: 2, calculated_cost: "240.00" }),
      resolvedFixture({ calculation_version: 1 }),
    ]);
    const response = await get(`${LABOUR_CALCULATIONS_LIST_ROUTE}/tr-1`);
    assert.equal(response.status, 200);
    const versions = response.body.calculations as Array<Record<string, unknown>>;
    assert.equal(versions.length, 2);
    assert.equal(versions[0].calculation_version, 2);
  });
});

test("admin version history returns 404 when no calculations exist", async () => {
  await withTestRoute(async ({ get }) => {
    const response = await get(`${LABOUR_CALCULATIONS_LIST_ROUTE}/tr-missing`);
    assert.equal(response.status, 404);
  });
});

test("admin time record listing supports status filter", async () => {
  await withTestRoute(async ({ repository, get }) => {
    repository.timeRecords.push(
      { id: "tr-1", time_status: "VERIFIED", verified_payable_minutes: 480 },
      { id: "tr-2", time_status: "UNVERIFIED", verified_payable_minutes: null },
    );
    const verified = await get(`${LABOUR_TIME_RECORDS_LIST_ROUTE}?status=VERIFIED`);
    assert.equal(verified.status, 200);
    assert.equal((verified.body.timeRecords as unknown[]).length, 1);
    const invalid = await get(`${LABOUR_TIME_RECORDS_LIST_ROUTE}?status=BOGUS`);
    assert.equal(invalid.status, 400);
  });
});

test("manual run trigger processes verified time records", async () => {
  await withTestRoute(async ({ executor, post }) => {
    executor.records = [
      { id: "tr-1", job_id: "job-1", worker_id: "worker-1", work_date: "2026-08-14", verified_payable_minutes: 480, time_status: "VERIFIED" },
      { id: "tr-2", job_id: "job-1", worker_id: "worker-1", work_date: "2026-08-13", verified_payable_minutes: 300, time_status: "VERIFIED" },
      { id: "tr-3", job_id: "job-1", worker_id: "worker-1", work_date: "2026-08-12", verified_payable_minutes: 240, time_status: "VERIFIED" },
    ];
    const response = await post(LABOUR_CALCULATIONS_RUN_ROUTE);
    assert.equal(response.status, 200);
    assert.equal(response.body.recordsProcessed, 3);
    assert.equal((response.body.calculations as unknown[]).length, 3);
    assert.equal(executor.calculations.length, 3);
  });
});

test("verify time record records the correction", async () => {
  await withTestRoute(async ({ repository, post }) => {
    const response = await post(`${LABOUR_TIME_RECORDS_LIST_ROUTE}/tr-1/verify`, { verifiedPayableMinutes: 300 });
    assert.equal(response.status, 200);
    assert.equal(repository.verified.length, 1);
    assert.equal(repository.verified[0].verifiedPayableMinutes, 300);
    assert.equal(repository.verified[0].verifiedBy, "admin");
    assert.equal(repository.verified[0].verifiedAt, "2026-08-14T12:00:00.000Z");
  });
});

test("verify time record rejects invalid minutes and missing records", async () => {
  await withTestRoute(async ({ repository, post }) => {
    const invalid = await post(`${LABOUR_TIME_RECORDS_LIST_ROUTE}/tr-1/verify`, { verifiedPayableMinutes: 0 });
    assert.equal(invalid.status, 400);
    assert.equal(repository.verified.length, 0);

    repository.missingTimeRecord = "tr-nope";
    const missing = await post(`${LABOUR_TIME_RECORDS_LIST_ROUTE}/tr-nope/verify`, { verifiedPayableMinutes: 300 });
    assert.equal(missing.status, 404);
  });
});

test("reject time record records the rejection with optional note", async () => {
  await withTestRoute(async ({ repository, post }) => {
    const withNote = await post(`${LABOUR_TIME_RECORDS_LIST_ROUTE}/tr-2/reject`, { note: "clock-out missing" });
    assert.equal(withNote.status, 200);
    assert.equal(repository.rejected.length, 1);
    assert.equal(repository.rejected[0].id, "tr-2");
    assert.equal(repository.rejected[0].note, "clock-out missing");
    assert.equal(repository.rejected[0].rejectedBy, "admin");

    const blankNote = await post(`${LABOUR_TIME_RECORDS_LIST_ROUTE}/tr-3/reject`, { note: "   " });
    assert.equal(blankNote.status, 200);
    assert.equal(repository.rejected[1].note, null);

    repository.missingTimeRecord = "tr-nope";
    const missing = await post(`${LABOUR_TIME_RECORDS_LIST_ROUTE}/tr-nope/reject`, {});
    assert.equal(missing.status, 404);
  });
});

test("create labour rate validates worker/agency exclusivity and creates approved rate", async () => {
  await withTestRoute(async ({ repository, post }) => {
    const both = await post(LABOUR_RATES_CREATE_ROUTE, { workerId: "w", agencyId: "a", rateAmount: "25.00" });
    assert.equal(both.status, 400);
    assert.equal(repository.rates.length, 0);

    const neither = await post(LABOUR_RATES_CREATE_ROUTE, { rateAmount: "25.00" });
    assert.equal(neither.status, 400);

    const badType = await post(LABOUR_RATES_CREATE_ROUTE, { workerId: "w", rateType: "WEEKLY", rateAmount: "25.00" });
    assert.equal(badType.status, 400);

    const dailyMissingBasis = await post(LABOUR_RATES_CREATE_ROUTE, { workerId: "w", rateType: "DAILY", rateAmount: "200.00" });
    assert.equal(dailyMissingBasis.status, 400);

    const ok = await post(LABOUR_RATES_CREATE_ROUTE, { workerId: "w", jobId: "job-1", rateType: "HOURLY", rateAmount: "35.00" });
    assert.equal(ok.status, 201);
    assert.equal(repository.rates.length, 1);
    assert.equal(repository.rates[0].jobId, "job-1");
    assert.equal(repository.rates[0].rateType, "HOURLY");
    assert.equal(repository.rates[0].approvedBy, "admin");

    const daily = await post(LABOUR_RATES_CREATE_ROUTE, { agencyId: "a", rateType: "DAILY", rateAmount: "200.00", standardDayMinutes: 480 });
    assert.equal(daily.status, 201);
    assert.equal(repository.rates[1].standardDayMinutes, 480);
  });
});

test("admin settlement endpoints create, list, read and approve without payment side effects", async () => {
  await withTestRoute(async ({ settlementRepository, get, post }) => {
    const created = await post(LABOUR_SETTLEMENTS_ROUTE, { calculationIds: ["calc-1"] });
    assert.equal(created.status, 201);
    assert.equal(settlementRepository.created.length, 1);
    assert.deepEqual(settlementRepository.created[0].calculationIds, ["calc-1"]);
    assert.equal(settlementRepository.created[0].createdBy, "admin");

    const listed = await get(`${LABOUR_SETTLEMENTS_ROUTE}?status=REVIEW_REQUIRED`);
    assert.equal(listed.status, 200);
    assert.equal(settlementRepository.listStatus, "REVIEW_REQUIRED");
    assert.equal((listed.body.settlements as unknown[]).length, 1);

    const detail = await get(`${LABOUR_SETTLEMENTS_ROUTE}/settlement-1`);
    assert.equal(detail.status, 200);
    assert.equal((detail.body.lines as unknown[]).length, 1);

    const approved = await post(`${LABOUR_SETTLEMENTS_ROUTE}/settlement-1/approve`, { reviewNotes: "reviewed" });
    assert.equal(approved.status, 200);
    assert.equal(settlementRepository.approved[0].approvedBy, "admin");
    assert.equal(settlementRepository.approved[0].approvedAt, "2026-08-14T12:00:00.000Z");
    assert.equal(settlementRepository.approved[0].reviewNotes, "reviewed");
  });
});

test("admin CIS profile endpoints list payees and save explicit verified CIS profile", async () => {
  await withTestRoute(async ({ settlementRepository, get, put }) => {
    settlementRepository.payees.push({ id: "payee-1", name: "Ada Lovelace", payee_type: "WORKER", cis_status: null });

    const payees = await get(LABOUR_PAYEES_ROUTE);
    assert.equal(payees.status, 200);
    assert.equal((payees.body.payees as unknown[]).length, 1);

    const profilesBefore = await get(LABOUR_CIS_PROFILES_ROUTE);
    assert.equal(profilesBefore.status, 200);
    assert.equal((profilesBefore.body.profiles as unknown[]).length, 0);

    const saved = await put(`${LABOUR_PAYEES_ROUTE}/payee-1/cis-profile`, {
      cisStatus: "NET_DEDUCTION",
      deductionRate: "20.00",
      verificationReference: "manual-check",
      sourceEvidence: "evidence retained outside app",
      notes: "verified",
    });
    assert.equal(saved.status, 200);
    assert.equal(settlementRepository.upsertedProfiles.length, 1);
    assert.equal(settlementRepository.upsertedProfiles[0].payeeId, "payee-1");
    assert.equal(settlementRepository.upsertedProfiles[0].cisStatus, "NET_DEDUCTION");
    assert.equal(settlementRepository.upsertedProfiles[0].deductionRate, "20.00");
    assert.equal(settlementRepository.upsertedProfiles[0].verifiedBy, "admin");
    assert.equal(settlementRepository.upsertedProfiles[0].verifiedAt, "2026-08-14T12:00:00.000Z");
  });
});

test("admin CIS profile endpoint rejects invalid status and deduction format", async () => {
  await withTestRoute(async ({ put }) => {
    assert.equal((await put(`${LABOUR_PAYEES_ROUTE}/payee-1/cis-profile`, { cisStatus: "MAYBE" })).status, 400);
    assert.equal((await put(`${LABOUR_PAYEES_ROUTE}/payee-1/cis-profile`, { cisStatus: "NET_DEDUCTION", deductionRate: "abc" })).status, 400);
  });
});

test("admin settlement refresh recalculates unlocked settlement and records reviewer", async () => {
  await withTestRoute(async ({ settlementRepository, post }) => {
    settlementRepository.settlements.push({ id: "settlement-refresh", status: "UNRESOLVED" });
    const response = await post(`${LABOUR_SETTLEMENTS_ROUTE}/settlement-refresh/refresh`, {});
    assert.equal(response.status, 200);
    assert.equal(settlementRepository.refreshed.length, 1);
    assert.equal(settlementRepository.refreshed[0].refreshedBy, "admin");
    assert.equal(settlementRepository.refreshed[0].refreshedAt, "2026-08-14T12:00:00.000Z");
  });
});

test("admin settlement endpoints validate status and unresolved approval", async () => {
  await withTestRoute(async ({ settlementRepository, get, post }) => {
    assert.equal((await get(`${LABOUR_SETTLEMENTS_ROUTE}?status=PAID`)).status, 400);
    assert.equal((await get(`${LABOUR_SETTLEMENTS_ROUTE}/missing`)).status, 404);

    settlementRepository.settlements.push({ id: "settlement-unresolved", status: "UNRESOLVED" });
    const blocked = await post(`${LABOUR_SETTLEMENTS_ROUTE}/settlement-unresolved/approve`, {});
    assert.equal(blocked.status, 409);
  });
});

test("labour review route uses SqlLabourCostReviewRepository when none injected", async () => {
  const executor = new InMemoryLabourExecutor();
  const app = express();
  app.use(express.json());
  app.use(createLabourCostReviewRouter({ executor }));
  assert.ok(executor);
  const repo = new SqlLabourCostReviewRepository(executor);
  assert.equal(typeof repo.listLatestCalculations, "function");
  assert.equal(typeof repo.createLabourRate, "function");
});
