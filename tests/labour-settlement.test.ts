import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LabourSettlementError,
  SqlLabourSettlementRepository,
} from "../server/labour-settlement.ts";
import type { LabourCostExecutor, LabourCostRow, LabourCostTransaction } from "../server/labour-cost-repository.ts";

interface MockSettlementContext {
  calculations: LabourCostRow[];
  cisProfiles: Map<string, LabourCostRow>;
  settlements: LabourCostRow[];
  lines: LabourCostRow[];
  statements: string[];
}

function directCalculation(overrides: LabourCostRow = {}): LabourCostRow {
  return {
    calculation_id: "calc-direct-1",
    time_record_id: "tr-direct-1",
    job_id: "job-1",
    worker_id: "worker-direct-1",
    payee_id: "payee-worker-1",
    calculation_status: "RESOLVED",
    calculated_cost: "200.00",
    currency_code: "GBP",
    verified_payable_minutes: 480,
    rate_type: "HOURLY",
    rate_amount: "25.00",
    standard_day_minutes: null,
    work_date: "2026-08-14",
    worker_type: "DIRECT_SELF_EMPLOYED",
    payee_type: "WORKER",
    payee_worker_id: "worker-direct-1",
    payee_supplier_id: null,
    agency_supplier_id: null,
    supplier_type: null,
    ...overrides,
  };
}

function agencyCalculation(overrides: LabourCostRow = {}): LabourCostRow {
  return {
    calculation_id: "calc-agency-1",
    time_record_id: "tr-agency-1",
    job_id: "job-1",
    worker_id: "worker-agency-1",
    payee_id: "payee-agency-1",
    calculation_status: "RESOLVED",
    calculated_cost: "150.00",
    currency_code: "GBP",
    verified_payable_minutes: 300,
    rate_type: "HOURLY",
    rate_amount: "30.00",
    standard_day_minutes: null,
    work_date: "2026-08-14",
    worker_type: "AGENCY",
    payee_type: "SUPPLIER",
    payee_worker_id: null,
    payee_supplier_id: "supplier-agency-1",
    agency_supplier_id: "supplier-agency-1",
    supplier_type: "AGENCY",
    ...overrides,
  };
}

