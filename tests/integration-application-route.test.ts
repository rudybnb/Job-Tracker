import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import {
  createJarvisApplicationRouter,
  JARVIS_APPLICATION_ROUTE,
} from "../server/integration-application-route.ts";
import { requireAdmin } from "../server/integration-review-route.ts";
import type {
  ApplicationReadiness,
  ApplyApplicationInput,
  ApplyApplicationResult,
  CreateApplicationRecordInput,
  CreateApplicationRecordResult,
  CreateProjectMappingInput,
  CreateProjectMappingResult,
  IntegrationChangeOrderApplicationRepository,
} from "../server/integration-change-order-applications.ts";

function readinessFixture(overrides: Partial<ApplicationReadiness> = {}): ApplicationReadiness {
  return {
    change_order_id: "co-route-0001",
    revision: 1,
    project_integration_id: "project-route-0001",
    title: "Approved application shadow change",
    currency: "GBP",
    approved_amount_minor: 42000,
    review_status: "approved",
    review_approved: true,
    status: "pending_mapping",
    ...overrides,
  };
}

class InMemoryApplicationRepository implements IntegrationChangeOrderApplicationRepository {
  readonly readiness = new Map<string, ApplicationReadiness>();
  readonly applicationInputs: CreateApplicationRecordInput[] = [];
  readonly mappingInputs: CreateProjectMappingInput[] = [];
  createApplicationOutcome: CreateApplicationRecordResult["outcome"] = "ready";
  createMappingOutcome: CreateProjectMappingResult["outcome"] = "created";
  applyOutcome: ApplyApplicationResult["outcome"] = "applied";
  fail = false;
  readonly applyInputs: ApplyApplicationInput[] = [];
  readonly sideEffects = {
    jobsCreated: 0,
    operationalTasksCreated: 0,
    assignmentsCreated: 0,
    contractorsChanged: 0,
    notificationsSent: 0,
    paymentsIssued: 0,
  };

  async getReadiness(
    changeOrderId: string,
    revision: number,
  ): Promise<ApplicationReadiness | undefined> {
    if (this.fail) throw new Error("offline application repository failure");
    return this.readiness.get(`${changeOrderId}:${revision}`);
  }

  async createApplicationRecord(
    input: CreateApplicationRecordInput,
  ): Promise<CreateApplicationRecordResult> {
    if (this.fail) throw new Error("offline application repository failure");
    this.applicationInputs.push(input);
    if (this.createApplicationOutcome === "ready") {
      return { outcome: "ready" };
    }
    if (this.createApplicationOutcome === "already_applied") {
      return { outcome: "already_applied" };
    }
    if (this.createApplicationOutcome === "blocked_no_mapping") {
      return { outcome: "blocked_no_mapping" };
    }
    return { outcome: "not_approved" };
  }

  async createProjectMapping(
    input: CreateProjectMappingInput,
  ): Promise<CreateProjectMappingResult> {
    if (this.fail) throw new Error("offline application repository failure");
    this.mappingInputs.push(input);
    if (this.createMappingOutcome === "created") {
      return {
        outcome: "created",
        mapping: {
          project_integration_id: input.project_integration_id,
          job_id: input.job_id,
          mapped_by: input.mapped_by,
          mapped_at: input.mapped_at,
        },
      };
    }
    if (this.createMappingOutcome === "already_exists") {
      return {
        outcome: "already_exists",
        mapping: {
          project_integration_id: input.project_integration_id,
          job_id: "job-existing-0001",
          mapped_by: "admin",
          mapped_at: "2026-08-03T12:31:00.000Z",
        },
      };
    }
    if (this.createMappingOutcome === "job_not_found") {
      return { outcome: "job_not_found" };
    }
    return { outcome: "invalid_input" };
  }

  async applyApplication(input: ApplyApplicationInput): Promise<ApplyApplicationResult> {
    if (this.fail) throw new Error("offline application repository failure");
    this.applyInputs.push(input);
    if (this.applyOutcome === "applied") {
      return {
        outcome: "applied",
        application_id: "application-route-0001",
        applied_to_job_id: "job-existing-0001",
      };
    }
    return { outcome: this.applyOutcome };
  }
}

interface TestRouteContext {
  readonly repository: InMemoryApplicationRepository;
  setSession(session: { role?: string; username?: string } | undefined): void;
  get(path: string): Promise<{ status: number; body: Record<string, unknown> }>;
  post(path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }>;
}

