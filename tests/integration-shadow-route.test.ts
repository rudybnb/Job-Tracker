import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import express from "express";
import { buildMachineAuthSigningInput } from "../server/integration-auth.ts";
import {
  createJarvisShadowIntegrationRouter,
  JARVIS_SHADOW_CHANGE_ORDER_ROUTE,
} from "../server/integration-shadow-route.ts";
import type {
  IntegrationShadowRepository,
  ShadowReceipt,
  StoreAcceptedShadowChange,
  StoreAcceptedShadowChangeResult,
} from "../server/integration-shadow-repository.ts";

const NOW_MS = Date.UTC(2026, 7, 3, 12, 0, 0);
const KEY_ID = "jarvis-route-test-key";
const SECRET = "offline-route-test-secret";
const ROUTE_URL = `http://127.0.0.1:0${JARVIS_SHADOW_CHANGE_ORDER_ROUTE}`;

function validPayload(): Record<string, unknown> {
  return {
    schema_version: 1,
    event_id: "evt-route-0001",
    event_type: "change_order.approved",
    producer: "jarvis",
    correlation_id: "corr-route-0001",
    occurred_at: "2026-08-03T11:59:00.000Z",
    change_order_id: "co-route-0001",
    revision: 1,
    project_integration_id: "project-route-0001",
    title: "Approved route shadow change",
    scope: "Store this approved change through the local-only route.",
    approval_status: "approved",
    approved_at: "2026-08-03T11:58:00.000Z",
    approved_by_actor_id: "actor-route-0042",
    currency: "GBP",
    approved_amount_minor: 42000,
    tasks: [{
      task_id: "task-route-0001",
      title: "Approved route task",
      instructions: "Retain only inside the shadow route test repository.",
      quantity: 1,
      unit: "each",
      approved_amount_minor: 42000,
    }],
  };
}

function signedRequest(payload: unknown, nonce: string, signatureOverride?: string) {
  const rawBody = Buffer.from(JSON.stringify(payload), "utf8");
  const timestamp = String(Math.floor(NOW_MS / 1000));
  const contentSha256 = createHash("sha256").update(rawBody).digest("hex");
  const signature = createHmac("sha256", SECRET)
    .update(buildMachineAuthSigningInput(KEY_ID, timestamp, nonce, contentSha256))
    .digest("hex");

  return {
    body: rawBody,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key-Id": KEY_ID,
      "X-Timestamp": timestamp,
      "X-Nonce": nonce,
      "X-Content-SHA256": contentSha256,
      "X-Signature": signatureOverride ?? signature,
      "Idempotency-Key": (payload as { event_id?: string }).event_id ?? "missing-event",
    },
  };
}

class InMemoryShadowRepository implements IntegrationShadowRepository {
  readonly changes: StoreAcceptedShadowChange[] = [];
  readonly sideEffects = {
    jobsCreated: 0,
    operationalTasksCreated: 0,
    assignmentsCreated: 0,
    contractorsChanged: 0,
    notificationsSent: 0,
    databaseConnections: 0,
  };
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

interface TestRouteContext {
  readonly repository: InMemoryShadowRepository;
  readonly usedNonces: Set<string>;
  post(payload: unknown, nonce: string, signatureOverride?: string): Promise<{
    status: number;
    body: Record<string, unknown>;
  }>;
}

async function withTestRoute(
  enabled: boolean,
  run: (context: TestRouteContext) => Promise<void>,
): Promise<void> {
  const repository = new InMemoryShadowRepository();
  const usedNonces = new Set<string>();
  const app = express();

  app.use(createJarvisShadowIntegrationRouter({
    enabled,
    repository,
    keyLookup: (keyId) => keyId === KEY_ID ? SECRET : undefined,
    nonceLookup: (keyId, nonce) => usedNonces.has(`${keyId}:${nonce}`),
    nonceStore: (keyId, nonce) => {
      usedNonces.add(`${keyId}:${nonce}`);
    },
    now: () => NOW_MS,
    requestId: () => "receipt-route-0001",
  }));

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    assert.ok(address !== null);
    const url = ROUTE_URL.replace(":0", `:${(address as AddressInfo).port}`);

    await run({
      repository,
      usedNonces,
      async post(payload, nonce, signatureOverride) {
        const request = signedRequest(payload, nonce, signatureOverride);
        const response = await fetch(url, {
          method: "POST",
          headers: request.headers,
          body: request.body,
        });
        const text = await response.text();
        return {
          status: response.status,
          body: response.headers.get("content-type")?.includes("application/json") === true
            ? JSON.parse(text)
            : {},
        };
      },
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error));
    });
  }
}

function assertSanitizedResponse(body: Record<string, unknown>): void {
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, new RegExp(SECRET));
  assert.doesNotMatch(serialized, /X-Signature|X-API-Key-Id|X-Nonce|offline-route-test-secret/i);
  assert.doesNotMatch(serialized, /Raw private meeting note|contractor_password/i);
}

function assertNoSideEffects(repository: InMemoryShadowRepository): void {
  assert.deepEqual(repository.sideEffects, {
    jobsCreated: 0,
    operationalTasksCreated: 0,
    assignmentsCreated: 0,
    contractorsChanged: 0,
    notificationsSent: 0,
    databaseConnections: 0,
  });
}

