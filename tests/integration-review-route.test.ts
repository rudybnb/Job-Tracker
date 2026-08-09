import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import {
  createJarvisReviewRouter,
  JARVIS_REVIEW_LIST_ROUTE,
  requireAdmin,
  type ReviewRouteSession,
} from "../server/integration-review-route.ts";
import type {
  IntegrationReviewRepository,
  RecordReviewDecisionInput,
  RecordReviewDecisionResult,
  ShadowChangeReviewDetail,
  ShadowChangeReviewSummary,
} from "../server/integration-review-repository.ts";

function summaryFixture(overrides: Partial<ShadowChangeReviewSummary> = {}): ShadowChangeReviewSummary {
  return {
    change_id: "change-route-0001",
    event_id: "evt-route-0001",
    change_order_id: "co-route-0001",
    revision: 1,
    project_integration_id: "project-route-0001",
    title: "Approved route shadow change",
    currency: "GBP",
    approved_amount_minor: 42000,
    received_at: "2026-08-03T12:00:00.000Z",
    review_status: "pending",
    ...overrides,
  };
}

function detailFixture(overrides: Partial<ShadowChangeReviewDetail> = {}): ShadowChangeReviewDetail {
  return {
    ...summaryFixture(),
    scope: "Full supplied scope for review.",
    occurred_at: "2026-08-03T11:59:00.000Z",
    approved_at: "2026-08-03T11:58:00.000Z",
    approved_by_actor_id: "actor-route-0042",
    tasks: [{
      task_id: "task-route-0001",
      title: "Route task",
      instructions: "Do the supplied work.",
      quantity: 2,
      unit: "m2",
      approved_amount_minor: 21000,
    }],
    snapshot: {},
    ...overrides,
  };
}

class InMemoryReviewRepository implements IntegrationReviewRepository {
  readonly changes: ShadowChangeReviewSummary[] = [];
  readonly details = new Map<string, ShadowChangeReviewDetail>();
  readonly decisions: ReadonlyArray<RecordReviewDecisionInput> = [];
  recordOutcome: RecordReviewDecisionResult["outcome"] = "recorded";
  operationCount = 0;
  fail = false;
  readonly sideEffects = {
    jobsCreated: 0,
    operationalTasksCreated: 0,
    assignmentsCreated: 0,
    contractorsChanged: 0,
    notificationsSent: 0,
    paymentsIssued: 0,
  };

  async listReviewableChanges(): Promise<ReadonlyArray<ShadowChangeReviewSummary>> {
    this.operationCount += 1;
    if (this.fail) throw new Error("offline review repository failure");
    return this.changes;
  }

  async getReviewableChange(
    changeOrderId: string,
    revision: number,
  ): Promise<ShadowChangeReviewDetail | undefined> {
    this.operationCount += 1;
    if (this.fail) throw new Error("offline review repository failure");
    return this.details.get(`${changeOrderId}:${revision}`);
  }

  async recordReviewDecision(
    input: RecordReviewDecisionInput,
  ): Promise<RecordReviewDecisionResult> {
    this.operationCount += 1;
    if (this.fail) throw new Error("offline review repository failure");
    if (this.recordOutcome === "recorded") {
      (this.decisions as RecordReviewDecisionInput[]).push(input);
    }
    return { outcome: this.recordOutcome };
  }
}

interface TestRouteContext {
  readonly repository: InMemoryReviewRepository;
  setSession(session: ReviewRouteSession | undefined): void;
  get(path: string): Promise<{ status: number; body: Record<string, unknown> }>;
  post(path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }>;
}

