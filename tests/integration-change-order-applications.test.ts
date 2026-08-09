import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { SqlIntegrationChangeOrderApplicationRepository } from "../server/integration-change-order-applications.ts";
import type {
  IntegrationSqlExecutor,
  IntegrationSqlQueryResult,
  IntegrationSqlRow,
  IntegrationSqlTransaction,
} from "../server/integration-shadow-sql-repository.ts";

function snapshotFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 1,
    event_id: "evt-app-0001",
    event_type: "change_order.approved",
    producer: "jarvis",
    correlation_id: "corr-app-0001",
    occurred_at: "2026-08-03T11:59:00.000Z",
    change_order_id: "co-app-0001",
    revision: 1,
    project_integration_id: "project-app-0001",
    title: "Approved application shadow change",
    scope: "Full supplied scope for review.",
    approval_status: "approved",
    approved_at: "2026-08-03T11:58:00.000Z",
    approved_by_actor_id: "actor-app-0042",
    currency: "GBP",
    approved_amount_minor: 42000,
    tasks: [{
      task_id: "task-app-0001",
      title: "Application task",
      instructions: "Retain inside the application ledger only.",
      quantity: 2,
      unit: "m2",
      approved_amount_minor: 21000,
    }],
    ...overrides,
  };
}

interface ChangeRow {
  readonly id: string;
  readonly event_id: string;
  readonly change_order_id: string;
  readonly revision: number;
  readonly project_integration_id: string;
  readonly approved_snapshot: string;
  readonly receipt_id: string;
  readonly received_at: string;
  readonly created_at: string;
  readonly result: string;
}

interface ReviewRow {
  review_id: string;
  change_order_id: string;
  revision: number;
  receipt_id: string;
  review_status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  note: string | null;
}

interface MappingRow {
  project_integration_id: string;
  job_id: string;
  mapped_by: string;
  mapped_at: string;
}

interface ApplicationRow {
  application_id: string;
  change_order_id: string;
  revision: number;
  receipt_id: string;
  event_id: string;
  project_integration_id: string;
  applied_to_job_id: string | null;
  applied_by: string | null;
  applied_at: string | null;
  title: string;
  approved_amount_minor: number;
  currency: string;
  approved_snapshot_hash: string;
  result: string;
  records_touched: string | null;
}

function acceptedChangeRow(overrides: Partial<ChangeRow> = {}): ChangeRow {
  return {
    id: "change-app-0001",
    event_id: "evt-app-0001",
    change_order_id: "co-app-0001",
    revision: 1,
    project_integration_id: "project-app-0001",
    approved_snapshot: JSON.stringify(snapshotFixture()),
    receipt_id: "receipt-app-0001",
    received_at: "2026-08-03T12:00:00.000Z",
    created_at: "2026-08-03T12:00:00.000Z",
    result: "accepted",
    ...overrides,
  };
}

class InMemoryApplicationExecutor implements IntegrationSqlExecutor {
  changes: ChangeRow[] = [];
  reviews: ReviewRow[] = [];
  mappings: MappingRow[] = [];
  applications: ApplicationRow[] = [];
  readonly queries: string[] = [];
  fail = false;

  async query(sql: string, parameters: readonly unknown[]): Promise<IntegrationSqlQueryResult> {
    this.queries.push(sql);
    if (this.fail) throw new Error("offline application executor failure");

    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.includes("from integration_shadow_changes c")) {
      let rows = this.changes.filter((change) => change.result === "accepted");
      if (normalized.includes("c.change_order_id = $1")) {
        const [changeOrderId, revision] = parameters;
        rows = rows.filter(
          (change) =>
            change.change_order_id === changeOrderId && change.revision === revision,
        );
      }
      return { rows: rows.map((change) => this.joinRow(change)) };
    }

    if (normalized.startsWith("select project_integration_id, job_id")) {
      const [projectIntegrationId] = parameters;
      return {
        rows: this.mappings
          .filter((mapping) => mapping.project_integration_id === projectIntegrationId)
          .map((mapping) => ({ ...mapping })),
      };
    }

    if (normalized.startsWith("insert into integration_project_mapping")) {
      const [projectIntegrationId, jobId, mappedBy, mappedAt] = parameters as [
        string,
        string,
        string,
        string,
      ];
      const existing = this.mappings.find(
        (mapping) => mapping.project_integration_id === projectIntegrationId,
      );
      if (existing !== undefined) return { rows: [] };
      this.mappings.push({
        project_integration_id: projectIntegrationId,
        job_id: jobId,
        mapped_by: mappedBy,
        mapped_at: mappedAt,
      });
      return { rows: [{ project_integration_id: projectIntegrationId }] };
    }

