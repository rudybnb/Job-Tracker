import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateLabourCost, outcomesEquivalent, type LabourCostContext, type LabourCostRate } from "../server/labour-cost-engine.ts";
import { calculateAndPersistTimeRecord, type LabourCostRow, type LabourCostTransaction, type LabourCostTimeRecord } from "../server/labour-cost-repository.ts";

// ---------------------------------------------------------------------------
// Engine tests — pure calculation rules
// ---------------------------------------------------------------------------

function rate(overrides: Partial<LabourCostRate> = {}): LabourCostRate {
  return {
    rateId: "rate-1",
    rateType: "HOURLY",
    rateAmount: "25.00",
    standardDayMinutes: null,
    approvalStatus: "APPROVED",
    currencyCode: "GBP",
    ...overrides,
  };
}

function context(overrides: Partial<LabourCostContext> = {}): LabourCostContext {
  return {
    timeRecordId: "tr-1",
    jobId: "job-1",
    workerId: "worker-1",
    payeeId: "payee-1",
    verified: true,
    verifiedPayableMinutes: 480,
    rate: rate(),
    ...overrides,
  };
}

test("hourly self-employed: 480 verified minutes at 25.00 = 200.00", () => {
  const outcome = calculateLabourCost(context({ verifiedPayableMinutes: 480 }));
  assert.equal(outcome.status, "RESOLVED");
  assert.equal(outcome.calculatedCost, "200.00");
  assert.equal(outcome.unresolvedReason, null);
  assert.equal(outcome.rateSnapshot?.rateType, "HOURLY");
});

test("hourly self-employed: 95 minutes at 25.00 = 39.58 (rounded half away)", () => {
  const outcome = calculateLabourCost(context({ verifiedPayableMinutes: 95 }));
  assert.equal(outcome.status, "RESOLVED");
  assert.equal(outcome.calculatedCost, "39.58");
});

test("daily self-employed: 480 minutes, day basis 480, 200.00/day = 200.00", () => {
  const outcome = calculateLabourCost(
    context({
      rate: rate({ rateType: "DAILY", rateAmount: "200.00", standardDayMinutes: 480 }),
      verifiedPayableMinutes: 480,
    }),
  );
  assert.equal(outcome.status, "RESOLVED");
  assert.equal(outcome.calculatedCost, "200.00");
});

test("daily self-employed: 240 minutes, day basis 480, 200.00/day = 100.00 (no assumed day length)", () => {
  const outcome = calculateLabourCost(
    context({
      rate: rate({ rateType: "DAILY", rateAmount: "200.00", standardDayMinutes: 480 }),
      verifiedPayableMinutes: 240,
    }),
  );
  assert.equal(outcome.status, "RESOLVED");
  assert.equal(outcome.calculatedCost, "100.00");
});

test("hourly agency: 300 verified minutes at 30.00 = 150.00", () => {
  const outcome = calculateLabourCost(context({ verifiedPayableMinutes: 300, rate: rate({ rateAmount: "30.00" }) }));
  assert.equal(outcome.status, "RESOLVED");
  assert.equal(outcome.calculatedCost, "150.00");
});

test("daily agency: 960 minutes, day basis 480, 180.00/day = 360.00", () => {
  const outcome = calculateLabourCost(
    context({
      verifiedPayableMinutes: 960,
      rate: rate({ rateType: "DAILY", rateAmount: "180.00", standardDayMinutes: 480 }),
    }),
  );
  assert.equal(outcome.status, "RESOLVED");
  assert.equal(outcome.calculatedCost, "360.00");
});

test("missing approved rate => UNRESOLVED RATE_UNRESOLVED", () => {
  const outcome = calculateLabourCost(context({ rate: null }));
  assert.equal(outcome.status, "UNRESOLVED");
  assert.match(outcome.unresolvedReason ?? "", /RATE_UNRESOLVED/);
  assert.equal(outcome.calculatedCost, null);
});

test("rate not approved => UNRESOLVED RATE_NOT_APPROVED", () => {
  const outcome = calculateLabourCost(context({ rate: rate({ approvalStatus: "UNKNOWN" }) }));
  assert.equal(outcome.status, "UNRESOLVED");
  assert.match(outcome.unresolvedReason ?? "", /RATE_NOT_APPROVED/);
});

test("approved rate with no amount => UNRESOLVED RATE_AMOUNT_UNRESOLVED", () => {
  const outcome = calculateLabourCost(context({ rate: rate({ rateAmount: null }) }));
  assert.equal(outcome.status, "UNRESOLVED");
  assert.match(outcome.unresolvedReason ?? "", /RATE_AMOUNT_UNRESOLVED/);
});

