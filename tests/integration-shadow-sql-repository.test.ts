import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildMachineAuthSigningInput } from "../server/integration-auth.ts";
import { processShadowIntake } from "../server/integration-shadow-intake.ts";
import type {
  ApprovedChangeSnapshot,
  ShadowReceipt,
  StoreAcceptedShadowChange,
} from "../server/integration-shadow-repository.ts";
import {
  SqlIntegrationShadowRepository,
  type IntegrationSqlExecutor,
  type IntegrationSqlQueryResult,
  type IntegrationSqlRow,
  type IntegrationSqlTransaction,
} from "../server/integration-shadow-sql-repository.ts";

const NOW_MS = Date.UTC(2026, 7, 3, 12, 0, 0);
const KEY_ID = "jarvis-sql-test-key";
const SECRET = "offline-sql-test-secret";

interface StoredReceiptRow extends IntegrationSqlRow {
  readonly producer: string;
  readonly receipt_id: string;
  readonly event_id: string;
  readonly correlation_id: string;
  readonly change_order_id: string;
  readonly revision: number;
  readonly project_integration_id: string;
  readonly payload_sha256: string;
  readonly received_at: string;
  readonly result: string;
  readonly rejection_code: string | null;
}

interface StoredChangeRow extends IntegrationSqlRow {
  readonly id: string;
  readonly receipt_id: string;
  readonly event_id: string;
  readonly change_order_id: string;
  readonly revision: number;
  readonly project_integration_id: string;
  readonly approved_snapshot: string;
  readonly payload_sha256: string;
  readonly created_at: string;
}

interface RecordedQuery {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

class InMemorySqlExecutor implements IntegrationSqlExecutor {
  receipts: StoredReceiptRow[] = [];
  changes: StoredChangeRow[] = [];
  readonly queries: RecordedQuery[] = [];
  failChangeInsert = false;
  returnedTimestamp: unknown = undefined;
  transactionCount = 0;

  async query(sql: string, parameters: readonly unknown[]): Promise<IntegrationSqlQueryResult> {
    return this.#execute(sql, parameters, this.receipts, this.changes);
  }

  async transaction<T>(
    work: (transaction: IntegrationSqlTransaction) => Promise<T>,
  ): Promise<T> {
    this.transactionCount += 1;
    const pendingReceipts = this.receipts.map((row) => ({ ...row }));
    const pendingChanges = this.changes.map((row) => ({ ...row }));
    const transaction: IntegrationSqlTransaction = {
      query: (sql, parameters) =>
        this.#execute(sql, parameters, pendingReceipts, pendingChanges),
    };
    const result = await work(transaction);
    this.receipts = pendingReceipts;
    this.changes = pendingChanges;
    return result;
  }