    if (normalized.startsWith("select application_id,")) {
      const [changeOrderId, revision] = parameters;
      return {
        rows: this.applications
          .filter(
            (application) =>
              application.change_order_id === changeOrderId &&
              application.revision === revision,
          )
          .map((application) => ({ ...application })),
      };
    }

    if (normalized.startsWith("insert into integration_change_order_applications")) {
      const [
        applicationId,
        changeOrderId,
        revision,
        receiptId,
        eventId,
        projectIntegrationId,
        appliedToJobId,
        appliedBy,
        appliedAt,
        title,
        approvedAmountMinor,
        currency,
        approvedSnapshotHash,
        result,
        recordsTouched,
      ] = parameters as [
        string,
        string,
        number,
        string,
        string,
        string,
        string | null,
        string | null,
        string | null,
        string,
        number,
        string,
        string,
        string,
        string | null,
      ];
      const existing = this.applications.find(
        (application) =>
          application.change_order_id === changeOrderId && application.revision === revision,
      );
      if (existing !== undefined) return { rows: [] };
      this.applications.push({
        application_id: applicationId,
        change_order_id: changeOrderId,
        revision,
        receipt_id: receiptId,
        event_id: eventId,
        project_integration_id: projectIntegrationId,
        applied_to_job_id: appliedToJobId,
        applied_by: appliedBy,
        applied_at: appliedAt,
        title,
        approved_amount_minor: approvedAmountMinor,
        currency,
        approved_snapshot_hash: approvedSnapshotHash,
        result,
        records_touched: recordsTouched,
      });
      return { rows: [{ application_id: applicationId }] };
    }

    return { rows: [] };
  }

  private joinRow(change: ChangeRow): IntegrationSqlRow {
    const review = this.reviews.find(
      (candidate) =>
        candidate.change_order_id === change.change_order_id &&
        candidate.revision === change.revision,
    );
    return {
      receipt_id: change.receipt_id,
      event_id: change.event_id,
      change_order_id: change.change_order_id,
      revision: change.revision,
      project_integration_id: change.project_integration_id,
      approved_snapshot: change.approved_snapshot,
      received_at: change.received_at,
      review_status: review?.review_status ?? null,
    };
  }

  async transaction<T>(
    work: (transaction: IntegrationSqlTransaction) => Promise<T>,
  ): Promise<T> {
    const adapter: IntegrationSqlTransaction = {
      query: (sql, parameters) => this.query(sql, parameters),
    };
    return work(adapter);
  }
}

function createRepository(
  executor: InMemoryApplicationExecutor,
  jobExists: (jobId: string) => Promise<boolean> = async () => true,
): SqlIntegrationChangeOrderApplicationRepository {
  return new SqlIntegrationChangeOrderApplicationRepository({
    executor,
    jobExists,
    applicationId: () => "application-fixed-0001",
  });
}

function assertNoOperationalWrites(executor: InMemoryApplicationExecutor): void {
  assert.ok(executor.queries.length > 0);
  const forbiddenTables =
    /\b(jobs|contractors|work_sessions|job_assignments|task_progress|clients|staff|simple_users|project_cashflow_weekly|material_purchases|project_master|job_phases|sub_phases|phase_assignments|milestones|expenses|contractor_payments)\b/i;
  for (const sql of executor.queries) {
    assert.doesNotMatch(sql, /\b(delete\s+from|truncate|drop\s+table|alter\s+table)\b/i);
    assert.doesNotMatch(
      sql,
      /\b(update|insert)\b[\s\S]*\b(jobs|contractors|task_progress|job_assignments|work_sessions|project_master|material_purchases)\b/i,
    );
    if (/^\s*insert into/i.test(sql)) {
      assert.match(
        sql,
        /^\s*insert into integration_(project_mapping|change_order_applications)\b/i,
      );
    }
    assert.doesNotMatch(sql, forbiddenTables);
  }
}

test("readiness is pending_mapping for an approved change with no mapping", async () => {
  const executor = new InMemoryApplicationExecutor();
  executor.changes.push(acceptedChangeRow());
  executor.reviews.push({
    review_id: "review-app-0001",
    change_order_id: "co-app-0001",
    revision: 1,
    receipt_id: "receipt-app-0001",
    review_status: "approved",
    reviewed_by: "admin",
    reviewed_at: "2026-08-03T12:30:00.000Z",
    note: null,
  });
  const repository = createRepository(executor);

  const readiness = await repository.getReadiness("co-app-0001", 1);
  assert.ok(readiness !== undefined);
  assert.equal(readiness.status, "pending_mapping");
  assert.equal(readiness.review_approved, true);
  assert.equal(readiness.mapping, undefined);
  assert.equal(readiness.application, undefined);
  assertNoOperationalWrites(executor);
});