function createExecutor(seed: Partial<MockSettlementContext> = {}): { executor: LabourCostExecutor; context: MockSettlementContext } {
  const context: MockSettlementContext = {
    calculations: seed.calculations ?? [],
    cisProfiles: seed.cisProfiles ?? new Map(),
    settlements: seed.settlements ?? [],
    lines: seed.lines ?? [],
    statements: [],
  };

  const query = async (sql: string, parameters: readonly unknown[]) => {
    const normalized = sql.trim().replace(/\s+/g, " ");
    context.statements.push(normalized);

    if (/FROM labour_settlement_lines WHERE labour_calculation_id/i.test(normalized)) {
      const ids = parameters[0] as readonly string[];
      return { rows: context.lines.filter((line) => ids.includes(String(line.labour_calculation_id))) };
    }
    if (/FROM labour_cost_calculations lcc JOIN labour_time_records/i.test(normalized)) {
      const ids = parameters[0] as readonly string[];
      return { rows: context.calculations.filter((calculation) => ids.includes(String(calculation.calculation_id))) };
    }
    if (/FROM payee_cis_profile WHERE payee_id/i.test(normalized)) {
      const profile = context.cisProfiles.get(String(parameters[0]));
      return { rows: profile ? [profile] : [] };
    }
    if (/INSERT INTO payee_cis_profile/i.test(normalized)) {
      const row: LabourCostRow = {
        id: parameters[0],
        payee_id: parameters[1],
        cis_status: parameters[2],
        deduction_rate: parameters[3],
        verification_reference: parameters[4],
        verified_by: parameters[5],
        verified_at: parameters[6],
        source_evidence: parameters[7],
        notes: parameters[8],
      };
      context.cisProfiles.set(String(parameters[1]), row);
      return { rows: [row] };
    }
    if (/INSERT INTO labour_settlements/i.test(normalized)) {
      const row: LabourCostRow = {
        id: parameters[0],
        job_id: parameters[1],
        payee_id: parameters[2],
        settlement_kind: parameters[3],
        status: parameters[4],
        gross_amount: parameters[5],
        cis_status: parameters[6],
        cis_deduction_rate: parameters[7],
        cis_deduction_amount: parameters[8],
        net_amount: parameters[9],
        currency_code: parameters[10],
        unresolved_reason: parameters[11],
        source_evidence: parameters[12],
        created_by: parameters[13],
        created_at: parameters[14],
      };
      context.settlements.push(row);
      return { rows: [row] };
    }
    if (/INSERT INTO labour_settlement_lines/i.test(normalized)) {
      const calculationId = String(parameters[2]);
      if (context.lines.some((line) => line.labour_calculation_id === calculationId)) {
        throw new Error("unique violation: labour_settlement_line_calculation_unique");
      }
      const row: LabourCostRow = {
        id: parameters[0],
        settlement_id: parameters[1],
        labour_calculation_id: parameters[2],
        time_record_id: parameters[3],
        job_id: parameters[4],
        worker_id: parameters[5],
        payee_id: parameters[6],
        line_number: parameters[7],
        gross_amount: parameters[8],
        currency_code: parameters[9],
        verified_payable_minutes: parameters[10],
        rate_type: parameters[11],
        rate_amount: parameters[12],
        standard_day_minutes: parameters[13],
        work_date: parameters[14],
        source_evidence: parameters[15],
      };
      context.lines.push(row);
      return { rows: [row] };
    }
    if (/COALESCE\(SUM\(lsl\.gross_amount\)/i.test(normalized)) {
      const settlement = context.settlements.find((candidate) => candidate.id === parameters[0]);
      if (!settlement) return { rows: [] };
      const gross = context.lines
        .filter((line) => line.settlement_id === parameters[0])
        .reduce((sum, line) => sum + Number(line.gross_amount ?? 0), 0)
        .toFixed(2);
      return { rows: [{ ...settlement, gross_amount: gross }] };
    }
    if (/FROM labour_settlements ls/i.test(normalized)) {
      return { rows: context.settlements };
    }
    if (/UPDATE labour_settlements[\s\S]*SET status = \$2/i.test(normalized)) {
      const row = context.settlements.find((settlement) => settlement.id === parameters[0] && settlement.status !== "APPROVED");
      if (!row) return { rows: [] };
      row.status = parameters[1];
      row.gross_amount = parameters[2];
      row.cis_status = parameters[3];
      row.cis_deduction_rate = parameters[4];
      row.cis_deduction_amount = parameters[5];
      row.net_amount = parameters[6];
      row.unresolved_reason = parameters[7];
      row.review_notes = parameters[8];
      row.source_evidence = parameters[9];
      return { rows: [row] };
    }
    if (/UPDATE labour_settlements/i.test(normalized)) {
      const row = context.settlements.find((settlement) => settlement.id === parameters[0] && settlement.status === "REVIEW_REQUIRED");
      if (!row) return { rows: [] };
      if (row.net_amount == null || row.unresolved_reason != null) return { rows: [] };
      row.status = "APPROVED";
      row.approved_by = parameters[1];
      row.approved_at = parameters[2];
      row.review_notes = parameters[3];
      return { rows: [row] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const executor: LabourCostExecutor = {
    query,
    async transaction<T>(work: (transaction: LabourCostTransaction) => Promise<T>): Promise<T> {
      return work({ query });
    },
  };

  return { executor, context };
}

test("direct self-employed settlement references resolved calculation and applies verified CIS deduction", async () => {
  const { executor, context } = createExecutor({
    calculations: [directCalculation()],
    cisProfiles: new Map([["payee-worker-1", { cis_status: "NET_DEDUCTION", deduction_rate: "20.00" }]]),
  });
  const repository = new SqlLabourSettlementRepository(executor, {
    now: () => new Date("2026-08-14T12:00:00.000Z"),
    settlementId: () => "settlement-direct-1",
    lineId: () => "line-direct-1",
  });

  const result = await repository.createSettlement({ calculationIds: ["calc-direct-1"], createdBy: "admin" });

  assert.equal(result.settlement.status, "REVIEW_REQUIRED");
  assert.equal(result.settlement.settlement_kind, "DIRECT_SELF_EMPLOYED");
  assert.equal(result.settlement.payee_id, "payee-worker-1");
  assert.equal(result.settlement.gross_amount, "200.00");
  assert.equal(result.settlement.cis_status, "NET_DEDUCTION");
  assert.equal(result.settlement.cis_deduction_rate, "20.00");
  assert.equal(result.settlement.cis_deduction_amount, "40.00");
  assert.equal(result.settlement.net_amount, "160.00");
  assert.equal(result.lines[0].labour_calculation_id, "calc-direct-1");
  assert.equal(result.lines[0].verified_payable_minutes, 480);
  assert.equal(context.statements.some((sql) => /UPDATE labour_cost_calculations/i.test(sql)), false, "resolved calculations must remain immutable");
});

test("CIS profile review validates statuses and never fabricates deduction rates", async () => {
  const { executor, context } = createExecutor();
  const repository = new SqlLabourSettlementRepository(executor);

  await assert.rejects(
    () => repository.upsertCisProfile({
      payeeId: "payee-worker-1",
      cisStatus: "NET_DEDUCTION",
      deductionRate: null,
      verifiedBy: "admin",
      verifiedAt: "2026-08-14T12:00:00.000Z",
    }),
    (error) => error instanceof LabourSettlementError && error.code === "CIS_RATE_REQUIRED",
  );

  await assert.rejects(
    () => repository.upsertCisProfile({
      payeeId: "payee-worker-1",
      cisStatus: "NOT_APPLICABLE",
      deductionRate: "20.00",
      verifiedBy: "admin",
      verifiedAt: "2026-08-14T12:00:00.000Z",
    }),
    (error) => error instanceof LabourSettlementError && error.code === "CIS_RATE_NOT_ALLOWED",
  );

  const profile = await repository.upsertCisProfile({
    payeeId: "payee-worker-1",
    cisStatus: "NET_DEDUCTION",
    deductionRate: "20.00",
    verificationReference: "manual-check",
    verifiedBy: "admin",
    verifiedAt: "2026-08-14T12:00:00.000Z",
    sourceEvidence: "hmrc portal evidence retained outside app",
    notes: "verified by admin",
  });

  assert.equal(profile.cis_status, "NET_DEDUCTION");
  assert.equal(profile.deduction_rate, "20.00");
  assert.equal(profile.verified_by, "admin");
  assert.equal(context.cisProfiles.get("payee-worker-1")?.cis_status, "NET_DEDUCTION");
});

test("agency settlement keeps agency supplier as payee and worker only as time evidence", async () => {
  const { executor } = createExecutor({
    calculations: [agencyCalculation()],
    cisProfiles: new Map([["payee-agency-1", { cis_status: "NOT_APPLICABLE", deduction_rate: null }]]),
  });
  const repository = new SqlLabourSettlementRepository(executor, {
    settlementId: () => "settlement-agency-1",
    lineId: () => "line-agency-1",
  });

  const result = await repository.createSettlement({ calculationIds: ["calc-agency-1"], createdBy: "admin" });

  assert.equal(result.settlement.settlement_kind, "AGENCY");
  assert.equal(result.settlement.payee_id, "payee-agency-1");
  assert.equal(result.settlement.net_amount, "150.00");
  assert.equal(result.lines[0].worker_id, "worker-agency-1");
  assert.equal(result.lines[0].payee_id, "payee-agency-1", "worker must not become the financial payee");
});

test("unresolved CIS leaves settlement unresolved with no net amount", async () => {
  const { executor } = createExecutor({ calculations: [directCalculation()] });
  const repository = new SqlLabourSettlementRepository(executor, {
    settlementId: () => "settlement-unresolved-1",
    lineId: () => "line-unresolved-1",
  });

  const result = await repository.createSettlement({ calculationIds: ["calc-direct-1"], createdBy: "admin" });

  assert.equal(result.settlement.status, "UNRESOLVED");
  assert.equal(result.settlement.cis_status, "UNRESOLVED");
  assert.equal(result.settlement.cis_deduction_rate, null);
  assert.equal(result.settlement.cis_deduction_amount, null);
  assert.equal(result.settlement.net_amount, null);
  assert.match(String(result.settlement.unresolved_reason), /CIS_UNRESOLVED/);
});

test("refresh recalculates an unresolved settlement after CIS profile correction", async () => {
  const { executor, context } = createExecutor({
    cisProfiles: new Map([["payee-worker-1", { cis_status: "NET_DEDUCTION", deduction_rate: "20.00" }]]),
    settlements: [{ id: "settlement-1", payee_id: "payee-worker-1", status: "UNRESOLVED", currency_code: "GBP" }],
    lines: [{ id: "line-1", settlement_id: "settlement-1", labour_calculation_id: "calc-direct-1", gross_amount: "200.00" }],
  });
  const repository = new SqlLabourSettlementRepository(executor);

  const refreshed = await repository.refreshSettlement({
    settlementId: "settlement-1",
    refreshedBy: "admin",
    refreshedAt: "2026-08-14T13:00:00.000Z",
  });

  assert.equal(refreshed?.status, "REVIEW_REQUIRED");
  assert.equal(refreshed?.gross_amount, "200.00");
  assert.equal(refreshed?.cis_status, "NET_DEDUCTION");
  assert.equal(refreshed?.cis_deduction_amount, "40.00");
  assert.equal(refreshed?.net_amount, "160.00");
  assert.match(String(refreshed?.review_notes), /Refreshed/);
  assert.equal(context.lines.length, 1, "refresh must not create new settlement lines");
});

test("approved settlements are locked against refresh and unresolved settlements cannot be approved", async () => {
  const locked = createExecutor({
    settlements: [{ id: "settlement-approved", payee_id: "payee-worker-1", status: "APPROVED", currency_code: "GBP" }],
    lines: [{ id: "line-1", settlement_id: "settlement-approved", gross_amount: "200.00" }],
  });
  const lockedRepository = new SqlLabourSettlementRepository(locked.executor);
  await assert.rejects(
    () => lockedRepository.refreshSettlement({ settlementId: "settlement-approved", refreshedBy: "admin", refreshedAt: "2026-08-14T13:00:00.000Z" }),
    (error) => error instanceof LabourSettlementError && error.code === "SETTLEMENT_LOCKED",
  );

  const unresolved = createExecutor({
    settlements: [{ id: "settlement-unresolved", status: "UNRESOLVED", net_amount: null, unresolved_reason: "CIS_UNRESOLVED" }],
  });
  const unresolvedRepository = new SqlLabourSettlementRepository(unresolved.executor);
  const approved = await unresolvedRepository.approveSettlement({
    settlementId: "settlement-unresolved",
    approvedBy: "admin",
    approvedAt: "2026-08-14T13:00:00.000Z",
  });
  assert.equal(approved, null);
});

test("duplicate settlement of the same labour calculation is blocked before insert", async () => {
  const { executor, context } = createExecutor({
    calculations: [directCalculation()],
    lines: [{ id: "existing-line", labour_calculation_id: "calc-direct-1" }],
    cisProfiles: new Map([["payee-worker-1", { cis_status: "NET_DEDUCTION", deduction_rate: "20.00" }]]),
  });
  const repository = new SqlLabourSettlementRepository(executor);

  await assert.rejects(
    () => repository.createSettlement({ calculationIds: ["calc-direct-1"], createdBy: "admin" }),
    (error) => error instanceof LabourSettlementError && error.code === "ALREADY_SETTLED",
  );
  assert.equal(context.settlements.length, 0);
});

test("agency worker cannot be settled to a worker payee or subcontractor supplier", async () => {
  const { executor } = createExecutor({
    calculations: [agencyCalculation({ payee_type: "WORKER", payee_worker_id: "worker-agency-1", payee_supplier_id: null, supplier_type: null })],
    cisProfiles: new Map([["payee-agency-1", { cis_status: "NOT_APPLICABLE", deduction_rate: null }]]),
  });
  const repository = new SqlLabourSettlementRepository(executor);

  await assert.rejects(
    () => repository.createSettlement({ calculationIds: ["calc-agency-1"], createdBy: "admin" }),
    (error) => error instanceof LabourSettlementError && error.code === "INVALID_AGENCY_PAYEE",
  );

  const second = createExecutor({
    calculations: [agencyCalculation({ supplier_type: "SUBCONTRACTOR" })],
    cisProfiles: new Map([["payee-agency-1", { cis_status: "NOT_APPLICABLE", deduction_rate: null }]]),
  });
  const secondRepository = new SqlLabourSettlementRepository(second.executor);
  await assert.rejects(
    () => secondRepository.createSettlement({ calculationIds: ["calc-agency-1"], createdBy: "admin" }),
    (error) => error instanceof LabourSettlementError && error.code === "INVALID_AGENCY_PAYEE",
  );
});

test("Phase 3K settlement design is additive and prevents duplicate calculation settlement", () => {
  const sql = readFileSync("migration-designs/phase3k-labour-settlement-cis-foundation.sql", "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS payee_cis_profile/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS labour_settlements/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS labour_settlement_lines/i);
  assert.match(sql, /labour_settlement_line_calculation_unique/i);
  assert.doesNotMatch(sql, /^\s*(DROP|TRUNCATE|DELETE)\b/im);
  assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS\s+(?:payment|bank_transaction|vat_return|hmrc_submission)\b/i);
});
