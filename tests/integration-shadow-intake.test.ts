import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildMachineAuthSigningInput } from "../server/integration-auth.ts";
import { processShadowIntake } from "../server/integration-shadow-intake.ts";
import type {
  IntegrationShadowRepository,
  ShadowReceipt,
  StoreAcceptedShadowChange,
  StoreAcceptedShadowChangeResult,
} from "../server/integration-shadow-repository.ts";

const NOW_MS = Date.UTC(2026, 7, 3, 12, 0, 0);
const KEY_ID = "jarvis-shadow-test-key";
const SECRET = "offline-shadow-test-secret";

function validPayload(): Record<string, unknown> {
  return {
    schema_version: 1,
    event_id: "evt-shadow-0001",
    event_type: "change_order.approved",
    producer: "jarvis",
    correlation_id: "corr-shadow-0001",
    occurred_at: "2026-08-03T11:59:00.000Z",
    change_order_id: "co-shadow-0001",
    revision: 1,
    project_integration_id: "project-shadow-0001",
    title: "Approved west wall blocking",
    scope: "Supply and install approved blocking.",
    approval_status: "approved",
    approved_at: "2026-08-03T11:58:00.000Z",
    approved_by_actor_id: "actor-shadow-0042",
    currency: "USD",
    approved_amount_minor: 125000,
    tasks: [{
      task_id: "task-shadow-0001",
      title: "Install blocking",
      instructions: "Install per approved detail A-4.",
      quantity: 12,
      unit: "linear_ft",
      approved_amount_minor: 125000,
    }],
  };
}

function signedRequest(payload: unknown, signatureOverride?: string) {
  const rawBody = Buffer.from(
    typeof payload === "string" ? payload : JSON.stringify(payload),
    "utf8",
  );
  const timestamp = String(Math.floor(NOW_MS / 1000));
  const nonce = "shadow-nonce-00000001";
  const contentHash = createHash("sha256").update(rawBody).digest("hex");
  const signature = createHmac("sha256", SECRET)
    .update(buildMachineAuthSigningInput(KEY_ID, timestamp, nonce, contentHash))
    .digest("hex");
  const eventId = typeof payload === "object" && payload !== null
    ? String((payload as Record<string, unknown>).event_id ?? "missing-event")
    : "missing-event";

  return {
    rawBody,
    headers: {
      "X-API-Key-Id": KEY_ID,
      "X-Timestamp": timestamp,
      "X-Nonce": nonce,
      "X-Content-SHA256": contentHash,
      "X-Signature": signatureOverride ?? signature,
      "Idempotency-Key": eventId,
    },
  };
}

class InMemoryShadowRepository implements IntegrationShadowRepository {
  readonly changes: StoreAcceptedShadowChange[] = [];
  operationCount = 0;
  fail = false;

  async findEventReceipt(producer: string, eventId: string): Promise<ShadowReceipt | undefined> {
    this.operationCount += 1;
    if (this.fail) throw new Error("offline fake repository failure");
    return this.changes.find(
      (change) => change.producer === producer && change.receipt.event_id === eventId,
    )?.receipt;
  }

  async findChangeOrderRevision(
    producer: string,
    changeOrderId: string,
    revision: number,
  ): Promise<ShadowReceipt | undefined> {
    this.operationCount += 1;
    if (this.fail) throw new Error("offline fake repository failure");
    return this.changes.find((change) =>
      change.producer === producer &&
      change.receipt.change_order_id === changeOrderId &&
      change.receipt.revision === revision
    )?.receipt;
  }

  async storeAcceptedChange(
    change: StoreAcceptedShadowChange,
  ): Promise<StoreAcceptedShadowChangeResult> {
    this.operationCount += 1;
    if (this.fail) throw new Error("offline fake repository failure");

    const eventReceipt = await this.findEventReceipt(
      change.producer,
      change.receipt.event_id,
    );
    if (eventReceipt !== undefined) return { outcome: "event_exists", receipt: eventReceipt };

    const revisionReceipt = await this.findChangeOrderRevision(
      change.producer,
      change.receipt.change_order_id,
      change.receipt.revision,
    );
    if (revisionReceipt !== undefined) return { outcome: "revision_exists" };

    this.changes.push(change);
    return { outcome: "stored" };
  }
}

async function intake(
  repository: InMemoryShadowRepository,
  request: ReturnType<typeof signedRequest>,
) {
  return processShadowIntake({
    ...request,
    keyLookup: (keyId) => keyId === KEY_ID ? SECRET : undefined,
    nonceLookup: () => false,
    repository,
    now: () => NOW_MS,
    requestId: () => "receipt-shadow-0001",
  });
}