async function withTestRoute(
  run: (context: TestRouteContext) => Promise<void>,
): Promise<void> {
  const repository = new InMemoryApplicationRepository();
  const app = express();
  app.use(express.json());

  let session: { role?: string; username?: string } | undefined = { role: "admin", username: "admin" };
  app.use((request: Request, _response: Response, next: NextFunction) => {
    (request as unknown as { session?: { role?: string; username?: string } }).session = session;
    next();
  });
  app.use(createJarvisApplicationRouter({
    repository,
    now: () => "2026-08-03T12:30:00.000Z",
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

function assertNoSideEffects(repository: InMemoryApplicationRepository): void {
  assert.deepEqual(repository.sideEffects, {
    jobsCreated: 0,
    operationalTasksCreated: 0,
    assignmentsCreated: 0,
    contractorsChanged: 0,
    notificationsSent: 0,
    paymentsIssued: 0,
  });
}

function readinessPath(changeOrderId = "co-route-0001", revision = 1): string {
  return `${JARVIS_APPLICATION_ROUTE}/change-orders/${encodeURIComponent(changeOrderId)}/revisions/${revision}/readiness`;
}

const MAPPINGS_PATH = `${JARVIS_APPLICATION_ROUTE}/mappings`;

function applyPath(changeOrderId = "co-route-0001", revision = 1): string {
  return `${JARVIS_APPLICATION_ROUTE}/change-orders/${encodeURIComponent(changeOrderId)}/revisions/${revision}/apply`;
}

test("requireAdmin rejects missing and non-admin sessions", () => {
  const call = (session: { role?: string; username?: string } | undefined): number => {
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

test("application endpoints reject missing or non-admin sessions", async () => {
  await withTestRoute(async ({ repository, get, post, setSession }) => {
    repository.readiness.set("co-route-0001:1", readinessFixture());

    setSession(undefined);
    assert.equal((await get(readinessPath())).status, 401);
    assert.equal(
      (await post(MAPPINGS_PATH, { project_integration_id: "p", job_id: "j" })).status,
      401,
    );

    setSession({ role: "contractor", username: "bob" });
    assert.equal((await get(readinessPath())).status, 401);
    assert.equal(
      (await post(MAPPINGS_PATH, { project_integration_id: "p", job_id: "j" })).status,
      401,
    );

    assert.equal(repository.mappingInputs.length, 0);
    assert.equal(repository.applicationInputs.length, 0);
    assertNoSideEffects(repository);
  });
});

test("non-admin mapping request is rejected and never reaches the repository", async () => {
  await withTestRoute(async ({ repository, post, setSession }) => {
    setSession({ role: "admin", username: "admin" });
    repository.createMappingOutcome = "job_not_found";

    const mapped = await post(MAPPINGS_PATH, {
      project_integration_id: "project-route-0001",
      job_id: "job-existing-0001",
    });
    assert.equal(mapped.status, 400);
    assert.equal(repository.mappingInputs.length, 1);

    setSession({ role: "contractor", username: "bob" });
    const rejected = await post(MAPPINGS_PATH, {
      project_integration_id: "project-route-0001",
      job_id: "job-existing-0001",
    });
    assert.equal(rejected.status, 401);
    assert.equal(repository.mappingInputs.length, 1);
    assertNoSideEffects(repository);
  });
});

test("admin readiness returns the current mapping/application state", async () => {
  await withTestRoute(async ({ repository, get }) => {
    repository.readiness.set("co-route-0001:1", readinessFixture({ status: "pending_mapping" }));

    const response = await get(readinessPath());

    assert.equal(response.status, 200);
    assert.equal(response.body.change_order_id, "co-route-0001");
    assert.equal(response.body.revision, 1);
    assert.equal(response.body.status, "pending_mapping");
    assert.equal(response.body.review_approved, true);
    assertNoSideEffects(repository);
  });
});

test("readiness invalid revision or missing change is rejected", async () => {
  await withTestRoute(async ({ repository, get }) => {
    repository.readiness.set("co-route-0001:1", readinessFixture());

    assert.equal((await get(readinessPath("co-route-0001", -1))).status, 400);
    assert.equal((await get(readinessPath("co-route-0001", 0))).status, 400);
    assert.equal((await get(readinessPath("co-missing", 1))).status, 404);
    assertNoSideEffects(repository);
  });
});

test("admin mapping request creates a confirmed mapping to an existing job", async () => {
  await withTestRoute(async ({ repository, post }) => {
    repository.createMappingOutcome = "created";

    const response = await post(MAPPINGS_PATH, {
      project_integration_id: "project-route-0001",
      job_id: "job-existing-0001",
    });

    assert.equal(response.status, 201);
    assert.deepEqual(response.body, {
      status: "created",
      mapping: {
        project_integration_id: "project-route-0001",
        job_id: "job-existing-0001",
        mapped_by: "admin",
        mapped_at: "2026-08-03T12:30:00.000Z",
      },
    });
    assert.equal(repository.mappingInputs.length, 1);
    assert.deepEqual(repository.mappingInputs[0], {
      project_integration_id: "project-route-0001",
      job_id: "job-existing-0001",
      mapped_by: "admin",
      mapped_at: "2026-08-03T12:30:00.000Z",
    });
    assertNoSideEffects(repository);
  });
});

test("invalid mapping bodies are rejected with 400", async () => {
  await withTestRoute(async ({ repository, post }) => {
    assert.equal((await post(MAPPINGS_PATH, {})).status, 400);
    assert.equal((await post(MAPPINGS_PATH, { project_integration_id: "p" })).status, 400);
    assert.equal((await post(MAPPINGS_PATH, { job_id: "j" })).status, 400);
    assert.equal(
      (await post(MAPPINGS_PATH, { project_integration_id: "   ", job_id: "j" })).status,
      400,
    );
    assert.equal(
      (await post(MAPPINGS_PATH, { project_integration_id: "p", job_id: "" })).status,
      400,
    );
    assert.equal(repository.mappingInputs.length, 0);
    assertNoSideEffects(repository);
  });
});

test("mapping job_not_found and already_exists map to clear responses", async () => {
  await withTestRoute(async ({ repository, post }) => {
    repository.createMappingOutcome = "job_not_found";
    const notFound = await post(MAPPINGS_PATH, {
      project_integration_id: "project-route-0001",
      job_id: "job-missing-0001",
    });
    assert.equal(notFound.status, 400);
    assert.equal(notFound.body.error, "Job not found");

    repository.createMappingOutcome = "already_exists";
    const exists = await post(MAPPINGS_PATH, {
      project_integration_id: "project-route-0001",
      job_id: "job-existing-0002",
    });
    assert.equal(exists.status, 200);
    assert.equal(exists.body.status, "already_exists");
    assertNoSideEffects(repository);
  });
});

test("apply endpoint rejects missing and non-admin sessions", async () => {
  await withTestRoute(async ({ repository, post, setSession }) => {
    setSession(undefined);
    assert.equal((await post(applyPath(), {})).status, 401);

    setSession({ role: "contractor", username: "bob" });
    assert.equal((await post(applyPath(), {})).status, 401);

    setSession({ role: "admin" });
    assert.equal((await post(applyPath(), {})).status, 401);

    assert.equal(repository.applyInputs.length, 0);
    assertNoSideEffects(repository);
  });
});

test("admin apply returns applied for an approved mapped change", async () => {
  await withTestRoute(async ({ repository, post }) => {
    repository.applyOutcome = "applied";

    const response = await post(applyPath(), {});

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      status: "applied",
      application_id: "application-route-0001",
      applied_to_job_id: "job-existing-0001",
    });
    assert.equal(repository.applyInputs.length, 1);
    assert.deepEqual(repository.applyInputs[0], {
      change_order_id: "co-route-0001",
      revision: 1,
      applied_by: "admin",
      applied_at: "2026-08-03T12:30:00.000Z",
    });
    assertNoSideEffects(repository);
  });
});

test("apply does not accept a job id override from the request body", async () => {
  await withTestRoute(async ({ repository, post }) => {
    const response = await post(applyPath(), { job_id: "job-override-9999" });

    assert.equal(response.status, 200);
    assert.equal(response.body.applied_to_job_id, "job-existing-0001");
    assert.equal(repository.applyInputs.length, 1);
    assert.equal("job_id" in repository.applyInputs[0], false);
    assert.equal((repository.applyInputs[0] as { job_id?: string }).job_id, undefined);
    assertNoSideEffects(repository);
  });
});

test("apply duplicate attempt returns already_applied without job changes", async () => {
  await withTestRoute(async ({ repository, post }) => {
    repository.applyOutcome = "already_applied";

    const response = await post(applyPath(), {});
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "already_applied");
    assert.equal(repository.applyInputs.length, 1);
    assertNoSideEffects(repository);
  });
});

test("apply blocked outcomes map to clear error responses", async () => {
  await withTestRoute(async ({ repository, post }) => {
    const blocked: ApplyApplicationResult["outcome"][] = [
      "not_approved",
      "blocked_no_mapping",
      "job_not_found",
      "invalid_phase_task_data",
    ];
    for (const outcome of blocked) {
      repository.applyOutcome = outcome;
      const response = await post(applyPath(), {});
      assert.equal(response.status, 409, `expected 409 for ${outcome}`);
    }

    repository.applyOutcome = "change_not_found";
    const missing = await post(applyPath(), {});
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, "Change not found");
    assertNoSideEffects(repository);
  });
});

test("apply rejects an invalid revision", async () => {
  await withTestRoute(async ({ repository, post }) => {
    assert.equal((await post(applyPath("co-route-0001", -1), {})).status, 400);
    assert.equal((await post(applyPath("co-route-0001", 0), {})).status, 400);
    assert.equal(repository.applyInputs.length, 0);
    assertNoSideEffects(repository);
  });
});

test("application route imports no operational service or database dependency", async () => {
  const source = await readFile(
    new URL("../server/integration-application-route.ts", import.meta.url),
    "utf8",
  );
  const importedModules = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(importedModules, [
    "express",
    "./integration-change-order-applications.ts",
    "./integration-review-route.ts",
  ]);
  assert.doesNotMatch(
    source,
    /database-storage|\.\/db|integration-shadow-sql-repository|integration-shadow-live|TelegramService|sendgrid|twilio|stripe|notifications/i,
  );
});