test("daily rate missing day basis => UNRESOLVED DAY_BASIS_UNRESOLVED (no assumed day)", () => {
  const outcome = calculateLabourCost(context({ rate: rate({ rateType: "DAILY", rateAmount: "200.00", standardDayMinutes: null }) }));
  assert.equal(outcome.status, "UNRESOLVED");
  assert.match(outcome.unresolvedReason ?? "", /DAY_BASIS_UNRESOLVED/);
});

test("daily rate with non-positive day basis => UNRESOLVED DAY_BASIS_UNRESOLVED", () => {
  const outcome = calculateLabourCost(context({ rate: rate({ rateType: "DAILY", rateAmount: "200.00", standardDayMinutes: 0 }) }));
  assert.equal(outcome.status, "UNRESOLVED");
  assert.match(outcome.unresolvedReason ?? "", /DAY_BASIS_UNRESOLVED/);
});

test("missing payee => UNRESOLVED PAYEE_UNRESOLVED", () => {
  const outcome = calculateLabourCost(context({ payeeId: null }));
  assert.equal(outcome.status, "UNRESOLVED");
  assert.match(outcome.unresolvedReason ?? "", /PAYEE_UNRESOLVED/);
});

test("missing worker => UNRESOLVED WORKER_UNRESOLVED", () => {
  const outcome = calculateLabourCost(context({ workerId: null }));
  assert.equal(outcome.status, "UNRESOLVED");
  assert.match(outcome.unresolvedReason ?? "", /WORKER_UNRESOLVED/);
});

test("missing job => UNRESOLVED JOB_UNRESOLVED", () => {
  const outcome = calculateLabourCost(context({ jobId: null }));
  assert.equal(outcome.status, "UNRESOLVED");
  assert.match(outcome.unresolvedReason ?? "", /JOB_UNRESOLVED/);
});

test("unverified time is blocked => UNRESOLVED TIME_UNVERIFIED (even with all else resolved)", () => {
  const outcome = calculateLabourCost(context({ verified: false }));
  assert.equal(outcome.status, "UNRESOLVED");
  assert.match(outcome.unresolvedReason ?? "", /TIME_UNVERIFIED/);
});

test("invalid verified minutes => UNRESOLVED TIME_INVALID", () => {
  const outcome = calculateLabourCost(context({ verifiedPayableMinutes: 0 }));
  assert.equal(outcome.status, "UNRESOLVED");
  assert.match(outcome.unresolvedReason ?? "", /TIME_INVALID/);
});

test("outcomesEquivalent detects identical and differing snapshots", () => {
  const a = calculateLabourCost(context({ verifiedPayableMinutes: 480 }));
  const b = calculateLabourCost(context({ verifiedPayableMinutes: 480 }));
  const c = calculateLabourCost(context({ verifiedPayableMinutes: 300 }));
  assert.equal(outcomesEquivalent(a, b), true);
  assert.equal(outcomesEquivalent(a, c), false);
});

test("engine never fabricates a rate amount", () => {
  const outcome = calculateLabourCost(context({ rate: rate({ rateAmount: null }) }));
  assert.equal(outcome.calculatedCost, null);
  assert.equal(outcome.status, "UNRESOLVED");
});

// ---------------------------------------------------------------------------
// Repository tests — resolution + persistence + versioning (mock executor)
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<LabourCostTimeRecord> = {}): LabourCostTimeRecord {
  return {
    id: "tr-1",
    jobId: "job-1",
    workerId: "worker-1",
    workDate: "2026-08-14",
    verifiedPayableMinutes: 480,
    timeStatus: "VERIFIED",
    ...overrides,
  };
}

interface MockContext {
  workers: LabourCostRow[];
  workerPayees: LabourCostRow[];
  agencies: LabourCostRow[];
  agencyPayees: LabourCostRow[];
  workerJobRates: LabourCostRow[];
  agencyJobRates: LabourCostRow[];
  workerRates: LabourCostRow[];
  agencyRates: LabourCostRow[];
  calculations: Array<Record<string, unknown>>;
  inserted: Array<{ sql: string; params: unknown[] }>;
}