test("readiness is not_approved for rejected, sent_back, and pending reviews", async () => {
  for (const reviewStatus of ["rejected", "sent_back", "pending"]) {
    const executor = new InMemoryApplicationExecutor();
    executor.changes.push(acceptedChangeRow());
    executor.reviews.push({
      review_id: "review-app-0001",
      change_order_id: "co-app-0001",
      revision: 1,
      receipt_id: "receipt-app-0001",
      review_status: reviewStatus,
      reviewed_by: "admin",
      reviewed_at: "2026-08-03T12:30:00.000Z",
      note: null,
    });
    const repository = createRepository(executor);

    const readiness = await repository.getReadiness("co-app-0001", 1);
    assert.ok(readiness !== undefined);
    assert.equal(readiness.review_approved, false);
    assert.equal(readiness.status, "not_approved");
    assertNoOperationalWrites(executor);
  }
});

test("readiness is ready for an approved and mapped change", async () => {
  const executor = new InMemoryApplicationExecutor();
  executor.changes.push(acceptedChangeRow());
  executor.reviews.push({
    review_id: "review-app-0001",
    change_order_id: "co-app-0001",
    revision: 1,
    receipt_id: "receipt-app-0001",
    review_status: "approved",
    reviewed_by: "admin",
    reviewed_at: "2026-08-03T12:30:00.000Z",
    note: null,
  });
  executor.mappings.push({
    project_integration_id: "project-app-0001",
    job_id: "job-existing-0001",
    mapped_by: "admin",
    mapped_at: "2026-08-03T12:31:00.000Z",
  });
  const repository = createRepository(executor);

  const readiness = await repository.getReadiness("co-app-0001", 1);
  assert.ok(readiness !== undefined);
  assert.equal(readiness.status, "ready");
  assert.equal(readiness.mapping?.job_id, "job-existing-0001");
  assertNoOperationalWrites(executor);
});

test("readiness returns undefined for a missing change", async () => {
  const executor = new InMemoryApplicationExecutor();
  executor.changes.push(acceptedChangeRow());
  const repository = createRepository(executor);

  assert.equal(await repository.getReadiness("co-app-missing", 1), undefined);
  assertNoOperationalWrites(executor);
});

test("createApplicationRecord requires an approved review", async () => {
  for (const reviewStatus of ["rejected", "sent_back", "pending", null]) {
    const executor = new InMemoryApplicationExecutor();
    executor.changes.push(acceptedChangeRow());
    if (reviewStatus !== null) {
      executor.reviews.push({
        review_id: "review-app-0001",
        change_order_id: "co-app-0001",
        revision: 1,
        receipt_id: "receipt-app-0001",
        review_status: reviewStatus,
        reviewed_by: "admin",
        reviewed_at: "2026-08-03T12:30:00.000Z",
        note: null,
      });
    }
    executor.mappings.push({
      project_integration_id: "project-app-0001",
      job_id: "job-existing-0001",
      mapped_by: "admin",
      mapped_at: "2026-08-03T12:31:00.000Z",
    });
    const repository = createRepository(executor);

    const result = await repository.createApplicationRecord({
      change_order_id: "co-app-0001",
      revision: 1,
      created_by: "admin",
      created_at: "2026-08-03T12:32:00.000Z",
    });
    assert.deepEqual(result, { outcome: "not_approved" });
    assert.equal(executor.applications.length, 0);
    assertNoOperationalWrites(executor);
  }
});

test("createApplicationRecord returns blocked_no_mapping when no mapping exists", async () => {
  const executor = new InMemoryApplicationExecutor();
  executor.changes.push(acceptedChangeRow());
  executor.reviews.push({
    review_id: "review-app-0001",
    change_order_id: "co-app-0001",
    revision: 1,
    receipt_id: "receipt-app-0001",
    review_status: "approved",
    reviewed_by: "admin",
    reviewed_at: "2026-08-03T12:30:00.000Z",
    note: null,
  });
  const repository = createRepository(executor);

  const result = await repository.createApplicationRecord({
    change_order_id: "co-app-0001",
    revision: 1,
    created_by: "admin",
    created_at: "2026-08-03T12:32:00.000Z",
  });
  assert.deepEqual(result, { outcome: "blocked_no_mapping" });
  assert.equal(executor.applications.length, 0);
  assertNoOperationalWrites(executor);
});

