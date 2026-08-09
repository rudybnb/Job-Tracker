import { randomUUID } from "node:crypto";
import { validateApprovedChangeOrder } from "./integration-contracts.ts";
import type { ApprovedChangeSnapshot } from "./integration-shadow-repository.ts";
import type {
  IntegrationSqlExecutor,
  IntegrationSqlQueryResult,
  IntegrationSqlRow,
} from "./integration-shadow-sql-repository.ts";

export type ReviewStatus = "pending" | "approved" | "rejected" | "sent_back";
export type ReviewDecision = "approved" | "rejected" | "sent_back";

export interface ShadowReviewTask {
  readonly task_id: string;
  readonly title: string;
  readonly instructions: string;
  readonly quantity: number;
  readonly unit: string;
  readonly approved_amount_minor: number;
}

export interface ShadowChangeReviewSummary {
  readonly change_id: string;
  readonly event_id: string;
  readonly change_order_id: string;
  readonly revision: number;
  readonly project_integration_id: string;
  readonly title: string;
  readonly currency: string;
  readonly approved_amount_minor: number;
  readonly received_at: string;
  readonly review_status: ReviewStatus;
  readonly reviewed_by?: string;
  readonly reviewed_at?: string;
  readonly note?: string;
}

export interface ShadowChangeReviewDetail extends ShadowChangeReviewSummary {
  readonly scope: string;
  readonly occurred_at: string;
  readonly approved_at: string;
  readonly approved_by_actor_id: string;
  readonly tasks: readonly ShadowReviewTask[];
  readonly snapshot: ApprovedChangeSnapshot;
}

export interface RecordReviewDecisionInput {
  readonly change_order_id: string;
  readonly revision: number;
  readonly decision: ReviewDecision;
  readonly reviewed_by: string;
  readonly note?: string;
  readonly reviewed_at: string;
  readonly review_id?: string;
}

export type RecordReviewDecisionResult =
  | { readonly outcome: "recorded" }
  | { readonly outcome: "change_not_found" };

export interface IntegrationReviewRepository {
  listReviewableChanges(): Promise<ReadonlyArray<ShadowChangeReviewSummary>>;
  getReviewableChange(
    changeOrderId: string,
    revision: number,
  ): Promise<ShadowChangeReviewDetail | undefined>;
  recordReviewDecision(input: RecordReviewDecisionInput): Promise<RecordReviewDecisionResult>;
}

const REVIEW_COLUMNS = `
  c.id AS change_id,
  c.event_id,
  c.change_order_id,
  c.revision,
  c.project_integration_id,
  c.approved_snapshot,
  rc.received_at,
  r.review_id,
  r.review_status,
  r.reviewed_by,
  r.reviewed_at,
  r.note
`;

const FROM_CHANGE_JOIN = `
  FROM integration_shadow_changes c
  INNER JOIN integration_shadow_receipts rc ON rc.receipt_id = c.receipt_id
  LEFT JOIN integration_shadow_reviews r
    ON r.change_order_id = c.change_order_id AND r.revision = c.revision
`;

const LIST_REVIEWABLE_SQL = `
  SELECT ${REVIEW_COLUMNS}
  ${FROM_CHANGE_JOIN}
  WHERE rc.result = 'accepted'
  ORDER BY c.created_at DESC
`;

const FIND_REVIEWABLE_CHANGE_SQL = `
  SELECT ${REVIEW_COLUMNS}
  ${FROM_CHANGE_JOIN}
  WHERE rc.result = 'accepted' AND c.change_order_id = $1 AND c.revision = $2
`;

const FIND_CHANGE_RECEIPT_SQL = `
  SELECT c.receipt_id
  FROM integration_shadow_changes c
  INNER JOIN integration_shadow_receipts rc ON rc.receipt_id = c.receipt_id
  WHERE c.change_order_id = $1 AND c.revision = $2 AND rc.result = 'accepted'
`;

const UPSERT_REVIEW_SQL = `
  INSERT INTO integration_shadow_reviews (
    review_id,
    change_order_id,
    revision,
    receipt_id,
    review_status,
    reviewed_by,
    reviewed_at,
    note
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  ON CONFLICT (change_order_id, revision) DO UPDATE SET
    review_status = EXCLUDED.review_status,
    reviewed_by = EXCLUDED.reviewed_by,
    reviewed_at = EXCLUDED.reviewed_at,
    note = EXCLUDED.note
  RETURNING review_id
`;

