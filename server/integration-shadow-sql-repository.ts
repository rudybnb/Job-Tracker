import { createHash, randomUUID } from "node:crypto";
import { validateApprovedChangeOrder } from "./integration-contracts.ts";
import type {
  IntegrationShadowRepository,
  ShadowReceipt,
  ShadowRejectionCode,
  ShadowReceiptStatus,
  StoreAcceptedShadowChange,
  StoreAcceptedShadowChangeResult,
} from "./integration-shadow-repository.ts";

export interface IntegrationSqlRow {
  readonly [column: string]: unknown;
}

export interface IntegrationSqlQueryResult {
  readonly rows: readonly IntegrationSqlRow[];
}

export interface IntegrationSqlTransaction {
  query(sql: string, parameters: readonly unknown[]): Promise<IntegrationSqlQueryResult>;
}

export interface IntegrationSqlExecutor extends IntegrationSqlTransaction {
  transaction<T>(work: (transaction: IntegrationSqlTransaction) => Promise<T>): Promise<T>;
}

export interface SqlShadowRepositoryOptions {
  readonly executor: IntegrationSqlExecutor;
  readonly changeId?: () => string;
}

const RECEIPT_COLUMNS = `
  receipt_id,
  event_id,
  correlation_id,
  change_order_id,
  revision,
  project_integration_id,
  payload_sha256,
  received_at,
  result,
  rejection_code
`;

const FIND_EVENT_RECEIPT_SQL = `
  SELECT ${RECEIPT_COLUMNS}
  FROM integration_shadow_receipts
  WHERE producer = $1 AND event_id = $2
`;

const FIND_REVISION_RECEIPT_SQL = `
  SELECT ${RECEIPT_COLUMNS}
  FROM integration_shadow_receipts
  WHERE change_order_id = $1 AND revision = $2
`;

const INSERT_RECEIPT_SQL = `
  INSERT INTO integration_shadow_receipts (
    receipt_id,
    producer,
    event_id,
    correlation_id,
    change_order_id,
    revision,
    project_integration_id,
    payload_sha256,
    received_at,
    result,
    rejection_code
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  ON CONFLICT DO NOTHING
  RETURNING receipt_id
`;

const INSERT_CHANGE_SQL = `
  INSERT INTO integration_shadow_changes (
    id,
    receipt_id,
    event_id,
    change_order_id,
    revision,
    project_integration_id,
    approved_snapshot,
    payload_sha256,
    created_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
`;