async function withTestRoute(
  run: (context: TestRouteContext) => Promise<void>,
): Promise<void> {
  const repository = new InMemoryReviewRepository();
  const app = express();
  app.use(express.json());

  let session: ReviewRouteSession | undefined = { role: "admin", username: "admin" };
  app.use((request: Request, _response: Response, next: NextFunction) => {
    (request as unknown as { session?: ReviewRouteSession }).session = session;
    next();
  });
  app.use(createJarvisReviewRouter({
    repository,
    now: () => "2026-08-03T12:30:00.000Z",
    reviewId: () => "review-route-0001",
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
      setSession: (nextSession) => {
        session = nextSession;
      },
      get: (path) => send("GET", path),
      post: (path, body) => send("POST", path, body),
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  }
}

function assertNoSideEffects(repository: InMemoryReviewRepository): void {
  assert.deepEqual(repository.sideEffects, {
    jobsCreated: 0,
    operationalTasksCreated: 0,
    assignmentsCreated: 0,
    contractorsChanged: 0,
    notificationsSent: 0,
    paymentsIssued: 0,
  });
}

function detailPath(changeOrderId = "co-route-0001", revision = 1): string {
  return `${JARVIS_REVIEW_LIST_ROUTE}/${encodeURIComponent(changeOrderId)}/revisions/${revision}`;
}

function decisionPath(changeOrderId = "co-route-0001", revision = 1): string {
  return `${detailPath(changeOrderId, revision)}/decision`;
}

test("requireAdmin rejects missing and non-admin sessions", () => {
  const call = (session: ReviewRouteSession | undefined): number => {
    const response = { statusCode: 0, json: (() => undefined) as unknown } as Response;
    let status = 0;
    response.statusCode = 0;
    response.status = (code: number) => {
      status = code;
      return response as never;
    };
    response.json = () => response as never;
    requireAdmin(
      { session } as Request,
      response,
      () => {
        status = 200;
      },
    );
    return status;
  };

  assert.equal(call(undefined), 401);
  assert.equal(call({ role: "contractor", username: "bob" }), 401);
  assert.equal(call({ role: "admin" }), 401);
  assert.equal(call({ role: "admin", username: "" }), 401);
  assert.equal(call({ role: "admin", username: "admin" }), 200);
});

test("review endpoints reject missing or non-admin sessions", async () => {
  await withTestRoute(async ({ repository, get, post, setSession }) => {
    repository.changes.push(summaryFixture());

    setSession(undefined);
    assert.equal((await get(JARVIS_REVIEW_LIST_ROUTE)).status, 401);
    assert.equal((await get(detailPath())).status, 401);
    assert.equal((await post(decisionPath(), { decision: "approved" })).status, 401);

    setSession({ role: "contractor", username: "bob" });
    assert.equal((await get(JARVIS_REVIEW_LIST_ROUTE)).status, 401);
    assert.equal((await get(detailPath())).status, 401);
    assert.equal((await post(decisionPath(), { decision: "approved" })).status, 401);

    assert.equal(repository.decisions.length, 0);
    assertNoSideEffects(repository);
  });
});

test("admin list returns reviewable changes", async () => {
  await withTestRoute(async ({ repository, get }) => {
    repository.changes.push(summaryFixture({ review_status: "pending" }));

    const response = await get(JARVIS_REVIEW_LIST_ROUTE);

    assert.equal(response.status, 200);
    const changes = (response.body.changes as ShadowChangeReviewSummary[]) ?? [];
    assert.equal(changes.length, 1);
    assert.equal(changes[0].change_order_id, "co-route-0001");
    assert.equal(changes[0].review_status, "pending");
    assertNoSideEffects(repository);
  });
});

test("admin detail returns full supplied snapshot information", async () => {
  await withTestRoute(async ({ repository, get }) => {
    repository.details.set("co-route-0001:1", detailFixture());

    const response = await get(detailPath());

    assert.equal(response.status, 200);
    assert.equal(response.body.change_order_id, "co-route-0001");
    assert.equal(response.body.title, "Approved route shadow change");
    assert.equal(response.body.scope, "Full supplied scope for review.");
    assert.equal(response.body.currency, "GBP");
    assert.equal(response.body.approved_amount_minor, 42000);
    assert.equal(response.body.approved_by_actor_id, "actor-route-0042");
    assert.equal(response.body.approved_at, "2026-08-03T11:58:00.000Z");
    const tasks = response.body.tasks as Array<Record<string, unknown>>;
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].quantity, 2);
    assert.equal(tasks[0].unit, "m2");
    assert.equal(tasks[0].approved_amount_minor, 21000);
    assertNoSideEffects(repository);
  });
});