test("valid authenticated approved change is accepted once", async () => {
  const repository = new InMemoryShadowRepository();
  const payload = validPayload();
  const result = await intake(repository, signedRequest(payload));

  assert.equal(result.status, "accepted");
  assert.equal(repository.changes.length, 1);
  assert.deepEqual(repository.changes[0].snapshot, payload);
  assert.equal(repository.changes[0].receipt.status, "accepted");
  assert.match(repository.changes[0].receipt.payload_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(repository.changes[0].receipt).sort(), [
    "change_order_id",
    "correlation_id",
    "event_id",
    "payload_sha256",
    "project_integration_id",
    "receipt_id",
    "received_at",
    "revision",
    "status",
  ]);
  assert.equal(Object.isFrozen(repository.changes[0].snapshot), true);
  assert.equal(Object.isFrozen(repository.changes[0].snapshot.tasks), true);
});

test("exact retry returns duplicate without storing another record", async () => {
  const repository = new InMemoryShadowRepository();
  const request = signedRequest(validPayload());

  assert.equal((await intake(repository, request)).status, "accepted");
  const retry = await intake(repository, request);

  assert.equal(retry.status, "duplicate");
  assert.equal(repository.changes.length, 1);
  assert.equal(repository.changes[0].snapshot.tasks.length, 1);
});

test("changed payload under the same event ID returns conflict", async () => {
  const repository = new InMemoryShadowRepository();
  await intake(repository, signedRequest(validPayload()));

  const changed = { ...validPayload(), title: "Changed approved title" };
  const result = await intake(repository, signedRequest(changed));

  assert.deepEqual(result, {
    status: "rejected",
    rejection_code: "event_payload_conflict",
  });
  assert.equal(repository.changes.length, 1);
});

test("duplicate change-order revision under another event is rejected", async () => {
  const repository = new InMemoryShadowRepository();
  await intake(repository, signedRequest(validPayload()));

  const secondEvent = {
    ...validPayload(),
    event_id: "evt-shadow-0002",
    correlation_id: "corr-shadow-0002",
  };
  const result = await intake(repository, signedRequest(secondEvent));

  assert.deepEqual(result, {
    status: "rejected",
    rejection_code: "change_order_revision_conflict",
  });
  assert.equal(repository.changes.length, 1);
});

test("invalid authentication stores no receipt", async () => {
  const repository = new InMemoryShadowRepository();
  const result = await intake(repository, signedRequest(validPayload(), "0".repeat(64)));

  assert.deepEqual(result, {
    status: "rejected",
    rejection_code: "authentication_failed",
  });
  assert.equal(repository.operationCount, 0);
  assert.equal(repository.changes.length, 0);
});

test("invalid JSON stores no approved-change record", async () => {
  const repository = new InMemoryShadowRepository();
  const result = await intake(repository, signedRequest('{"event_id":'));

  assert.deepEqual(result, { status: "rejected", rejection_code: "invalid_json" });
  assert.equal(repository.operationCount, 0);
  assert.equal(repository.changes.length, 0);
});

test("unapproved payload stores no approved-change record", async () => {
  const repository = new InMemoryShadowRepository();
  const payload = { ...validPayload(), approval_status: "proposed" };
  const result = await intake(repository, signedRequest(payload));

  assert.deepEqual(result, { status: "rejected", rejection_code: "invalid_contract" });
  assert.equal(repository.operationCount, 0);
  assert.equal(repository.changes.length, 0);
});

test("unknown meeting-note and transcript fields are rejected", async () => {
  for (const field of ["meeting_notes", "transcript"]) {
    const repository = new InMemoryShadowRepository();
    const payload = { ...validPayload(), [field]: "Raw discussion must not be stored" };
    const result = await intake(repository, signedRequest(payload));

    assert.deepEqual(result, { status: "rejected", rejection_code: "invalid_contract" });
    assert.equal(repository.operationCount, 0);
    assert.equal(repository.changes.length, 0);
  }
});

test("repository failure returns a controlled error", async () => {
  const repository = new InMemoryShadowRepository();
  repository.fail = true;

  const result = await intake(repository, signedRequest(validPayload()));

  assert.deepEqual(result, { status: "rejected", rejection_code: "repository_error" });
  assert.equal(repository.changes.length, 0);
});

test("intake has no operational service dependency", async () => {
  const source = await readFile(
    new URL("../server/integration-shadow-intake.ts", import.meta.url),
    "utf8",
  );
  const importedModules = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(importedModules, [
    "node:crypto",
    "./integration-auth.ts",
    "./integration-contracts.ts",
    "./integration-shadow-repository.ts",
  ]);
});