function createMockTransaction(seed: Partial<MockContext> = {}): { transaction: LabourCostTransaction; context: MockContext } {
  const context: MockContext = {
    workers: seed.workers ?? [],
    workerPayees: seed.workerPayees ?? [],
    agencies: seed.agencies ?? [],
    agencyPayees: seed.agencyPayees ?? [],
    workerJobRates: seed.workerJobRates ?? [],
    agencyJobRates: seed.agencyJobRates ?? [],
    workerRates: seed.workerRates ?? [],
    agencyRates: seed.agencyRates ?? [],
    calculations: seed.calculations ?? [],
    inserted: [],
  };

  const transaction: LabourCostTransaction = {
    async query(sql, parameters) {
      const normalized = sql.trim().replace(/\s+/g, " ");

      if (/SELECT id, worker_type\s+FROM workers/i.test(normalized)) {
        return { rows: context.workers };
      }
      if (/payee_type = 'WORKER'\s+AND worker_id/i.test(normalized)) {
        return { rows: context.workerPayees };
      }
      if (/FROM agency_workers aw\s+JOIN agencies a/i.test(normalized)) {
        return { rows: context.agencies };
      }
      if (/payee_type = 'SUPPLIER'\s+AND supplier_id/i.test(normalized)) {
        return { rows: context.agencyPayees };
      }
      if (/WHERE worker_id = \$\d\s+AND job_id = \$\d/i.test(normalized)) {
        return { rows: context.workerJobRates };
      }
      if (/WHERE agency_id = \$\d\s+AND job_id = \$\d/i.test(normalized)) {
        return { rows: context.agencyJobRates };
      }
      if (/WHERE worker_id = \$\d\s+AND job_id IS NULL/i.test(normalized)) {
        return { rows: context.workerRates };
      }
      if (/WHERE agency_id = \$\d\s+AND job_id IS NULL/i.test(normalized)) {
        return { rows: context.agencyRates };
      }
      if (/FROM labour_cost_calculations\s+WHERE time_record_id/i.test(normalized)) {
        return { rows: context.calculations };
      }
      if (/INSERT INTO labour_cost_calculations/i.test(normalized)) {
        const id = String(parameters[0]);
        const row: Record<string, unknown> = {
          id,
          time_record_id: parameters[1],
          job_id: parameters[2],
          worker_id: parameters[3],
          payee_id: parameters[4],
          labour_rate_id: parameters[5],
          rate_type: parameters[6],
          rate_amount: parameters[7],
          standard_day_minutes: parameters[8],
          currency_code: parameters[9],
          verified_payable_minutes: parameters[10],
          calculation_status: parameters[11],
          unresolved_reason: parameters[12],
          calculated_cost: parameters[13],
          calculation_version: parameters[14],
          calculated_at: parameters[15],
          calculated_by: parameters[16],
          source_evidence: parameters[17],
        };
        context.inserted.push({ sql, params: parameters });
        // Enforce the unique (time_record_id, calculation_version) guard.
        const exists = context.calculations.some(
          (c) => c.time_record_id === row.time_record_id && c.calculation_version === row.calculation_version,
        );
        if (exists) return { rows: [] };
        context.calculations.push(row);
        return { rows: [row] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  return { transaction, context };
}

function calculationFor(context: MockContext, id = "tr-1"): Record<string, unknown> | undefined {
  return context.calculations.filter((c) => c.time_record_id === id).sort((a, b) =>
    Number(a.calculation_version) - Number(b.calculation_version),
  )[0];
}

function latestFor(context: MockContext, id = "tr-1"): Record<string, unknown> | undefined {
  return context.calculations
    .filter((c) => c.time_record_id === id)
    .sort((a, b) => Number(b.calculation_version) - Number(a.calculation_version))[0];
}

const HOURLY_RATE_ROW: LabourCostRow = {
  id: "rate-h1",
  rate_type: "HOURLY",
  rate_amount: "25.00",
  standard_day_minutes: null,
  approval_status: "APPROVED",
  currency_code: "GBP",
};

const DAILY_RATE_ROW: LabourCostRow = {
  id: "rate-d1",
  rate_type: "DAILY",
  rate_amount: "200.00",
  standard_day_minutes: 480,
  approval_status: "APPROVED",
  currency_code: "GBP",
};

test("repository: hourly self-employed resolves worker payee + worker rate and persists RESOLVED 200.00", async () => {
  const { transaction, context } = createMockTransaction({
    workers: [{ id: "worker-1", worker_type: "DIRECT_SELF_EMPLOYED" }],
    workerPayees: [{ id: "payee-1" }],
    workerRates: [HOURLY_RATE_ROW],
  });
  const persisted = await calculateAndPersistTimeRecord(transaction, makeRecord(), { calculationId: () => "calc-1" });
  assert.equal(persisted.calculationStatus, "RESOLVED");
  assert.equal(persisted.calculatedCost, "200.00");
  assert.equal(persisted.payeeId, "payee-1");
  assert.equal(persisted.labourRateId, "rate-h1");
  assert.equal(persisted.calculationVersion, 1);
  const stored = calculationFor(context);
  assert.equal(stored?.calculation_status, "RESOLVED");
  assert.equal(stored?.calculated_cost, "200.00");
  assert.equal(stored?.rate_amount, "25.00");
  assert.equal(stored?.source_evidence, "time_record=tr-1;status=RESOLVED;version=1");
});

test("repository: daily self-employed requires approved day basis; 240 min / 480 * 200 = 100.00", async () => {
  const { transaction, context } = createMockTransaction({
    workers: [{ id: "worker-1", worker_type: "DIRECT_SELF_EMPLOYED" }],
    workerPayees: [{ id: "payee-1" }],
    workerRates: [DAILY_RATE_ROW],
  });
  const persisted = await calculateAndPersistTimeRecord(
    transaction,
    makeRecord({ verifiedPayableMinutes: 240 }),
    { calculationId: () => "calc-1" },
  );
  assert.equal(persisted.calculationStatus, "RESOLVED");
  assert.equal(persisted.calculatedCost, "100.00");
  assert.equal(persisted.rateType, "DAILY");
  assert.equal(persisted.standardDayMinutes, 480);
});

test("repository: hourly agency resolves agency supplier payee + worker rate", async () => {
  const { transaction, context } = createMockTransaction({
    workers: [{ id: "worker-1", worker_type: "AGENCY" }],
    agencies: [{ agency_id: "agency-1", supplier_id: "supplier-1" }],
    agencyPayees: [{ id: "payee-supplier-1" }],
    workerRates: [HOURLY_RATE_ROW],
  });
  const persisted = await calculateAndPersistTimeRecord(transaction, makeRecord(), { calculationId: () => "calc-1" });
  assert.equal(persisted.calculationStatus, "RESOLVED");
  assert.equal(persisted.calculatedCost, "200.00");
  assert.equal(persisted.payeeId, "payee-supplier-1", "agency worker must pay the agency supplier");
});

test("repository: hourly agency falls back to agency-level approved rate when no worker rate", async () => {
  const { transaction, context } = createMockTransaction({
    workers: [{ id: "worker-1", worker_type: "AGENCY" }],
    agencies: [{ agency_id: "agency-1", supplier_id: "supplier-1" }],
    agencyPayees: [{ id: "payee-supplier-1" }],
    workerRates: [],
    agencyRates: [{ ...HOURLY_RATE_ROW, id: "rate-agency-h1", rate_amount: "30.00" }],
  });
  const persisted = await calculateAndPersistTimeRecord(transaction, makeRecord({ verifiedPayableMinutes: 300 }), {
    calculationId: () => "calc-1",
  });
  assert.equal(persisted.calculationStatus, "RESOLVED");
  assert.equal(persisted.calculatedCost, "150.00");
  assert.equal(persisted.labourRateId, "rate-agency-h1");
});

test("repository: job-specific worker rate wins over worker general rate (priority a > c)", async () => {
  const { transaction, context } = createMockTransaction({
    workers: [{ id: "worker-1", worker_type: "DIRECT_SELF_EMPLOYED" }],
    workerPayees: [{ id: "payee-1" }],
    workerJobRates: [{ ...HOURLY_RATE_ROW, id: "rate-job-h1", rate_amount: "35.00" }],
    workerRates: [{ ...HOURLY_RATE_ROW, id: "rate-general-h1", rate_amount: "25.00" }],
  });
  const persisted = await calculateAndPersistTimeRecord(transaction, makeRecord(), { calculationId: () => "calc-1" });
  assert.equal(persisted.calculationStatus, "RESOLVED");
  assert.equal(persisted.calculatedCost, "280.00", "480 min at job-specific 35.00 = 280.00");
  assert.equal(persisted.labourRateId, "rate-job-h1");
});

test("repository: job-specific agency rate wins over agency general rate (priority b > c)", async () => {
  const { transaction, context } = createMockTransaction({
    workers: [{ id: "worker-1", worker_type: "AGENCY" }],
    agencies: [{ agency_id: "agency-1", supplier_id: "supplier-1" }],
    agencyPayees: [{ id: "payee-supplier-1" }],
    agencyJobRates: [{ ...HOURLY_RATE_ROW, id: "rate-agency-job", rate_amount: "40.00" }],
    workerRates: [],
    agencyRates: [{ ...HOURLY_RATE_ROW, id: "rate-agency-general", rate_amount: "30.00" }],
  });
  const persisted = await calculateAndPersistTimeRecord(transaction, makeRecord({ verifiedPayableMinutes: 300 }), {
    calculationId: () => "calc-1",
  });
  assert.equal(persisted.calculationStatus, "RESOLVED");
  assert.equal(persisted.calculatedCost, "200.00", "300 min at job-specific agency 40.00 = 200.00");
  assert.equal(persisted.labourRateId, "rate-agency-job");
});

test("repository: agency prefers worker general rate over agency general rate (priority c worker > agency)", async () => {
  const { transaction, context } = createMockTransaction({
    workers: [{ id: "worker-1", worker_type: "AGENCY" }],
    agencies: [{ agency_id: "agency-1", supplier_id: "supplier-1" }],
    agencyPayees: [{ id: "payee-supplier-1" }],
    workerRates: [{ ...HOURLY_RATE_ROW, id: "rate-worker-general", rate_amount: "22.00" }],
    agencyRates: [{ ...HOURLY_RATE_ROW, id: "rate-agency-general", rate_amount: "30.00" }],
  });
  const persisted = await calculateAndPersistTimeRecord(transaction, makeRecord({ verifiedPayableMinutes: 300 }), {
    calculationId: () => "calc-1",
  });
  assert.equal(persisted.calculationStatus, "RESOLVED");
  assert.equal(persisted.calculatedCost, "110.00", "300 min at worker general 22.00 = 110.00");
  assert.equal(persisted.labourRateId, "rate-worker-general");
});

test("repository: no approved rate for the job and no general rate => UNRESOLVED RATE_UNRESOLVED", async () => {
  const { transaction, context } = createMockTransaction({
    workers: [{ id: "worker-1", worker_type: "DIRECT_SELF_EMPLOYED" }],
    workerPayees: [{ id: "payee-1" }],
    workerJobRates: [],
    workerRates: [],
  });
  const persisted = await calculateAndPersistTimeRecord(transaction, makeRecord(), { calculationId: () => "calc-1" });
  assert.equal(persisted.calculationStatus, "UNRESOLVED");
  assert.match(persisted.unresolvedReason ?? "", /RATE_UNRESOLVED/);
});

test("repository: daily agency uses approved day basis via agency fallback", async () => {
  const { transaction, context } = createMockTransaction({
    workers: [{ id: "worker-1", worker_type: "AGENCY" }],
    agencies: [{ agency_id: "agency-1", supplier_id: "supplier-1" }],
    agencyPayees: [{ id: "payee-supplier-1" }],
    workerRates: [],
    agencyRates: [{ ...DAILY_RATE_ROW, id: "rate-agency-d1" }],
  });
  const persisted = await calculateAndPersistTimeRecord(transaction, makeRecord({ verifiedPayableMinutes: 480 }), {
    calculationId: () => "calc-1",
  });
  assert.equal(persisted.calculationStatus, "RESOLVED");
  assert.equal(persisted.calculatedCost, "200.00");
  assert.equal(persisted.rateType, "DAILY");
});

test("repository: missing approved rate => UNRESOLVED with RATE_UNRESOLVED reason", async () => {
  const { transaction, context } = createMockTransaction({
    workers: [{ id: "worker-1", worker_type: "DIRECT_SELF_EMPLOYED" }],
    workerPayees: [{ id: "payee-1" }],
    workerRates: [],
  });
  const persisted = await calculateAndPersistTimeRecord(transaction, makeRecord(), { calculationId: () => "calc-1" });
  assert.equal(persisted.calculationStatus, "UNRESOLVED");
  assert.match(persisted.unresolvedReason ?? "", /RATE_UNRESOLVED/);
  assert.equal(persisted.calculatedCost, null);
});

test("repository: daily rate missing day basis => UNRESOLVED DAY_BASIS_UNRESOLVED", async () => {
  const { transaction, context } = createMockTransaction({
    workers: [{ id: "worker-1", worker_type: "DIRECT_SELF_EMPLOYED" }],
    workerPayees: [{ id: "payee-1" }],
    workerRates: [{ ...DAILY_RATE_ROW, standard_day_minutes: null }],
  });
  const persisted = await calculateAndPersistTimeRecord(transaction, makeRecord(), { calculationId: () => "calc-1" });
  assert.equal(persisted.calculationStatus, "UNRESOLVED");
  assert.match(persisted.unresolvedReason ?? "", /DAY_BASIS_UNRESOLVED/);
});

test("repository: missing payee => UNRESOLVED PAYEE_UNRESOLVED", async () => {
  const { transaction, context } = createMockTransaction({
    workers: [{ id: "worker-1", worker_type: "DIRECT_SELF_EMPLOYED" }],
    workerPayees: [],
    workerRates: [HOURLY_RATE_ROW],
  });
  const persisted = await calculateAndPersistTimeRecord(transaction, makeRecord(), { calculationId: () => "calc-1" });
  assert.equal(persisted.calculationStatus, "UNRESOLVED");
  assert.match(persisted.unresolvedReason ?? "", /PAYEE_UNRESOLVED/);
});

test("repository: unverified time record => UNRESOLVED TIME_UNVERIFIED even when rate+payee resolved", async () => {
  const { transaction, context } = createMockTransaction({
    workers: [{ id: "worker-1", worker_type: "DIRECT_SELF_EMPLOYED" }],
    workerPayees: [{ id: "payee-1" }],
    workerRates: [HOURLY_RATE_ROW],
  });
  const persisted = await calculateAndPersistTimeRecord(
    transaction,
    makeRecord({ timeStatus: "UNVERIFIED" }),
    { calculationId: () => "calc-1" },
  );
  assert.equal(persisted.calculationStatus, "UNRESOLVED");
  assert.match(persisted.unresolvedReason ?? "", /TIME_UNVERIFIED/);
});

test("repository: recalculation is versioned — identical re-run is a no-op, changed rate bumps version", async () => {
  const { transaction, context } = createMockTransaction({
    workers: [{ id: "worker-1", worker_type: "DIRECT_SELF_EMPLOYED" }],
    workerPayees: [{ id: "payee-1" }],
    workerRates: [HOURLY_RATE_ROW],
  });

  const first = await calculateAndPersistTimeRecord(transaction, makeRecord(), { calculationId: () => "calc-1" });
  assert.equal(first.calculationVersion, 1);
  assert.equal(context.calculations.length, 1);

  const rerun = await calculateAndPersistTimeRecord(transaction, makeRecord(), { calculationId: () => "calc-1" });
  assert.equal(rerun.calculationVersion, 1, "identical re-run must not create a new version");
  assert.equal(context.calculations.length, 1, "identical re-run must not insert a duplicate row");

  // Rate changes -> new version; historical resolved v1 row is preserved.
  context.workerRates = [{ ...HOURLY_RATE_ROW, rate_amount: "30.00" }];
  const bumped = await calculateAndPersistTimeRecord(transaction, makeRecord(), { calculationId: () => "calc-2" });
  assert.equal(bumped.calculationVersion, 2);
  assert.equal(bumped.calculatedCost, "240.00");
  assert.equal(context.calculations.length, 2, "historical resolved row must not be overwritten");
  const v1 = context.calculations.find((c) => c.calculation_version === 1);
  assert.equal(v1?.calculated_cost, "200.00", "v1 snapshot must remain intact");
  const v2 = context.calculations.find((c) => c.calculation_version === 2);
  assert.equal(v2?.calculated_cost, "240.00");
});

test("repository: duplicate version insert is prevented by the unique guard", async () => {
  const { transaction, context } = createMockTransaction({
    workers: [{ id: "worker-1", worker_type: "DIRECT_SELF_EMPLOYED" }],
    workerPayees: [{ id: "payee-1" }],
    workerRates: [HOURLY_RATE_ROW],
  });
  await calculateAndPersistTimeRecord(transaction, makeRecord(), { calculationId: () => "calc-1" });
  assert.equal(context.calculations.length, 1);

  // Directly attempt to insert a duplicate version row through the mock.
  await transaction.query(
    `INSERT INTO labour_cost_calculations (...) VALUES (...) ON CONFLICT (time_record_id, calculation_version) DO NOTHING`,
    ["dup-id", "tr-1", "job-1", "worker-1", "payee-1", "rate-h1", "HOURLY", "25.00", null, "GBP", 480, "RESOLVED", null, "200.00", 1, "2026-08-14T00:00:00.000Z", null, "evidence"],
  );
  assert.equal(context.calculations.length, 1, "duplicate (time_record_id, calculation_version) must be rejected");
});