import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { SqlIntegrationReviewRepository } from "../server/integration-review-repository.ts";
import type {
  IntegrationSqlExecutor,
  IntegrationSqlQueryResult,
  IntegrationSqlRow,
  IntegrationSqlTransaction,
} from "../server/integration-shadow-sql-repository.ts";

function snapshotFixture(): Record<string, unknown> {
  return {
    schema_version: 1,
    event_id: "evt-review-0001",
    event_type: "change_order.approved",
    producer: "jarvis",
    correlation_id: "corr-review-0001",
    occurred_at: "2026-08-03T11:59:00.000Z",
    change_order_id: "co-review-0001",
    revision: 1,
    project_integration_id: "project-review-0001",
    title: "Approved review shadow change",
    scope: "Full supplied scope for human review.",
    approval_status: "approved",
    approved_at: "2026-08-03T11:58:00.000Z",
    approved_by_actor_id: "actor-review-0042",
    currency: "GBP",
    approved_amount_minor: 42000,
    tasks: [{
      task_id: "task-review-0001",
      title: "Review task",
      instructions: "Retain inside the review repository only.",
      quantity: 2,
      unit: "m2",
      approved_amount_minor: 21000,
    }],
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

function acceptedChangeRow(overrides: Partial<ChangeRow> = {}): ChangeRow {
  return {
    id: "change-review-0001",
    event_id: "evt-review-0001",
    change_order_id: "co-review-0001",
    revision: 1,
    project_integration_id: "project-review-0001",
    approved_snapshot: JSON.stringify(snapshotFixture()),
    receipt_id: "receipt-review-0001",
    received_at: "2026-08-03T12:00:00.000Z",
    created_at: "2026-08-03T12:00:00.000Z",
    result: "accepted",
    ...overrides,
  };
}

class InMemoryReviewExecutor implements IntegrationSqlExecutor {
  changes: ChangeRow[] = [];
  reviews: ReviewRow[] = [];
  readonly queries: string[] = [];
  fail = false;

  async query(sql: string, parameters: readonly unknown[]): Promise<IntegrationSqlQueryResult> {
    this.queries.push(sql);
    if (this.fail) throw new Error("offline review executor failure");

    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.includes("insert into integration_shadow_reviews")) {
      const [reviewId, changeOrderId, revision, receiptId, status, reviewedBy, reviewedAt, note] =
        parameters as [
          string,
          string,
          number,
          string,
          string,
          string | null,
          string | null,
          string | null,
        ];
      const existing = this.reviews.find(
        (review) =>
          review.change_order_id === changeOrderId && review.revision === revision,
      );
      if (existing === undefined) {
        this.reviews.push({
          review_id: reviewId,
          change_order_id: changeOrderId,
          revision,
          receipt_id: receiptId,
          review_status: status,
          reviewed_by: reviewedBy,
          reviewed_at: reviewedAt,
          note,
        });
      } else {
        existing.review_status = status;
        existing.reviewed_by = reviewedBy;
        existing.reviewed_at = reviewedAt;
        existing.note = note;
      }
      return { rows: [{ review_id: reviewId }] };
    }

    if (normalized.includes("select c.receipt_id")) {
      const [changeOrderId, revision] = parameters;
      const found = this.changes.find(
        (change) =>
          change.change_order_id === changeOrderId &&
          change.revision === revision &&
          change.result === "accepted",
      );
      return { rows: found === undefined ? [] : [{ receipt_id: found.receipt_id }] };
    }

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

    return { rows: [] };
  }

  private joinRow(change: ChangeRow): IntegrationSqlRow {
    const review = this.reviews.find(
      (candidate) =>
        candidate.change_order_id === change.change_order_id &&
        candidate.revision === change.revision,
    );
    return {
      change_id: change.id,
      event_id: change.event_id,
      change_order_id: change.change_order_id,
      revision: change.revision,
      project_integration_id: change.project_integration_id,
      approved_snapshot: change.approved_snapshot,
      received_at: change.received_at,
      review_id: review?.review_id ?? null,
      review_status: review?.review_status ?? null,
      reviewed_by: review?.reviewed_by ?? null,
      reviewed_at: review?.reviewed_at ?? null,
      note: review?.note ?? null,
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
  executor: InMemoryReviewExecutor,
): SqlIntegrationReviewRepository {
  return new SqlIntegrationReviewRepository({
    executor,
    reviewId: () => "review-fixed-0001",
  });
}

function assertNoOperationalSql(executor: InMemoryReviewExecutor): void {
  assert.ok(executor.queries.length > 0);
  const forbiddenTables =
    /\b(jobs|contractors|work_sessions|job_assignments|task_progress|clients|staff|simple_users|project_cashflow_weekly|admin_inspections)\b/i;
  for (const sql of executor.queries) {
    assert.doesNotMatch(sql, forbiddenTables);
    assert.doesNotMatch(sql, /\b(delete\s+from|truncate|drop\s+table|alter\s+table)\b/i);
    assert.doesNotMatch(
      sql,
      /\b(update|insert|delete)\b[\s\S]*\b(integration_shadow_changes|integration_shadow_receipts)\b/i,
    );
    if (/^\s*insert into/i.test(sql)) {
      assert.match(sql, /^\s*insert into integration_shadow_reviews/i);
    }
  }
}

test("list returns pending for undecided accepted changes and reflects decisions", async () => {
  const executor = new InMemoryReviewExecutor();
  executor.changes.push(
    acceptedChangeRow({ id: "change-a", change_order_id: "co-a", revision: 1, receipt_id: "r-a" }),
    acceptedChangeRow({
      id: "change-b",
      change_order_id: "co-b",
      revision: 1,
      receipt_id: "r-b",
      approved_snapshot: JSON.stringify({
        ...snapshotFixture(),
        event_id: "evt-review-0002",
        change_order_id: "co-b",
      }),
    }),
  );
  const repository = createRepository(executor);

  const before = await repository.listReviewableChanges();
  assert.equal(before.length, 2);
  assert.deepEqual(before.map((change) => change.review_status), ["pending", "pending"]);

  await repository.recordReviewDecision({
    change_order_id: "co-a",
    revision: 1,
    decision: "approved",
    reviewed_by: "admin",
    reviewed_at: "2026-08-03T12:30:00.000Z",
  });

  const after = await repository.listReviewableChanges();
  assert.equal(after.length, 2);
  const decided = after.find((change) => change.change_order_id === "co-a");
  assert.equal(decided?.review_status, "approved");
  assert.equal(decided?.reviewed_by, "admin");
  assert.ok(executor.reviews.length === 1);
  assertNoOperationalSql(executor);
});

test("detail returns full supplied snapshot information", async () => {
  const executor = new InMemoryReviewExecutor();
  executor.changes.push(acceptedChangeRow());
  const repository = createRepository(executor);

  const detail = await repository.getReviewableChange("co-review-0001", 1);
  assert.ok(detail !== undefined);
  assert.equal(detail.change_order_id, "co-review-0001");
  assert.equal(detail.revision, 1);
  assert.equal(detail.project_integration_id, "project-review-0001");
  assert.equal(detail.title, "Approved review shadow change");
  assert.equal(detail.scope, "Full supplied scope for human review.");
  assert.equal(detail.currency, "GBP");
  assert.equal(detail.approved_amount_minor, 42000);
  assert.equal(detail.approved_by_actor_id, "actor-review-0042");
  assert.equal(detail.approved_at, "2026-08-03T11:58:00.000Z");
  assert.equal(detail.occurred_at, "2026-08-03T11:59:00.000Z");
  assert.equal(detail.review_status, "pending");
  assert.equal(detail.tasks.length, 1);
  assert.equal(detail.tasks[0].task_id, "task-review-0001");
  assert.equal(detail.tasks[0].quantity, 2);
  assert.equal(detail.tasks[0].unit, "m2");
  assert.equal(detail.tasks[0].approved_amount_minor, 21000);
  assertNoOperationalSql(executor);
});

test("detail returns undefined for missing or non-accepted changes", async () => {
  const executor = new InMemoryReviewExecutor();
  executor.changes.push(
    acceptedChangeRow(),
    acceptedChangeRow({
      id: "change-rejected",
      event_id: "evt-review-0003",
      change_order_id: "co-review-0003",
      revision: 1,
      receipt_id: "r-rejected",
      result: "rejected",
    }),
  );
  const repository = createRepository(executor);

  assert.equal(await repository.getReviewableChange("co-review-missing", 1), undefined);
  assert.equal(await repository.getReviewableChange("co-review-0003", 1), undefined);
});

test("recordReviewDecision records reviewer, note, timestamp and upserts on re-decision", async () => {
  const executor = new InMemoryReviewExecutor();
  executor.changes.push(acceptedChangeRow());
  const repository = createRepository(executor);

  const first = await repository.recordReviewDecision({
    change_order_id: "co-review-0001",
    revision: 1,
    decision: "rejected",
    reviewed_by: "admin-one",
    note: "Missing measurements.",
    reviewed_at: "2026-08-03T12:30:00.000Z",
  });
  assert.deepEqual(first, { outcome: "recorded" });
  assert.equal(executor.reviews.length, 1);
  assert.deepEqual(executor.reviews[0], {
    review_id: "review-fixed-0001",
    change_order_id: "co-review-0001",
    revision: 1,
    receipt_id: "receipt-review-0001",
    review_status: "rejected",
    reviewed_by: "admin-one",
    reviewed_at: "2026-08-03T12:30:00.000Z",
    note: "Missing measurements.",
  });

  const second = await repository.recordReviewDecision({
    change_order_id: "co-review-0001",
    revision: 1,
    decision: "approved",
    reviewed_by: "admin-two",
    reviewed_at: "2026-08-03T13:00:00.000Z",
  });
  assert.deepEqual(second, { outcome: "recorded" });
  assert.equal(executor.reviews.length, 1);
  assert.equal(executor.reviews[0].review_status, "approved");
  assert.equal(executor.reviews[0].reviewed_by, "admin-two");
  assert.equal(executor.reviews[0].note, null);
  assertNoOperationalSql(executor);
});

test("recordReviewDecision returns change_not_found for missing change", async () => {
  const executor = new InMemoryReviewExecutor();
  executor.changes.push(acceptedChangeRow());
  const repository = createRepository(executor);

  const result = await repository.recordReviewDecision({
    change_order_id: "co-review-missing",
    revision: 1,
    decision: "sent_back",
    reviewed_by: "admin",
    reviewed_at: "2026-08-03T12:30:00.000Z",
  });
  assert.deepEqual(result, { outcome: "change_not_found" });
  assert.equal(executor.reviews.length, 0);
});

test("review repository writes only to integration_shadow_reviews and leaves shadow intake rows untouched", async () => {
  const executor = new InMemoryReviewExecutor();
  const original = acceptedChangeRow();
  executor.changes.push(original);
  const repository = createRepository(executor);

  await repository.listReviewableChanges();
  await repository.getReviewableChange("co-review-0001", 1);
  await repository.recordReviewDecision({
    change_order_id: "co-review-0001",
    revision: 1,
    decision: "approved",
    reviewed_by: "admin",
    reviewed_at: "2026-08-03T12:30:00.000Z",
  });

  assert.deepEqual(executor.changes, [original]);
  assertNoOperationalSql(executor);
});

test("review storage design is additive, non-destructive, and unregistered", async () => {
  const migrationUrl = new URL(
    "../migration-designs/phase1b-step1-review-storage.sql",
    import.meta.url,
  );
  const sql = await readFile(migrationUrl, "utf8");
  const withoutComments = sql.replace(/^\s*--.*$/gm, "");
  const statements = withoutComments.split(";").map((statement) => statement.trim()).filter(Boolean);

  assert.equal(statements.length, 1);
  assert.match(statements[0], /^CREATE TABLE IF NOT EXISTS integration_shadow_reviews\b/i);
  assert.match(
    withoutComments,
    /review_status TEXT NOT NULL CHECK\s*\(review_status IN \('pending',\s*'approved',\s*'rejected',\s*'sent_back'\)\)/i,
  );
  assert.match(withoutComments, /UNIQUE\s*\(change_order_id,\s*revision\)/i);
  assert.match(
    withoutComments,
    /receipt_id UUID NOT NULL UNIQUE[\s\S]*REFERENCES integration_shadow_receipts/i,
  );
  assert.doesNotMatch(withoutComments, /\b(DROP|DELETE|TRUNCATE|ALTER|UPDATE)\b/i);
  assert.doesNotMatch(withoutComments, /CREATE TABLE IF NOT EXISTS integration_shadow_(receipts|changes)/i);
  assert.doesNotMatch(
    withoutComments,
    /\b(jobs|contractors|work_sessions|job_assignments|task_progress|clients)\b/i,
  );
  assert.doesNotMatch(migrationUrl.pathname, /\/migrations\//i);
});