test("createApplicationRecord creates a ready record for an approved and mapped change", async () => {
  const executor = new InMemoryApplicationExecutor();
  executor.changes.push(acceptedChangeRow());
  executor.reviews.push({
    review_id: "review-app-0001",
    change_order_id: "co-app-0001",
    revision: 1,
    receipt_id: "receipt-app-0001",
    review_status: "approved",
    reviewed_by: "admin",
    reviewed_at: "2026-08-03T12:30:00.000Z",
    note: null,
  });
  executor.mappings.push({
    project_integration_id: "project-app-0001",
    job_id: "job-existing-0001",
    mapped_by: "admin",
    mapped_at: "2026-08-03T12:31:00.000Z",
  });
  const repository = createRepository(executor);

  const result = await repository.createApplicationRecord({
    change_order_id: "co-app-0001",
    revision: 1,
    created_by: "admin",
    created_at: "2026-08-03T12:32:00.000Z",
  });
  assert.deepEqual(result, { outcome: "ready" });
  assert.equal(executor.applications.length, 1);
  const record = executor.applications[0];
  assert.equal(record.result, "ready");
  assert.equal(record.change_order_id, "co-app-0001");
  assert.equal(record.revision, 1);
  assert.equal(record.project_integration_id, "project-app-0001");
  assert.equal(record.applied_to_job_id, "job-existing-0001");
  assert.equal(record.applied_by, "admin");
  assert.equal(record.applied_at, "2026-08-03T12:32:00.000Z");
  assert.equal(record.approved_amount_minor, 42000);
  assert.equal(record.currency, "GBP");
  assert.match(record.approved_snapshot_hash, /^[0-9a-f]{64}$/);
  assertNoOperationalWrites(executor);
});

test("duplicate change revision cannot apply twice and returns already_applied", async () => {
  const executor = new InMemoryApplicationExecutor();
  executor.changes.push(acceptedChangeRow());
  executor.reviews.push({
    review_id: "review-app-0001",
    change_order_id: "co-app-0001",
    revision: 1,
    receipt_id: "receipt-app-0001",
    review_status: "approved",
    reviewed_by: "admin",
    reviewed_at: "2026-08-03T12:30:00.000Z",
    note: null,
  });
  executor.mappings.push({
    project_integration_id: "project-app-0001",
    job_id: "job-existing-0001",
    mapped_by: "admin",
    mapped_at: "2026-08-03T12:31:00.000Z",
  });
  const repository = createRepository(executor);

  const first = await repository.createApplicationRecord({
    change_order_id: "co-app-0001",
    revision: 1,
    created_by: "admin",
    created_at: "2026-08-03T12:32:00.000Z",
  });
  assert.deepEqual(first, { outcome: "ready" });

  const second = await repository.createApplicationRecord({
    change_order_id: "co-app-0001",
    revision: 1,
    created_by: "admin",
    created_at: "2026-08-03T12:33:00.000Z",
  });
  assert.deepEqual(second, { outcome: "already_applied" });
  assert.equal(executor.applications.length, 1);
  assertNoOperationalWrites(executor);
});

test("createProjectMapping requires an existing job and never auto-creates", async () => {
  const executor = new InMemoryApplicationExecutor();
  const existingJobIds = new Set(["job-existing-0001"]);
  const repository = createRepository(executor, async (jobId) => existingJobIds.has(jobId));

  const missing = await repository.createProjectMapping({
    project_integration_id: "project-app-0001",
    job_id: "job-missing-0001",
    mapped_by: "admin",
    mapped_at: "2026-08-03T12:31:00.000Z",
  });
  assert.deepEqual(missing, { outcome: "job_not_found" });
  assert.equal(executor.mappings.length, 0);

  const invalid = await repository.createProjectMapping({
    project_integration_id: "   ",
    job_id: "job-existing-0001",
    mapped_by: "admin",
    mapped_at: "2026-08-03T12:31:00.000Z",
  });
  assert.deepEqual(invalid, { outcome: "invalid_input" });
  assert.equal(executor.mappings.length, 0);

  const created = await repository.createProjectMapping({
    project_integration_id: "project-app-0001",
    job_id: "job-existing-0001",
    mapped_by: "admin",
    mapped_at: "2026-08-03T12:31:00.000Z",
  });
  assert.deepEqual(created, {
    outcome: "created",
    mapping: {
      project_integration_id: "project-app-0001",
      job_id: "job-existing-0001",
      mapped_by: "admin",
      mapped_at: "2026-08-03T12:31:00.000Z",
    },
  });
  assert.equal(executor.mappings.length, 1);
  assertNoOperationalWrites(executor);
});