test("disabled route is unavailable", async () => {
  await withTestRoute(false, async ({ post, repository }) => {
    const response = await post(validPayload(), "route-nonce-disabled-01");

    assert.equal(response.status, 404);
    assert.deepEqual(response.body, {});
    assert.equal(repository.operationCount, 0);
    assert.equal(repository.changes.length, 0);
    assertNoSideEffects(repository);
  });
});

test("valid signed approved change is accepted", async () => {
  await withTestRoute(true, async ({ post, repository }) => {
    const response = await post(validPayload(), "route-nonce-accepted-01");

    assert.equal(response.status, 202);
    assert.equal(response.body.status, "accepted");
    assert.deepEqual((response.body.receipt as Record<string, unknown>).event_id, "evt-route-0001");
    assert.equal(repository.changes.length, 1);
    assert.deepEqual(repository.changes[0].snapshot, validPayload());
    assertSanitizedResponse(response.body);
    assertNoSideEffects(repository);
  });
});

test("exact approved-change retry returns duplicate", async () => {
  await withTestRoute(true, async ({ post, repository }) => {
    assert.equal((await post(validPayload(), "route-nonce-retry-01")).status, 202);

    const response = await post(validPayload(), "route-nonce-retry-02");

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "duplicate");
    assert.equal(repository.changes.length, 1);
    assertSanitizedResponse(response.body);
    assertNoSideEffects(repository);
  });
});

test("altered payload with the same event ID returns 409", async () => {
  await withTestRoute(true, async ({ post, repository }) => {
    assert.equal((await post(validPayload(), "route-nonce-conflict-01")).status, 202);

    const response = await post(
      { ...validPayload(), title: "Altered approved title" },
      "route-nonce-conflict-02",
    );

    assert.equal(response.status, 409);
    assert.deepEqual(response.body, {
      status: "rejected",
      rejection_code: "event_payload_conflict",
    });
    assert.equal(repository.changes.length, 1);
    assertSanitizedResponse(response.body);
    assertNoSideEffects(repository);
  });
});

test("invalid signature returns 401 and stores nothing", async () => {
  await withTestRoute(true, async ({ post, repository, usedNonces }) => {
    const response = await post(validPayload(), "route-nonce-badsig-01", "0".repeat(64));

    assert.equal(response.status, 401);
    assert.deepEqual(response.body, {
      status: "rejected",
      rejection_code: "authentication_failed",
    });
    assert.equal(repository.operationCount, 0);
    assert.equal(repository.changes.length, 0);
    assert.equal(usedNonces.size, 0);
    assertSanitizedResponse(response.body);
    assertNoSideEffects(repository);
  });
});

test("draft and proposed changes are rejected and store nothing", async () => {
  await withTestRoute(true, async ({ post, repository }) => {
    for (const approval_status of ["draft", "proposed"]) {
      const response = await post(
        { ...validPayload(), approval_status },
        `route-nonce-${approval_status}-01`,
      );

      assert.equal(response.status, 422);
      assert.deepEqual(response.body, {
        status: "rejected",
        rejection_code: "invalid_contract",
      });
    }
    assert.equal(repository.operationCount, 0);
    assert.equal(repository.changes.length, 0);
    assertNoSideEffects(repository);
  });
});

test("raw meeting-note payload is rejected", async () => {
  await withTestRoute(true, async ({ post, repository }) => {
    const response = await post(
      { ...validPayload(), meeting_notes: "Raw private meeting note" },
      "route-nonce-raw-note-01",
    );

    assert.equal(response.status, 422);
    assert.deepEqual(response.body, {
      status: "rejected",
      rejection_code: "invalid_contract",
    });
    assert.equal(repository.operationCount, 0);
    assert.equal(repository.changes.length, 0);
    assertSanitizedResponse(response.body);
    assertNoSideEffects(repository);
  });
});

test("replayed nonce is rejected", async () => {
  await withTestRoute(true, async ({ post, repository }) => {
    assert.equal((await post(validPayload(), "route-nonce-replay-01")).status, 202);

    const replayPayload = {
      ...validPayload(),
      event_id: "evt-route-0002",
      correlation_id: "corr-route-0002",
      change_order_id: "co-route-0002",
    };
    const response = await post(replayPayload, "route-nonce-replay-01");

    assert.equal(response.status, 401);
    assert.deepEqual(response.body, {
      status: "rejected",
      rejection_code: "authentication_failed",
    });
    assert.equal(repository.changes.length, 1);
    assertSanitizedResponse(response.body);
    assertNoSideEffects(repository);
  });
});

test("repository failure is controlled", async () => {
  await withTestRoute(true, async ({ post, repository }) => {
    repository.fail = true;

    const response = await post(validPayload(), "route-nonce-repo-fail-01");

    assert.equal(response.status, 500);
    assert.deepEqual(response.body, {
      status: "rejected",
      rejection_code: "repository_error",
    });
    assert.equal(repository.changes.length, 0);
    assertSanitizedResponse(response.body);
    assertNoSideEffects(repository);
  });
});

test("route imports no operational service or database dependency", async () => {
  const source = await readFile(
    new URL("../server/integration-shadow-route.ts", import.meta.url),
    "utf8",
  );
  const importedModules = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(importedModules, [
    "express",
    "./integration-shadow-intake.ts",
    "./integration-auth.ts",
    "./integration-shadow-repository.ts",
  ]);
  assert.doesNotMatch(
    source,
    /database-storage|\.\/db|integration-shadow-sql-repository|TelegramService|sendgrid|twilio|jobs|assignments|contractors|notifications/i,
  );
});