test("detail invalid revision or missing change is rejected", async () => {
  await withTestRoute(async ({ repository, get }) => {
    repository.details.set("co-route-0001:1", detailFixture());

    assert.equal((await get(detailPath("co-route-0001", -1))).status, 400);
    assert.equal((await get(detailPath("co-route-0001", 0))).status, 400);
    assert.equal((await get(`${JARVIS_REVIEW_LIST_ROUTE}/co-missing/revisions/1`)).status, 404);
    assertNoSideEffects(repository);
  });
});

test("admin decision is recorded with reviewer identity only", async () => {
  await withTestRoute(async ({ repository, post }) => {
    repository.details.set("co-route-0001:1", detailFixture());

    const response = await post(decisionPath(), {
      decision: "approved",
      note: "Looks good to proceed.",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      status: "recorded",
      change_order_id: "co-route-0001",
      revision: 1,
      decision: "approved",
    });
    assert.equal(repository.decisions.length, 1);
    assert.deepEqual(repository.decisions[0], {
      change_order_id: "co-route-0001",
      revision: 1,
      decision: "approved",
      reviewed_by: "admin",
      note: "Looks good to proceed.",
      reviewed_at: "2026-08-03T12:30:00.000Z",
      review_id: "review-route-0001",
    });
    assertNoSideEffects(repository);
  });
});

test("reject and send back decisions are accepted", async () => {
  await withTestRoute(async ({ repository, post }) => {
    repository.details.set("co-route-0001:1", detailFixture());

    const reject = await post(decisionPath(), { decision: "rejected" });
    assert.equal(reject.status, 200);
    assert.equal(repository.decisions[0].decision, "rejected");

    const sendBack = await post(decisionPath(), { decision: "sent_back" });
    assert.equal(sendBack.status, 200);
    assert.equal(repository.decisions[1].decision, "sent_back");
    assertNoSideEffects(repository);
  });
});

test("invalid decision body, revision, or missing change are rejected", async () => {
  await withTestRoute(async ({ repository, post }) => {
    repository.details.set("co-route-0001:1", detailFixture());

    assert.equal((await post(decisionPath(), { decision: "bogus" })).status, 400);
    assert.equal((await post(decisionPath(), {})).status, 400);
    assert.equal((await post(decisionPath(), { decision: "approved", note: 42 })).status, 400);
    assert.equal(
      (await post(decisionPath(), { decision: "approved", note: "x".repeat(2001) })).status,
      400,
    );
    assert.equal((await post(decisionPath("co-route-0001", 0), { decision: "approved" })).status, 400);

    repository.recordOutcome = "change_not_found";
    assert.equal((await post(decisionPath(), { decision: "approved" })).status, 404);

    assert.equal(repository.decisions.length, 0);
    assertNoSideEffects(repository);
  });
});

test("repository failure returns 500 on list, detail, and decision", async () => {
  await withTestRoute(async ({ repository, get, post }) => {
    repository.fail = true;

    assert.equal((await get(JARVIS_REVIEW_LIST_ROUTE)).status, 500);
    assert.equal((await get(detailPath())).status, 500);
    assert.equal((await post(decisionPath(), { decision: "approved" })).status, 500);
    assert.equal(repository.decisions.length, 0);
    assertNoSideEffects(repository);
  });
});

test("review route imports no operational service or database dependency", async () => {
  const source = await readFile(
    new URL("../server/integration-review-route.ts", import.meta.url),
    "utf8",
  );
  const importedModules = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(importedModules, [
    "express",
    "./integration-review-repository.ts",
  ]);
  assert.doesNotMatch(
    source,
    /database-storage|\.\/db|integration-shadow-sql-repository|TelegramService|sendgrid|twilio|jobs|assignments|contractors|notifications|payment|stripe/i,
  );
});