test("duplicate project mapping returns already_exists", async () => {
  const executor = new InMemoryApplicationExecutor();
  const repository = createRepository(executor);

  const first = await repository.createProjectMapping({
    project_integration_id: "project-app-0001",
    job_id: "job-existing-0001",
    mapped_by: "admin",
    mapped_at: "2026-08-03T12:31:00.000Z",
  });
  assert.equal(first.outcome, "created");

  const second = await repository.createProjectMapping({
    project_integration_id: "project-app-0001",
    job_id: "job-existing-0002",
    mapped_by: "admin-two",
    mapped_at: "2026-08-03T12:35:00.000Z",
  });
  assert.equal(second.outcome, "already_exists");
  assert.equal(second.mapping.job_id, "job-existing-0001");
  assert.equal(executor.mappings.length, 1);
  assertNoOperationalWrites(executor);
});

test("createApplicationRecord returns change_not_found for missing change", async () => {
  const executor = new InMemoryApplicationExecutor();
  executor.changes.push(acceptedChangeRow());
  const repository = createRepository(executor);

  const result = await repository.createApplicationRecord({
    change_order_id: "co-app-missing",
    revision: 1,
    created_by: "admin",
    created_at: "2026-08-03T12:32:00.000Z",
  });
  assert.deepEqual(result, { outcome: "change_not_found" });
  assert.equal(executor.applications.length, 0);
  assertNoOperationalWrites(executor);
});

test("application repository leaves operational and shadow intake rows untouched", async () => {
  const executor = new InMemoryApplicationExecutor();
  const originalChange = acceptedChangeRow();
  executor.changes.push(originalChange);
  executor.reviews.push({
    review_id: "review-app-0001",
    change_order_id: "co-app-0001",
    revision: 1,
    receipt_id: "receipt-app-0001",
    review_status: "approved",
    reviewed_by: "admin",
    reviewed_at: "2026-08-03T12:30:00.000Z",
    note: null,
  });
  executor.mappings.push({
    project_integration_id: "project-app-0001",
    job_id: "job-existing-0001",
    mapped_by: "admin",
    mapped_at: "2026-08-03T12:31:00.000Z",
  });
  const repository = createRepository(executor);

  await repository.getReadiness("co-app-0001", 1);
  await repository.createApplicationRecord({
    change_order_id: "co-app-0001",
    revision: 1,
    created_by: "admin",
    created_at: "2026-08-03T12:32:00.000Z",
  });
  await repository.createProjectMapping({
    project_integration_id: "project-app-0002",
    job_id: "job-existing-0001",
    mapped_by: "admin",
    mapped_at: "2026-08-03T12:33:00.000Z",
  });

  assert.deepEqual(executor.changes, [originalChange]);
  assert.equal(executor.reviews.length, 1);
  assertNoOperationalWrites(executor);
});

test("application storage design is additive, non-destructive, and unregistered", async () => {
  const migrationUrl = new URL(
    "../migration-designs/phase1b-step2-application-storage.sql",
    import.meta.url,
  );
  const sql = await readFile(migrationUrl, "utf8");
  const withoutComments = sql.replace(/^\s*--.*$/gm, "");
  const statements = withoutComments.split(";").map((statement) => statement.trim()).filter(Boolean);

  assert.equal(statements.length, 2);
  assert.match(statements[0], /^CREATE TABLE IF NOT EXISTS integration_project_mapping\b/i);
  assert.match(statements[1], /^CREATE TABLE IF NOT EXISTS integration_change_order_applications\b/i);
  assert.match(withoutComments, /UNIQUE\s*\(project_integration_id\)/i);
  assert.match(withoutComments, /UNIQUE\s*\(change_order_id,\s*revision\)/i);
  assert.match(
    withoutComments,
    /result TEXT NOT NULL CHECK\s*\(result IN \('pending_mapping',\s*'ready',\s*'applied',\s*'blocked_no_mapping',\s*'already_applied',\s*'not_approved'\)\)/i,
  );
  assert.match(withoutComments, /REFERENCES jobs\(id\)/i);
  assert.doesNotMatch(withoutComments, /\b(DROP|DELETE|TRUNCATE|ALTER|UPDATE)\b/i);
  assert.doesNotMatch(withoutComments, /CREATE TABLE IF NOT EXISTS integration_shadow_(receipts|changes|reviews)/i);
  assert.doesNotMatch(migrationUrl.pathname, /\/migrations\//i);
});