function requiredString(row: IntegrationSqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid integration review column: ${column}`);
  }
  return value;
}

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const POSTGRES_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::\d{2})?)?$/;

function parseTimestampString(value: string): Date | undefined {
  if (ISO_TIMESTAMP_PATTERN.test(value)) {
    return new Date(value);
  }
  if (POSTGRES_TIMESTAMP_PATTERN.test(value)) {
    const normalized = value.replace(/([+-]\d{2})$/, "$1:00");
    return new Date(normalized);
  }
  return undefined;
}

function toIsoTimestamp(value: unknown): string {
  let timestamp: Date | undefined;
  if (value instanceof Date) {
    timestamp = value;
  } else if (typeof value === "string") {
    timestamp = parseTimestampString(value);
  } else {
    throw new Error("Invalid integration review timestamp");
  }
  if (timestamp === undefined || Number.isNaN(timestamp.getTime())) {
    throw new Error("Invalid integration review timestamp");
  }
  return timestamp.toISOString();
}

function optionalTimestamp(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return toIsoTimestamp(value);
}

function optionalText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value;
}

function requiredRevision(row: IntegrationSqlRow): number {
  const value = row.revision;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error("Invalid integration review revision");
  }
  return value;
}

function reviewStatusOf(value: unknown): ReviewStatus {
  if (value === "approved" || value === "rejected" || value === "sent_back") return value;
  return "pending";
}

function parseSnapshot(value: unknown): ApprovedChangeSnapshot | undefined {
  let candidate: unknown = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return undefined;
    }
  }
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return undefined;
  }
  const validation = validateApprovedChangeOrder(candidate);
  if (!validation.success) return undefined;
  return validation.data as ApprovedChangeSnapshot;
}

function mapReviewFields(
  row: IntegrationSqlRow,
): {
  review_status: ReviewStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  note?: string;
} {
  const result: {
    review_status: ReviewStatus;
    reviewed_by?: string;
    reviewed_at?: string;
    note?: string;
  } = { review_status: reviewStatusOf(row.review_status) };
  const reviewedBy = optionalText(row.reviewed_by);
  if (reviewedBy !== undefined) {
    result.reviewed_by = reviewedBy;
  }
  const reviewedAt = optionalTimestamp(row.reviewed_at);
  if (reviewedAt !== undefined) {
    result.reviewed_at = reviewedAt;
  }
  const note = optionalText(row.note);
  if (note !== undefined) {
    result.note = note;
  }
  return result;
}

function mapSummary(row: IntegrationSqlRow, snapshot: ApprovedChangeSnapshot): ShadowChangeReviewSummary {
  const base = {
    change_id: requiredString(row, "change_id"),
    event_id: requiredString(row, "event_id"),
    change_order_id: requiredString(row, "change_order_id"),
    revision: requiredRevision(row),
    project_integration_id: requiredString(row, "project_integration_id"),
    title: snapshot.title,
    currency: snapshot.currency,
    approved_amount_minor: snapshot.approved_amount_minor,
    received_at: toIsoTimestamp(row.received_at),
  };
  return { ...base, ...mapReviewFields(row) };
}

function mapDetail(row: IntegrationSqlRow, snapshot: ApprovedChangeSnapshot): ShadowChangeReviewDetail {
  return {
    ...mapSummary(row, snapshot),
    scope: snapshot.scope,
    occurred_at: snapshot.occurred_at,
    approved_at: snapshot.approved_at,
    approved_by_actor_id: snapshot.approved_by_actor_id,
    tasks: snapshot.tasks,
    snapshot,
  };
}

function firstReviewRow(
  result: IntegrationSqlQueryResult,
): { row: IntegrationSqlRow; snapshot: ApprovedChangeSnapshot } | undefined {
  const row = result.rows[0];
  if (row === undefined) return undefined;
  const snapshot = parseSnapshot(row.approved_snapshot);
  if (snapshot === undefined) return undefined;
  return { row, snapshot };
}

export interface SqlReviewRepositoryOptions {
  readonly executor: IntegrationSqlExecutor;
  readonly reviewId?: () => string;
}

/**
 * Admin review repository for accepted Jarvis shadow changes.
 * Reads ONLY from integration_shadow_changes / integration_shadow_receipts (SELECT)
 * and writes ONLY to integration_shadow_reviews. Never touches operational tables.
 */
export class SqlIntegrationReviewRepository implements IntegrationReviewRepository {
  readonly #executor: IntegrationSqlExecutor;
  readonly #reviewId: () => string;

  constructor(options: SqlReviewRepositoryOptions) {
    this.#executor = options.executor;
    this.#reviewId = options.reviewId ?? randomUUID;
  }

  async listReviewableChanges(): Promise<ReadonlyArray<ShadowChangeReviewSummary>> {
    const result = await this.#executor.query(LIST_REVIEWABLE_SQL, []);
    const summaries: ShadowChangeReviewSummary[] = [];
    for (const row of result.rows) {
      const snapshot = parseSnapshot(row.approved_snapshot);
      if (snapshot === undefined) continue;
      summaries.push(mapSummary(row, snapshot));
    }
    return summaries;
  }

  async getReviewableChange(
    changeOrderId: string,
    revision: number,
  ): Promise<ShadowChangeReviewDetail | undefined> {
    const result = await this.#executor.query(FIND_REVIEWABLE_CHANGE_SQL, [changeOrderId, revision]);
    const found = firstReviewRow(result);
    if (found === undefined) return undefined;
    return mapDetail(found.row, found.snapshot);
  }

  async recordReviewDecision(input: RecordReviewDecisionInput): Promise<RecordReviewDecisionResult> {
    return this.#executor.transaction(async (transaction) => {
      const found = await transaction.query(FIND_CHANGE_RECEIPT_SQL, [
        input.change_order_id,
        input.revision,
      ]);
      const row = found.rows[0];
      if (row === undefined) return { outcome: "change_not_found" as const };

      const receiptId = requiredString(row, "receipt_id");
      await transaction.query(UPSERT_REVIEW_SQL, [
        input.review_id ?? this.#reviewId(),
        input.change_order_id,
        input.revision,
        receiptId,
        input.decision,
        input.reviewed_by,
        input.reviewed_at,
        input.note ?? null,
      ]);
      return { outcome: "recorded" as const };
    });
  }
}