  async #execute(
    sql: string,
    parameters: readonly unknown[],
    receipts: StoredReceiptRow[],
    changes: StoredChangeRow[],
  ): Promise<IntegrationSqlQueryResult> {
    this.queries.push({ sql, parameters });
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.startsWith("select") && normalized.includes("where producer = $1")) {
      const row = receipts.find(
        (receipt) => receipt.producer === parameters[0] && receipt.event_id === parameters[1],
      );
      return { rows: row === undefined ? [] : [this.#receiptForRead(row)] };
    }

    if (normalized.startsWith("select") && normalized.includes("where change_order_id = $1")) {
      const row = receipts.find(
        (receipt) =>
          receipt.change_order_id === parameters[0] && receipt.revision === parameters[1],
      );
      return { rows: row === undefined ? [] : [this.#receiptForRead(row)] };
    }

    if (normalized.startsWith("insert into integration_shadow_receipts")) {
      const eventExists = receipts.some(
        (receipt) => receipt.producer === parameters[1] && receipt.event_id === parameters[2],
      );
      const revisionExists = receipts.some(
        (receipt) =>
          receipt.change_order_id === parameters[4] && receipt.revision === parameters[5],
      );
      if (eventExists || revisionExists) return { rows: [] };

      const row: StoredReceiptRow = {
        receipt_id: String(parameters[0]),
        producer: String(parameters[1]),
        event_id: String(parameters[2]),
        correlation_id: String(parameters[3]),
        change_order_id: String(parameters[4]),
        revision: Number(parameters[5]),
        project_integration_id: String(parameters[6]),
        payload_sha256: String(parameters[7]),
        received_at: String(parameters[8]),
        result: String(parameters[9]),
        rejection_code: parameters[10] === null ? null : String(parameters[10]),
      };
      receipts.push(row);
      return { rows: [{ receipt_id: row.receipt_id }] };
    }

    if (normalized.startsWith("insert into integration_shadow_changes")) {
      if (this.failChangeInsert) throw new Error("simulated snapshot insert failure");
      changes.push({
        id: String(parameters[0]),
        receipt_id: String(parameters[1]),
        event_id: String(parameters[2]),
        change_order_id: String(parameters[3]),
        revision: Number(parameters[4]),
        project_integration_id: String(parameters[5]),
        approved_snapshot: String(parameters[6]),
        payload_sha256: String(parameters[7]),
        created_at: String(parameters[8]),
      });
      return { rows: [] };
    }

    throw new Error(`Unexpected SQL in offline fake: ${normalized}`);
  }

  #receiptForRead(row: StoredReceiptRow): IntegrationSqlRow {
    return this.returnedTimestamp === undefined
      ? row
      : { ...row, received_at: this.returnedTimestamp };
  }
}

const ALLOWED_SHADOW_TABLES = new Set([
  "integration_shadow_receipts",
  "integration_shadow_changes",
]);

function assertShadowOnlySql(sql: string): void {
  const normalized = sql.replace(/\s+/g, " ").trim();
  if (/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE SAVEPOINT)\b/i.test(normalized)) return;

  const references = [...normalized.matchAll(
    /\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+((?:"?[a-z_][a-z0-9_]*"?\.)?"?[a-z_][a-z0-9_]*"?)/gi,
  )].map((match) => match[1].split(".").at(-1)?.replaceAll('"', ""));
  assert.ok(references.length > 0, "SQL must reference an allowlisted shadow table");
  for (const table of references) {
    assert.ok(ALLOWED_SHADOW_TABLES.has(table ?? ""), `Unexpected SQL table reference: ${table}`);
  }
}

function snapshot(overrides: Partial<ApprovedChangeSnapshot> = {}): ApprovedChangeSnapshot {
  return {
    schema_version: 1,
    event_id: "evt-sql-0001",
    event_type: "change_order.approved",
    producer: "jarvis",
    correlation_id: "corr-sql-0001",
    occurred_at: "2026-08-03T11:59:00.000Z",
    change_order_id: "co-sql-0001",
    revision: 1,
    project_integration_id: "project-sql-0001",
    title: "Approved SQL shadow change",
    scope: "Store this approved change in shadow storage only.",
    approval_status: "approved",
    approved_at: "2026-08-03T11:58:00.000Z",
    approved_by_actor_id: "actor-sql-0042",
    currency: "USD",
    approved_amount_minor: 125000,
    tasks: [{
      task_id: "task-sql-0001",
      title: "Approved shadow task",
      instructions: "Retain only inside the immutable snapshot.",
      quantity: 1,
      unit: "each",
      approved_amount_minor: 125000,
    }],
    ...overrides,
  };
}

function acceptedChange(
  snapshotOverrides: Partial<ApprovedChangeSnapshot> = {},
): StoreAcceptedShadowChange {
  const approvedSnapshot = snapshot(snapshotOverrides);
  const payloadSha256 = createHash("sha256")
    .update(JSON.stringify(approvedSnapshot))
    .digest("hex");
  const receipt: ShadowReceipt = {
    receipt_id: approvedSnapshot.event_id.endsWith("0002")
      ? "00000000-0000-4000-8000-000000000002"
      : "00000000-0000-4000-8000-000000000001",
    event_id: approvedSnapshot.event_id,
    correlation_id: approvedSnapshot.correlation_id,
    change_order_id: approvedSnapshot.change_order_id,
    revision: approvedSnapshot.revision,
    project_integration_id: approvedSnapshot.project_integration_id,
    payload_sha256: payloadSha256,
    received_at: new Date(NOW_MS).toISOString(),
    status: "accepted",
  };
  return { producer: approvedSnapshot.producer, receipt, snapshot: approvedSnapshot };
}

function repository(executor: InMemorySqlExecutor): SqlIntegrationShadowRepository {
  return new SqlIntegrationShadowRepository({
    executor,
    changeId: () => "10000000-0000-4000-8000-000000000001",
  });
}

function signedRequest(payload: ApprovedChangeSnapshot) {
  const rawBody = Buffer.from(JSON.stringify(payload), "utf8");
  const timestamp = String(Math.floor(NOW_MS / 1000));
  const nonce = "sql-shadow-nonce-0001";
  const contentHash = createHash("sha256").update(rawBody).digest("hex");
  const signature = createHmac("sha256", SECRET)
    .update(buildMachineAuthSigningInput(KEY_ID, timestamp, nonce, contentHash))
    .digest("hex");
  return {
    rawBody,
    headers: {
      "X-API-Key-Id": KEY_ID,
      "X-Timestamp": timestamp,
      "X-Nonce": nonce,
      "X-Content-SHA256": contentHash,
      "X-Signature": signature,
      "Idempotency-Key": payload.event_id,
    },
  };
}

test("accepted receipt and snapshot are stored atomically", async () => {
  const executor = new InMemorySqlExecutor();
  const change = acceptedChange();

  assert.deepEqual(await repository(executor).storeAcceptedChange(change), { outcome: "stored" });
  assert.equal(executor.receipts.length, 1);
  assert.equal(executor.changes.length, 1);
  assert.equal(executor.changes[0].receipt_id, executor.receipts[0].receipt_id);
  assert.deepEqual(JSON.parse(executor.changes[0].approved_snapshot), change.snapshot);
});

test("PostgreSQL Date timestamps normalize to ISO UTC strings", async () => {
  const executor = new InMemorySqlExecutor();
  const sqlRepository = repository(executor);
  await sqlRepository.storeAcceptedChange(acceptedChange());
  executor.returnedTimestamp = new Date("2026-08-03T13:00:00+01:00");

  const receipt = await sqlRepository.findEventReceipt("jarvis", "evt-sql-0001");

  assert.equal(receipt?.received_at, "2026-08-03T12:00:00.000Z");
});

test("ISO string timestamps normalize to ISO UTC strings", async () => {
  const executor = new InMemorySqlExecutor();
  const sqlRepository = repository(executor);
  await sqlRepository.storeAcceptedChange(acceptedChange());
  executor.returnedTimestamp = "2026-08-03T13:00:00+01:00";

  const receipt = await sqlRepository.findEventReceipt("jarvis", "evt-sql-0001");

  assert.equal(receipt?.received_at, "2026-08-03T12:00:00.000Z");
});

test("invalid returned timestamps become a controlled repository error", async () => {
  const executor = new InMemorySqlExecutor();
  const sqlRepository = repository(executor);
  const approvedSnapshot = snapshot();
  await sqlRepository.storeAcceptedChange(acceptedChange());
  executor.returnedTimestamp = "not-an-iso-timestamp";

  const result = await processShadowIntake({
    ...signedRequest(approvedSnapshot),
    keyLookup: (keyId) => keyId === KEY_ID ? SECRET : undefined,
    nonceLookup: () => false,
    repository: sqlRepository,
    now: () => NOW_MS,
    requestId: () => "20000000-0000-4000-8000-000000000001",
  });

  assert.deepEqual(result, { status: "rejected", rejection_code: "repository_error" });
  assert.equal(executor.receipts.length, 1);
  assert.equal(executor.changes.length, 1);
});

test("invalid approved snapshots are rejected before a transaction starts", async () => {
  for (const invalidSnapshot of [
    { ...snapshot(), approval_status: "proposed" },
    { ...snapshot(), tasks: [] },
    { ...snapshot(), meeting_notes: "Raw notes must not reach storage" },
  ]) {
    const executor = new InMemorySqlExecutor();
    const change = acceptedChange();

    await assert.rejects(
      repository(executor).storeAcceptedChange({
        ...change,
        snapshot: invalidSnapshot as unknown as ApprovedChangeSnapshot,
      }),
      /Invalid approved change snapshot/,
    );
    assert.equal(executor.transactionCount, 0);
    assert.equal(executor.queries.length, 0);
    assert.equal(executor.receipts.length, 0);
    assert.equal(executor.changes.length, 0);
  }
});

test("duplicate event returns the existing receipt", async () => {
  const executor = new InMemorySqlExecutor();
  const sqlRepository = repository(executor);
  const first = acceptedChange();
  await sqlRepository.storeAcceptedChange(first);

  const result = await sqlRepository.storeAcceptedChange(first);

  assert.equal(result.outcome, "event_exists");
  if (result.outcome === "event_exists") {
    assert.deepEqual(result.receipt, first.receipt);
  }
  assert.equal(executor.receipts.length, 1);
  assert.equal(executor.changes.length, 1);
});

test("conflicting event payload is rejected by intake", async () => {
  const executor = new InMemorySqlExecutor();
  const sqlRepository = repository(executor);
  const firstPayload = snapshot();
  const commonOptions = {
    keyLookup: (keyId: string) => keyId === KEY_ID ? SECRET : undefined,
    nonceLookup: () => false,
    repository: sqlRepository,
    now: () => NOW_MS,
    requestId: () => "20000000-0000-4000-8000-000000000001",
  };
  assert.equal((await processShadowIntake({
    ...signedRequest(firstPayload),
    ...commonOptions,
  })).status, "accepted");

  const result = await processShadowIntake({
    ...signedRequest(snapshot({ title: "Conflicting title" })),
    ...commonOptions,
  });

  assert.deepEqual(result, {
    status: "rejected",
    rejection_code: "event_payload_conflict",
  });
  assert.equal(executor.receipts.length, 1);
  assert.equal(executor.changes.length, 1);
});

test("duplicate change-order revision under another event is rejected", async () => {
  const executor = new InMemorySqlExecutor();
  const sqlRepository = repository(executor);
  await sqlRepository.storeAcceptedChange(acceptedChange());

  const result = await sqlRepository.storeAcceptedChange(acceptedChange({
    event_id: "evt-sql-0002",
    correlation_id: "corr-sql-0002",
  }));

  assert.deepEqual(result, { outcome: "revision_exists" });
  assert.equal(executor.receipts.length, 1);
  assert.equal(executor.changes.length, 1);
});

test("transaction failure stores neither receipt nor snapshot", async () => {
  const executor = new InMemorySqlExecutor();
  executor.failChangeInsert = true;

  await assert.rejects(
    repository(executor).storeAcceptedChange(acceptedChange()),
    /simulated snapshot insert failure/,
  );
  assert.equal(executor.receipts.length, 0);
  assert.equal(executor.changes.length, 0);
});

test("repository SQL is parameterized and touches only shadow tables", async () => {
  const executor = new InMemorySqlExecutor();
  const sqlRepository = repository(executor);
  await sqlRepository.findEventReceipt("jarvis", "evt-sql-missing");
  await sqlRepository.findChangeOrderRevision("jarvis", "co-sql-missing", 1);
  await sqlRepository.storeAcceptedChange(acceptedChange());

  for (const query of executor.queries) {
    assert.match(query.sql, /\$\d+/);
    assert.ok(query.parameters.length > 0);
    assertShadowOnlySql(query.sql);
    assert.doesNotMatch(
      query.sql,
      /\b(headers|signature|secret|meeting_notes|transcript|approval_documents)\b/i,
    );
    assert.doesNotMatch(query.sql, /\b(update|delete|truncate|drop|alter)\b/i);
  }
  assert.throws(
    () => assertShadowOnlySql("SELECT * FROM jobs WHERE id = $1"),
    /Unexpected SQL table reference: jobs/,
  );
});

test("migration design is additive, non-destructive, and unregistered", async () => {
  const migrationUrl = new URL(
    "../migration-designs/phase1a-step3-shadow-storage.sql",
    import.meta.url,
  );
  const sql = await readFile(migrationUrl, "utf8");
  const withoutComments = sql.replace(/^\s*--.*$/gm, "");
  const statements = withoutComments.split(";").map((statement) => statement.trim()).filter(Boolean);

  assert.equal(statements.length, 2);
  for (const statement of statements) {
    assert.match(statement, /^CREATE TABLE IF NOT EXISTS\b/i);
  }
  assert.doesNotMatch(withoutComments, /\b(DROP|DELETE|TRUNCATE|ALTER|UPDATE)\b/i);
  assert.doesNotMatch(withoutComments, /ON\s+DELETE\s+CASCADE/i);
  assert.match(withoutComments, /UNIQUE\s*\(producer,\s*event_id\)/i);
  assert.match(withoutComments, /UNIQUE\s*\(change_order_id,\s*revision\)/i);
  assert.match(withoutComments, /receipt_id UUID NOT NULL UNIQUE[\s\S]*REFERENCES integration_shadow_receipts/i);
  assert.match(withoutComments, /approved_snapshot JSONB NOT NULL/i);
  assert.doesNotMatch(
    withoutComments,
    /\b(headers|signature|secret|meeting_notes|transcript|approval_documents)\b/i,
  );
  assert.doesNotMatch(migrationUrl.pathname, /\/migrations\//i);
});