function requiredString(row: IntegrationSqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid integration shadow receipt column: ${column}`);
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

function requiredTimestamp(row: IntegrationSqlRow, column: string): string {
  const value = row[column];
  let timestamp: Date | undefined;
  if (value instanceof Date) {
    timestamp = value;
  } else if (typeof value === "string") {
    timestamp = parseTimestampString(value);
  } else {
    throw new Error(`Invalid integration shadow receipt timestamp: ${column}`);
  }

  if (timestamp === undefined || Number.isNaN(timestamp.getTime())) {
    throw new Error(`Invalid integration shadow receipt timestamp: ${column}`);
  }
  return timestamp.toISOString();
}

function receiptStatus(row: IntegrationSqlRow): ShadowReceiptStatus {
  const value = row.result;
  if (value !== "accepted" && value !== "duplicate" && value !== "rejected") {
    throw new Error("Invalid integration shadow receipt result");
  }
  return value;
}

function rejectionCode(value: unknown): ShadowRejectionCode | undefined {
  if (value === null || value === undefined) return undefined;
  if (
    value === "authentication_failed" ||
    value === "invalid_json" ||
    value === "invalid_contract" ||
    value === "invalid_idempotency_key" ||
    value === "event_payload_conflict" ||
    value === "change_order_revision_conflict" ||
    value === "repository_error"
  ) {
    return value;
  }
  throw new Error("Invalid integration shadow receipt rejection code");
}

function mapReceipt(row: IntegrationSqlRow): ShadowReceipt {
  const revision = row.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision <= 0) {
    throw new Error("Invalid integration shadow receipt revision");
  }

  const mappedRejectionCode = rejectionCode(row.rejection_code);

  return {
    receipt_id: requiredString(row, "receipt_id"),
    event_id: requiredString(row, "event_id"),
    correlation_id: requiredString(row, "correlation_id"),
    change_order_id: requiredString(row, "change_order_id"),
    revision,
    project_integration_id: requiredString(row, "project_integration_id"),
    payload_sha256: requiredString(row, "payload_sha256"),
    received_at: requiredTimestamp(row, "received_at"),
    status: receiptStatus(row),
    ...(mappedRejectionCode === undefined ? {} : { rejection_code: mappedRejectionCode }),
  };
}

function firstReceipt(result: IntegrationSqlQueryResult): ShadowReceipt | undefined {
  const row = result.rows[0];
  return row === undefined ? undefined : mapReceipt(row);
}

function serializeConsistentChange(change: StoreAcceptedShadowChange): string {
  const validation = validateApprovedChangeOrder(change.snapshot);
  if (!validation.success) {
    throw new Error("Invalid approved change snapshot");
  }

  const { receipt } = change;
  const snapshot = validation.data;
  if (
    receipt.status !== "accepted" ||
    receipt.rejection_code !== undefined ||
    snapshot.producer !== change.producer ||
    snapshot.event_id !== receipt.event_id ||
    snapshot.correlation_id !== receipt.correlation_id ||
    snapshot.change_order_id !== receipt.change_order_id ||
    snapshot.revision !== receipt.revision ||
    snapshot.project_integration_id !== receipt.project_integration_id
  ) {
    throw new Error("Inconsistent accepted shadow change");
  }

  const serializedSnapshot = JSON.stringify(snapshot);
  const snapshotHash = createHash("sha256").update(serializedSnapshot).digest("hex");
  if (snapshotHash !== receipt.payload_sha256) {
    throw new Error("Approved snapshot does not match its payload hash");
  }
  return serializedSnapshot;
}

export class SqlIntegrationShadowRepository implements IntegrationShadowRepository {
  readonly #executor: IntegrationSqlExecutor;
  readonly #changeId: () => string;

  constructor(options: SqlShadowRepositoryOptions) {
    this.#executor = options.executor;
    this.#changeId = options.changeId ?? randomUUID;
  }

  async findEventReceipt(producer: string, eventId: string): Promise<ShadowReceipt | undefined> {
    return firstReceipt(await this.#executor.query(FIND_EVENT_RECEIPT_SQL, [producer, eventId]));
  }

  async findChangeOrderRevision(
    _producer: string,
    changeOrderId: string,
    revision: number,
  ): Promise<ShadowReceipt | undefined> {
    return firstReceipt(
      await this.#executor.query(FIND_REVISION_RECEIPT_SQL, [changeOrderId, revision]),
    );
  }

  async storeAcceptedChange(
    change: StoreAcceptedShadowChange,
  ): Promise<StoreAcceptedShadowChangeResult> {
    const serializedSnapshot = serializeConsistentChange(change);

    return this.#executor.transaction(async (transaction) => {
      const { receipt } = change;
      const insertedReceipt = await transaction.query(INSERT_RECEIPT_SQL, [
        receipt.receipt_id,
        change.producer,
        receipt.event_id,
        receipt.correlation_id,
        receipt.change_order_id,
        receipt.revision,
        receipt.project_integration_id,
        receipt.payload_sha256,
        receipt.received_at,
        receipt.status,
        receipt.rejection_code ?? null,
      ]);

      if (insertedReceipt.rows.length === 0) {
        const existingEvent = firstReceipt(
          await transaction.query(FIND_EVENT_RECEIPT_SQL, [
            change.producer,
            receipt.event_id,
          ]),
        );
        if (existingEvent !== undefined) {
          return { outcome: "event_exists", receipt: existingEvent };
        }

        const existingRevision = firstReceipt(
          await transaction.query(FIND_REVISION_RECEIPT_SQL, [
            receipt.change_order_id,
            receipt.revision,
          ]),
        );
        if (existingRevision !== undefined) return { outcome: "revision_exists" };
        throw new Error("Shadow receipt insert conflicted without an existing receipt");
      }

      await transaction.query(INSERT_CHANGE_SQL, [
        this.#changeId(),
        receipt.receipt_id,
        receipt.event_id,
        receipt.change_order_id,
        receipt.revision,
        receipt.project_integration_id,
        serializedSnapshot,
        receipt.payload_sha256,
        receipt.received_at,
      ]);
      return { outcome: "stored" };
    });
  }
}
