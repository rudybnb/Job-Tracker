import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import express from "express";
import {
  JARVIS_JOBS_ROUTE,
  JARVIS_SCHEDULE_ROUTE,
  JARVIS_WEEKLY_BUYING_DASHBOARD_ROUTE,
  SqlJarvisReadRepository,
  createJarvisReadApiRouter,
} from "../server/jarvis-read-api.ts";
import { buildMachineAuthSigningInput } from "../server/integration-auth.ts";
import type {
  IntegrationSqlExecutor,
  IntegrationSqlQueryResult,
  IntegrationSqlRow,
  IntegrationSqlTransaction,
} from "../server/integration-shadow-sql-repository.ts";
import { parseHbxlWordQuote } from "../shared/hbxl-word-parser.ts";
import { parseMaterialsUsedCsv } from "../shared/procurement-pricing.ts";
import type {
  ProcurementAssignment,
  ProcurementLocation,
  ProcurementLocationTask,
  ProcurementStructuredResource,
} from "../shared/weekly-procurement.ts";

const KEY_ID = "jarvis-read";
const SECRET = "secret-read";
const NOW = Date.parse("2026-10-06T12:00:00.000Z");

interface MaterialRow {
  id: string;
  job_id: string;
  source_import_id: string;
  build_phase: string;
  description: string;
  unit_rate: string;
  unit: string;
  qty_excluding_wastage: string;
  wastage_qty: string;
  order_qty_including_wastage: string;
  cost_excluding_wastage: string;
  wastage_cost: string;
  total_cost_including_wastage: string;
  source_row_order: number;
  material_row_kind: string;
}

interface ImportRow {
  id: string;
  job_id: string;
  source_stream_key: string;
  is_current_revision: boolean;
  status: string;
}

interface JobRow {
  id: string;
  client_id: string | null;
  client_name: string | null;
  title: string;
  status: string;
  address: string | null;
  postcode: string | null;
  location: string | null;
  quoted_amount: string | null;
  phase_task_data: string | null;
}

interface LocationRow {
  id: string;
  job_id: string;
  name: string;
}

interface TaskRow {
  id: string;
  job_id: string;
  location_id: string;
  work_category: string;
  task_name: string;
  task_description: string | null;
  source_reference: string | null;
}

interface ResourceRow {
  id: string;
  location_task_id: string;
  usage_description: string;
  product_description: string;
  quantity: string | null;
  unit: string | null;
  source_value_raw: string | null;
  source_value_kind: string;
  source_order: number;
}

interface AssignmentRow {
  id: string;
  job_id: string | null;
  location_id: string | null;
  location_name: string | null;
  location_task_id: string | null;
  task_name: string | null;
  work_category: string | null;
  start_date: string;
  end_date: string;
  status: string | null;
  contractor_name: string | null;
  job_title: string | null;
  client_name: string | null;
}

interface ActualRow {
  id: string;
  job_id: string;
  material_key: string | null;
  material_description: string;
  supplier_name: string | null;
  supplier_unit_price: string;
  actual_quantity: string;
  actual_total: string;
  purchase_date: string | null;
  payment_status: string;
  notes: string | null;
}

interface ConfirmationRow {
  location_task_id: string;
  material_key: string;
  material_description: string | null;
  confirmed_quantity: string;
  unit: string | null;
}

class InMemoryReadExecutor implements IntegrationSqlExecutor {
  jobs: JobRow[] = [];
  locations: LocationRow[] = [];
  tasks: TaskRow[] = [];
  resources: ResourceRow[] = [];
  materialRows: MaterialRow[] = [];
  imports: ImportRow[] = [];
  assignments: AssignmentRow[] = [];
  actuals: ActualRow[] = [];
  confirmations: ConfirmationRow[] = [];
  transactionCalls = 0;
  nonSelectCalls = 0;

  async query(sql: string, parameters: readonly unknown[]): Promise<IntegrationSqlQueryResult> {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (/^\s*(insert|update|delete|create|alter|drop|truncate)\b/.test(normalized)) {
      this.nonSelectCalls++;
      throw new Error("Read-only Jarvis API attempted a write: " + sql);
    }

    // Jobs list (optional ILIKE search) — joins clients
    if (
      normalized.includes("from jobs j") &&
      normalized.includes("left join clients") &&
      normalized.includes("order by j.title") &&
      normalized.includes("j.id") &&
      normalized.includes("j.status") &&
      !normalized.includes("where j.id = $1") &&
      !normalized.includes("any($1::text[])")
    ) {
      const keyword = normalized.includes("ilike") ? String(parameters[0]).replace(/%/g, "") : null;
      let rows = this.jobs;
      if (keyword) {
        rows = rows.filter(
          (r) =>
            r.title.toLowerCase().includes(keyword.toLowerCase()) ||
            (r.client_name ?? "").toLowerCase().includes(keyword.toLowerCase()),
        );
      }
      return { rows: rows.map(toJobListRow) };
    }

    // Single job detail — joins clients with WHERE j.id = $1 (also used by scheduling? no)
    if (
      normalized.includes("from jobs j") &&
      normalized.includes("left join clients c") &&
      normalized.includes("where j.id = $1")
    ) {
      const job = this.jobs.find((r) => r.id === parameters[0]);
      return { rows: job ? [toJobDetailRow(job)] : [] };
    }

    // Exists check for a job
    if (normalized.includes("select id from jobs where id = $1")) {
      const job = this.jobs.find((r) => r.id === parameters[0]);
      return { rows: job ? [{ id: job.id }] : [] };
    }

    // Active jobs (dashboard) — note the enum column is cast to text
    if (normalized.includes("where j.status::text = any($1::text[])")) {
      const statuses = parameters[0] as string[];
      return {
        rows: this.jobs
          .filter((r) => statuses.includes(r.status))
          .map((r) => ({ id: r.id, title: r.title, client_name: r.client_name, status: r.status })),
      };
    }

    // Counts
    if (normalized.includes("count(*)") && normalized.includes("job_locations where job_id = $1")) {
      const n = this.locations.filter((l) => l.job_id === parameters[0]).length;
      return { rows: [{ n }] };
    }
    if (normalized.includes("count(*)") && normalized.includes("job_location_tasks where job_id = $1")) {
      const n = this.tasks.filter((t) => t.job_id === parameters[0]).length;
      return { rows: [{ n }] };
    }
    if (normalized.includes("count(*)") && normalized.includes("job_assignments where job_id = $1")) {
      const n = this.assignments.filter((a) => a.job_id === parameters[0]).length;
      return { rows: [{ n }] };
    }

    // Material cost rows (current revision)
    if (
      normalized.includes("from job_material_cost_resources mr") &&
      normalized.includes("project_source_import psi")
    ) {
      const jobId = parameters[0];
      const streamKey = parameters[1];
      const relevantImport = this.imports.filter(
        (i) => i.job_id === jobId && i.source_stream_key === streamKey && i.is_current_revision && i.status === "IMPORTED",
      );
      const importIds = new Set(relevantImport.map((i) => i.id));
      const rows = this.materialRows
        .filter((r) => r.job_id === jobId && importIds.has(r.source_import_id))
        .sort((a, b) => a.source_row_order - b.source_row_order);
      return {
        rows: rows.map((r) => ({
          build_phase: r.build_phase,
          description: r.description,
          unit_rate: r.unit_rate,
          unit: r.unit,
          qty_excluding_wastage: r.qty_excluding_wastage,
          wastage_qty: r.wastage_qty,
          order_qty_including_wastage: r.order_qty_including_wastage,
          cost_excluding_wastage: r.cost_excluding_wastage,
          wastage_cost: r.wastage_cost,
          total_cost_including_wastage: r.total_cost_including_wastage,
          material_row_kind: r.material_row_kind,
        })),
      };
    }

    // Structured resources for a job
    if (normalized.includes("from job_location_task_resources tr") && normalized.includes("join job_location_tasks t")) {
      const jobId = parameters[0];
      const jobTaskIds = new Set(this.tasks.filter((t) => t.job_id === jobId).map((t) => t.id));
      const rows = this.resources
        .filter((r) => jobTaskIds.has(r.location_task_id))
        .sort((a, b) => a.source_order - b.source_order);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          location_task_id: r.location_task_id,
          usage_description: r.usage_description,
          product_description: r.product_description,
          quantity: r.quantity,
          unit: r.unit,
          source_value_raw: r.source_value_raw,
          source_value_kind: r.source_value_kind,
          source_order: r.source_order,
        })),
      };
    }

    // Tasks for a job
    if (normalized.includes("from job_location_tasks") && normalized.includes("where job_id = $1") && !normalized.includes("resources tr")) {
      const jobId = parameters[0];
      const rows = this.tasks
        .filter((t) => t.job_id === jobId)
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      return {
        rows: rows.map((t) => ({
          id: t.id,
          job_id: t.job_id,
          location_id: t.location_id,
          work_category: t.work_category,
          task_name: t.task_name,
          task_description: t.task_description,
          source_reference: t.source_reference,
        })),
      };
    }

    // Locations for a job
    if (normalized.includes("from job_locations") && normalized.includes("where job_id = $1") && !normalized.includes("count(")) {
      const jobId = parameters[0];
      const rows = this.locations
        .filter((l) => l.job_id === jobId)
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      return { rows: rows.map((l) => ({ id: l.id, job_id: l.job_id, name: l.name })) };
    }

    // Procurement assignments for a job
    if (
      normalized.includes("from job_assignments") &&
      normalized.includes("where job_id = $1") &&
      normalized.includes("location_id is not null")
    ) {
      const jobId = parameters[0];
      const rows = this.assignments
        .filter((a) => a.job_id === jobId && a.location_id !== null && a.location_task_id !== null)
        .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
      return {
        rows: rows.map((a) => ({
          id: a.id,
          job_id: a.job_id,
          location_id: a.location_id,
          location_task_id: a.location_task_id,
          start_date: a.start_date,
          end_date: a.end_date,
        })),
      };
    }

    // Schedule: all assignments joined with jobs/clients
    if (
      normalized.includes("from job_assignments a") &&
      normalized.includes("join jobs j") &&
      normalized.includes("order by a.start_date")
    ) {
      return {
        rows: this.assignments.slice().sort((a, b) => (a.start_date < b.start_date ? -1 : 1)),
      };
    }

    // Actual purchases for a job
    if (normalized.includes("from job_material_cost_actuals") && normalized.includes("where job_id = $1")) {
      const jobId = parameters[0];
      const rows = this.actuals.filter((a) => a.job_id === jobId);
      return {
        rows: rows.map((a) => ({
          id: a.id,
          job_id: a.job_id,
          material_key: a.material_key,
          material_description: a.material_description,
          supplier_name: a.supplier_name,
          supplier_unit_price: a.supplier_unit_price,
          actual_quantity: a.actual_quantity,
          actual_total: a.actual_total,
          purchase_date: a.purchase_date,
          payment_status: a.payment_status,
          notes: a.notes,
        })),
      };
    }

    // Confirmations for a job
    if (normalized.includes("from job_location_task_material_confirmations") && normalized.includes("where job_id = $1")) {
      const jobId = parameters[0];
      const jobTaskIds = new Set(this.tasks.filter((t) => t.job_id === jobId).map((t) => t.id));
      const rows = this.confirmations.filter((c) => jobTaskIds.has(c.location_task_id));
      return {
        rows: rows.map((c) => ({
          location_task_id: c.location_task_id,
          material_key: c.material_key,
          material_description: c.material_description,
          confirmed_quantity: c.confirmed_quantity,
          unit: c.unit,
        })),
      };
    }

    throw new Error(`Unexpected SQL in read API test:\n${sql}`);
  }

  async transaction<T>(_work: (transaction: IntegrationSqlTransaction) => Promise<T>): Promise<T> {
    this.transactionCalls++;
    throw new Error("Read-only Jarvis API must never open a transaction");
  }
}

function toJobListRow(job: JobRow): IntegrationSqlRow {
  return {
    id: job.id,
    client_id: job.client_id,
    client_name: job.client_name,
    title: job.title,
    location: job.location,
    address: job.address,
    postcode: job.postcode,
    status: job.status,
  };
}

function toJobDetailRow(job: JobRow): IntegrationSqlRow {
  return {
    id: job.id,
    client_id: job.client_id,
    client_name: job.client_name,
    title: job.title,
    location: job.location,
    address: job.address,
    postcode: job.postcode,
    status: job.status,
    quoted_amount: job.quoted_amount,
    phase_task_data: job.phase_task_data,
  };
}

// ─── Route-level HMAC helpers ───────────────────────────────────────────────

function buildRouter(executor: InMemoryReadExecutor) {
  const usedNonces = new Set<string>();
  const app = express();
  app.use(
    createJarvisReadApiRouter({
      enabled: true,
      repository: new SqlJarvisReadRepository(executor),
      keyLookup: (keyId) => (keyId === KEY_ID ? SECRET : undefined),
      nonceLookup: (keyId, nonce) => usedNonces.has(`${keyId}:${nonce}`),
      nonceStore: (keyId, nonce) => usedNonces.add(`${keyId}:${nonce}`),
      now: () => NOW,
    }),
  );
  return { app, usedNonces };
}

function signedGetHeaders(path: string, nonce: string): Record<string, string> {
  const timestamp = String(Math.floor(NOW / 1000));
  const queryIndex = path.indexOf("?");
  const rawQuery = queryIndex >= 0 ? path.slice(queryIndex + 1) : "";
  const query = canonical(rawQuery);
  // GET has no body; sign the SHA-256 of the empty string.
  const contentSha256 = createHash("sha256").update("").digest("hex");
  const signingInput = buildMachineAuthSigningInput(KEY_ID, timestamp, nonce, contentSha256, query);
  return {
    "x-api-key-id": KEY_ID,
    "x-timestamp": timestamp,
    "x-nonce": nonce,
    "x-content-sha256": contentSha256,
    "x-signature": createHmac("sha256", SECRET).update(signingInput).digest("hex"),
  };
}

function canonical(rawQuery: string): string | undefined {
  const pairs = rawQuery
    .split("&")
    .filter(Boolean)
    .map((pair) => pair.split("="))
    .filter((parts) => parts.length === 2 && parts[1].length > 0);
  if (pairs.length === 0) return undefined;
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
}

function uniqueNonce(existing: Set<string>): string {
  let nonce = "";
  do {
    nonce = `nonce-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
  } while (existing.has(nonce));
  return nonce;
}

async function listen(app: express.Express): Promise<{ port: number; close: () => Promise<void> }> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

// ─── Synthetic fixtures ─────────────────────────────────────────────────────

function syntheticJobs(): JobRow[] {
  const clientId = "11111111-1111-4111-8111-111111111111";
  return [
    {
      id: "job-maureen",
      client_id: clientId,
      client_name: "Maureen Orubebe",
      title: "Maureen Orubebe",
      status: "assigned",
      address: "123 NW9 5YZ",
      postcode: "NW9 5YZ",
      location: "Maureen House",
      quoted_amount: "8000",
      phase_task_data: JSON.stringify({
        resources: [
          { resourceType: "material", totalCost: 2000 },
          { resourceType: "labour", totalCost: 3000 },
        ],
      }),
    },
    {
      id: "job-spencer",
      client_id: "22222222-2222-4222-8222-222222222222",
      client_name: "Spencer",
      title: "Spencer House",
      status: "assigned",
      address: "45 Green Lane",
      postcode: "SW1A 1AA",
      location: "Spencer House",
      quoted_amount: null,
      phase_task_data: null,
    },
  ];
}

// ─── Route integration tests ────────────────────────────────────────────────

test("unauthenticated request is rejected with 401", async () => {
  const { app } = buildRouter(new InMemoryReadExecutor());
  const server = await listen(app);
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}${JARVIS_JOBS_ROUTE}`);
    assert.equal(response.status, 401);
  } finally {
    await server.close();
  }
});

test("valid HMAC GET succeeds on jobs list", async () => {
  const executor = new InMemoryReadExecutor();
  executor.jobs.push(...syntheticJobs());
  const { app } = buildRouter(executor);
  const server = await listen(app);
  try {
    const nonce = `nonce-${Date.now()}-valid`;
    const response = await fetch(`http://127.0.0.1:${server.port}${JARVIS_JOBS_ROUTE}`, {
      headers: signedGetHeaders(JARVIS_JOBS_ROUTE, nonce),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as any[];
    assert.ok(Array.isArray(body));
    assert.ok(body.some((j) => j.jobName === "Maureen Orubebe"));
  } finally {
    await server.close();
  }
});

test("tampered signature is rejected with 401", async () => {
  const executor = new InMemoryReadExecutor();
  executor.jobs.push(...syntheticJobs());
  const { app } = buildRouter(executor);
  const server = await listen(app);
  try {
    const nonce = `nonce-${Date.now()}-tamper`;
    const headers = signedGetHeaders(JARVIS_JOBS_ROUTE, nonce);
    headers["x-signature"] = "0".repeat(64);
    const response = await fetch(`http://127.0.0.1:${server.port}${JARVIS_JOBS_ROUTE}`, { headers });
    assert.equal(response.status, 401);
  } finally {
    await server.close();
  }
});

test("tampered query string is rejected (query bound into signature)", async () => {
  const executor = new InMemoryReadExecutor();
  executor.jobs.push(...syntheticJobs());
  const { app } = buildRouter(executor);
  const server = await listen(app);
  try {
    // Sign a query `search=Maureen` but send `search=Eve`
    const nonce = `nonce-${Date.now()}-query`;
    const signedFor = `${JARVIS_JOBS_ROUTE}?search=Maureen`;
    const headers = signedGetHeaders(signedFor, nonce);
    const response = await fetch(`http://127.0.0.1:${server.port}${JARVIS_JOBS_ROUTE}?search=Eve`, { headers });
    assert.equal(response.status, 401);
  } finally {
    await server.close();
  }
});

test("jobs search returns matching job", async () => {
  const executor = new InMemoryReadExecutor();
  executor.jobs.push(...syntheticJobs());
  const { app } = buildRouter(executor);
  const server = await listen(app);
  try {
    const path = `${JARVIS_JOBS_ROUTE}?search=Maureen`;
    const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
      headers: signedGetHeaders(path, `nonce-${Date.now()}-search1`),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as any[];
    assert.equal(body.length, 1);
    assert.equal(body[0].jobName, "Maureen Orubebe");
    assert.equal(body[0].clientName, "Maureen Orubebe");
    assert.equal(body[0].postcode, "NW9 5YZ");
  } finally {
    await server.close();
  }
});

test("Spencer: search returns the real Spencer House job and overview returns current data", async () => {
  const executor = new InMemoryReadExecutor();
  executor.jobs.push(...syntheticJobs());
  executor.locations.push({ id: "sp-loc", job_id: "job-spencer", name: "Ground Floor" });
  executor.tasks.push({ id: "sp-task", job_id: "job-spencer", location_id: "sp-loc", work_category: "Decoration", task_name: "Decoration", task_description: null, source_reference: "HBXL_WORD" });
  const { app } = buildRouter(executor);
  const server = await listen(app);
  try {
    // Search for Spencer
    const searchPath = `${JARVIS_JOBS_ROUTE}?search=Spencer`;
    const searchResponse = await fetch(`http://127.0.0.1:${server.port}${searchPath}`, {
      headers: signedGetHeaders(searchPath, `nonce-${Date.now()}-spencer-search`),
    });
    assert.equal(searchResponse.status, 200);
    const searchBody = (await searchResponse.json()) as any[];
    assert.equal(searchBody.length, 1);
    assert.equal(searchBody[0].jobName, "Spencer House");
    assert.equal(searchBody[0].jobId, "job-spencer");

    // Overview for the real Spencer job id
    const overviewPath = `${JARVIS_JOBS_ROUTE}/job-spencer`;
    const overviewResponse = await fetch(`http://127.0.0.1:${server.port}${overviewPath}`, {
      headers: signedGetHeaders(overviewPath, `nonce-${Date.now()}-spencer-overview`),
    });
    assert.equal(overviewResponse.status, 200);
    const overview = await overviewResponse.json() as any;
    assert.equal(overview.job.jobName, "Spencer House");
    assert.equal(overview.counts.locations, 1);
    assert.equal(overview.counts.tasks, 1);
    // No commercial values exist for Spencer in the current fixture: must not invent them
    assert.equal(overview.quotedValue, null);
    assert.equal(overview.forecastGrossProfit, null);
    assert.equal(overview.marginPercent, null);
  } finally {
    await server.close();
  }
});

test("job overview returns business fields and counts", async () => {
  const executor = new InMemoryReadExecutor();
  executor.jobs.push(...syntheticJobs());
  executor.locations.push({ id: "loc-1", job_id: "job-maureen", name: "Bedroom 3" });
  executor.tasks.push({ id: "task-1", job_id: "job-maureen", location_id: "loc-1", work_category: "Fire Door", task_name: "Fire Door", task_description: null, source_reference: "HBXL_WORD" });
  executor.assignments.push({
    id: "asg-1",
    job_id: "job-maureen",
    location_id: "loc-1",
    location_name: "Bedroom 3",
    location_task_id: "task-1",
    task_name: "Fire Door",
    work_category: "Fire Door",
    start_date: "2026-10-06",
    end_date: "2026-10-08",
    status: "assigned",
    contractor_name: "Rudy Test",
    job_title: "Maureen Orubebe",
    client_name: "Maureen Orubebe",
  });
  const { app } = buildRouter(executor);
  const server = await listen(app);
  try {
    const path = `${JARVIS_JOBS_ROUTE}/job-maureen`;
    const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
      headers: signedGetHeaders(path, `nonce-${Date.now()}-overview`),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.job.jobName, "Maureen Orubebe");
    assert.equal(body.job.status, "assigned");
    assert.equal(body.counts.locations, 1);
    assert.equal(body.counts.tasks, 1);
    assert.equal(body.counts.assignments, 1);
    // Commercial summary from existing calculation: 8000 - (2000+3000) = 3000 gross profit, 37.5% margin
    assert.equal(body.quotedValue, 8000);
    assert.equal(body.estimatedCost, 5000);
    assert.equal(body.forecastGrossProfit, 3000);
    assert.equal(body.marginPercent, 37.5);
  } finally {
    await server.close();
  }
});

test("job overview returns 404 for unknown job", async () => {
  const executor = new InMemoryReadExecutor();
  const { app } = buildRouter(executor);
  const server = await listen(app);
  try {
    const path = `${JARVIS_JOBS_ROUTE}/missing-job`;
    const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
      headers: signedGetHeaders(path, `nonce-${Date.now()}-404`),
    });
    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});

// ─── Synthetic materials: verifies the shared weekly buying pipeline is reused ─

function syntheticMaterialsExecutor(): InMemoryReadExecutor {
  const executor = new InMemoryReadExecutor();
  executor.jobs.push(...syntheticJobs());
  executor.imports.push({
    id: "import-1",
    job_id: "job-maureen",
    source_stream_key: "HBXL_MATERIALS_USED",
    is_current_revision: true,
    status: "IMPORTED",
  });
  const imp = "import-1";
  const loc = { id: "loc-1", job_id: "job-maureen", name: "Bedroom 3" };
  executor.locations.push(loc);

  const addTask = (taskId: string, category: string) => {
    executor.tasks.push({
      id: taskId,
      job_id: "job-maureen",
      location_id: loc.id,
      work_category: category,
      task_name: category,
      task_description: null,
      source_reference: "HBXL_WORD",
    });
  };
  addTask("task-door", "Fire Door");
  addTask("task-decor", "Room Decoration");
  addTask("task-floor", "Solid Wood Flooring");

  // CSV material rows (project-level priced)
  const addCsv = (description: string, rate: number, unit: string, orderQty: number, total: number) => {
    executor.materialRows.push({
      id: `mr-${description}`,
      job_id: "job-maureen",
      source_import_id: imp,
      build_phase: "Phase",
      description,
      unit_rate: rate.toFixed(2),
      unit,
      qty_excluding_wastage: orderQty.toFixed(2),
      wastage_qty: "0",
      order_qty_including_wastage: orderQty.toFixed(2),
      cost_excluding_wastage: total.toFixed(2),
      wastage_cost: "0",
      total_cost_including_wastage: total.toFixed(2),
      source_row_order: executor.materialRows.length + 1,
      material_row_kind: "PHYSICAL_PRODUCT",
    });
  };
  // Fire Door package (2 priced auto-quantified + 1 unpriced)
  addCsv("Internal Fire Door", 126.0, "each", 1, 126.0);
  addCsv("Torus Architrave", 4.05, "m", 11.46, 46.42);
  // Room Decoration package (auto-quantified priced)
  addCsv("Magnolia Emulsion Paint", 37.95, "l", 2.96, 112.33);
  // Solid Wood Flooring package (confirm qty + unpriced)
  addCsv("Self Levelling Compound", 15.08, "kg", 3.76, 56.73);

  // Structured resources per task
  const addResource = (taskId: string, product: string, qty: string | null, unit: string | null, kind: string, order: number) => {
    executor.resources.push({
      id: `res-${order}`,
      location_task_id: taskId,
      usage_description: product,
      product_description: product,
      quantity: qty,
      unit,
      source_value_raw: kind === "currency_unclassified" ? "£126.00" : qty,
      source_value_kind: kind,
      source_order: order,
    });
  };
  let order = 1;
  // Fire Door: priced (auto-quantified)
  addResource("task-door", "Internal Fire Door", "1", "each", "quantity", order++);
  addResource("task-door", "Torus Architrave", "11.46", "m", "quantity", order++);
  // Room Decoration: priced
  addResource("task-decor", "Magnolia Emulsion Paint", "2.96", "l", "quantity", order++);
  // Solid Wood Flooring: allowance token (currency) must be excluded, plus a confirm-qty priced and an unpriced
  addResource("task-floor", "Solid Wood Flooring", null, null, "currency_unclassified", order++);
  addResource("task-floor", "Self Levelling Compound", null, null, "blank", order++);
  // Unpriced product with no CSV match
  addResource("task-door", "Door Closer", "1", "each", "quantity", order++);

  // Assignments falling in 2026-10-06..2026-10-12 (today = 2026-10-06)
  executor.assignments.push(
    { id: "a1", job_id: "job-maureen", location_id: "loc-1", location_name: "Bedroom 3", location_task_id: "task-door", task_name: "Fire Door", work_category: "Fire Door", start_date: "2026-10-06", end_date: "2026-10-08", status: "assigned", contractor_name: "Rudy Test", job_title: "Maureen Orubebe", client_name: "Maureen Orubebe" },
    { id: "a2", job_id: "job-maureen", location_id: "loc-1", location_name: "Bedroom 3", location_task_id: "task-decor", task_name: "Room Decoration", work_category: "Room Decoration", start_date: "2026-10-12", end_date: "2026-10-13", status: "assigned", contractor_name: "Rudy Test", job_title: "Maureen Orubebe", client_name: "Maureen Orubebe" },
    { id: "a3", job_id: "job-maureen", location_id: "loc-1", location_name: "Bedroom 3", location_task_id: "task-floor", task_name: "Solid Wood Flooring", work_category: "Solid Wood Flooring", start_date: "2026-10-12", end_date: "2026-10-16", status: "assigned", contractor_name: "Rudy Test", job_title: "Maureen Orubebe", client_name: "Maureen Orubebe" },
  );

  return executor;
}

test("Maureen materials endpoint reuses weekly buying calculation for next 7 days", async () => {
  const executor = syntheticMaterialsExecutor();
  const { app } = buildRouter(executor);
  const server = await listen(app);
  try {
    const path = `${JARVIS_JOBS_ROUTE}/job-maureen/materials?days=7`;
    const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
      headers: signedGetHeaders(path, `nonce-${Date.now()}-mat`),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as any;

    // Three scheduled packages in the window (Fire Door, Room Decoration, Solid Wood Flooring)
    assert.equal(body.scheduledPackages, 3);

    // Known priced planned spend and remaining-to-buy (all from shared buildWeeklyBuyingList)
    assert.equal(body.knownPlannedSpend, 284.75);
    assert.equal(body.actualPurchased, 0);
    assert.equal(body.remainingToBuyPriced, 284.75);

    // Business states across all physical items
    const ready = body.items.filter((i: any) => i.state === "READY_TO_BUY");
    const confirm = body.items.filter((i: any) => i.state === "CONFIRM_QTY");
    const price = body.items.filter((i: any) => i.state === "PRICE_NEEDED");
    assert.equal(ready.length, 3, "3 auto-quantified priced READY_TO_BUY");
    assert.equal(confirm.length, 1, "1 priced requiring CONFIRM_QTY (Self Levelling Compound)");
    assert.equal(price.length, 1, "1 PRICE_NEEDED (Door Closer)");

    // Precise item-level parity with the shared calculation
    const magnolia = body.items.find((i: any) => i.materialDescription.includes("Magnolia"));
    assert.ok(magnolia);
    assert.equal(magnolia.quantityNeeded, 2.96);
    assert.equal(magnolia.plannedBudget, 112.33);
    assert.equal(magnolia.state, "READY_TO_BUY");

    const fireDoor = body.items.find((i: any) => i.materialDescription.includes("Fire Door"));
    assert.ok(fireDoor);
    assert.equal(fireDoor.quantityNeeded, 1);
    assert.equal(fireDoor.plannedBudget, 126);

    // Allowance token (Solid Wood Flooring currency) is excluded from physical buying
    assert.equal(
      body.items.some((i: any) => i.materialDescription.toLowerCase().includes("solid wood flooring")),
      false,
      "Solid Wood Flooring currency allowance token must be excluded",
    );

    // Read-only guarantee: no transactions opened
    assert.equal(executor.transactionCalls, 0);
    assert.equal(executor.nonSelectCalls, 0);
  } finally {
    await server.close();
  }
});

test("schedule read returns scheduled work with assigned workers", async () => {
  const executor = new InMemoryReadExecutor();
  executor.jobs.push(...syntheticJobs());
  executor.assignments.push({
    id: "a1",
    job_id: "job-maureen",
    location_id: "loc-1",
    location_name: "Bedroom 3",
    location_task_id: "task-door",
    task_name: "Fire Door",
    work_category: "Fire Door",
    start_date: "2026-10-06",
    end_date: "2026-10-08",
    status: "assigned",
    contractor_name: "Rudy Test",
    job_title: "Maureen Orubebe",
    client_name: "Maureen Orubebe",
  },
  {
    id: "a2",
    job_id: "job-maureen",
    location_id: "loc-1",
    location_name: "Bedroom 3",
    location_task_id: "task-decor",
    task_name: "Room Decoration",
    work_category: "Room Decoration",
    start_date: "2026-11-20",
    end_date: "2026-11-22",
    status: "assigned",
    contractor_name: "Another Worker",
    job_title: "Maureen Orubebe",
    client_name: "Maureen Orubebe",
  });
  const { app } = buildRouter(executor);
  const server = await listen(app);
  try {
    const path = `${JARVIS_SCHEDULE_ROUTE}?days=7`;
    const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
      headers: signedGetHeaders(path, `nonce-${Date.now()}-sched`),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as any[];
    // Only the in-window assignment (Oct 06) is returned; Nov 20 is excluded
    assert.equal(body.length, 1);
    assert.equal(body[0].jobName, "Maureen Orubebe");
    assert.equal(body[0].workPackage, "Fire Door");
    assert.deepEqual(body[0].assignedWorkers, ["Rudy Test"]);
  } finally {
    await server.close();
  }
});

test("cross-job weekly buying dashboard aggregates attention per job", async () => {
  const executor = syntheticMaterialsExecutor();
  executor.jobs.push({ id: "job-empty", client_id: null, client_name: null, title: "No Work", status: "assigned", address: null, postcode: null, location: null, quoted_amount: null, phase_task_data: null });
  const { app } = buildRouter(executor);
  const server = await listen(app);
  try {
    const path = `${JARVIS_WEEKLY_BUYING_DASHBOARD_ROUTE}?days=7`;
    const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
      headers: signedGetHeaders(path, `nonce-${Date.now()}-dash`),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as any[];
    // Only Maureen has scheduled work in the window; "No Work" has no assignments so excluded
    const jenkins = body.find((r: any) => r.jobName === "Maureen Orubebe");
    assert.ok(jenkins);
    assert.equal(jenkins.scheduledWorkCount, 3);
    assert.equal(jenkins.confirmQtyCount, 1);
    assert.equal(jenkins.priceNeededCount, 1);
    assert.equal(body.length, 1);
  } finally {
    await server.close();
  }
});

test("read endpoints open no DB transactions and issue no writes", async () => {
  const executor = syntheticMaterialsExecutor();
  const { app } = buildRouter(executor);
  const server = await listen(app);
  try {
    const materialsResponse = await fetch(`http://127.0.0.1:${server.port}${JARVIS_JOBS_ROUTE}/job-maureen/materials?days=7`, {
      headers: signedGetHeaders(`${JARVIS_JOBS_ROUTE}/job-maureen/materials?days=7`, `nonce-${Date.now()}-mut1`),
    });
    assert.equal(materialsResponse.status, 200);

    const scheduleResponse = await fetch(`http://127.0.0.1:${server.port}${JARVIS_SCHEDULE_ROUTE}?days=7`, {
      headers: signedGetHeaders(`${JARVIS_SCHEDULE_ROUTE}?days=7`, `nonce-${Date.now()}-mut2`),
    });
    assert.equal(scheduleResponse.status, 200);

    assert.equal(executor.transactionCalls, 0, "no transaction was opened");
    assert.equal(executor.nonSelectCalls, 0, "no non-SELECT statement was issued");
  } finally {
    await server.close();
  }
});

// ─── Live Maureen contract test (real production fixture files) ─────────────

const MAUREEN_CSV = "G:\\My Drive\\SCULPT PROJECTS LTD\\Maureen orubebe NW9 5YZ\\Job 3 Maureen Orubebe - Materials Used.csv";
const MAUREEN_DOCX = "G:\\My Drive\\SCULPT PROJECTS LTD\\Maureen orubebe NW9 5YZ\\Job 3 Maureen Orubebe - Quote.docx";

test("LIVE Maureen NEXT 7 DAYS: endpoint reproduces live UI business state from current data", async () => {
  if (!existsSync(MAUREEN_CSV) || !existsSync(MAUREEN_DOCX)) {
    // Skip when the production fixture drive is unavailable — the synthetic
    // tests above still fully exercise the endpoint and shared pipeline.
    return;
  }

  const csvContent = readFileSync(MAUREEN_CSV, "latin1");
  const csvRows = parseMaterialsUsedCsv(csvContent);
  const parsed = await parseHbxlWordQuote(readFileSync(MAUREEN_DOCX), "Maureen.docx");

  const jobId = "job-maureen";
  const executor = new InMemoryReadExecutor();
  executor.jobs.push({
    id: jobId,
    client_id: "11111111-1111-4111-8111-111111111111",
    client_name: "Maureen Orubebe",
    title: "Maureen Orubebe",
    status: "assigned",
    address: "123 NW9 5YZ",
    postcode: "NW9 5YZ",
    location: "Maureen House",
    quoted_amount: null,
    phase_task_data: null,
  });
  executor.imports.push({ id: "import-1", job_id: jobId, source_stream_key: "HBXL_MATERIALS_USED", is_current_revision: true, status: "IMPORTED" });

  const locations: ProcurementLocation[] = [];
  const tasks: ProcurementLocationTask[] = [];
  const resources: ProcurementStructuredResource[] = [];
  let order = 1;

  for (const loc of parsed.locations) {
    const locId = `loc-${loc.name}`;
    executor.locations.push({ id: locId, job_id: jobId, name: loc.name });
    locations.push({ id: locId, jobId, name: loc.name });
    for (const cat of loc.categories) {
      const taskId = `task-${loc.name}-${cat.name}`;
      executor.tasks.push({ id: taskId, job_id: jobId, location_id: locId, work_category: cat.name, task_name: cat.name, task_description: null, source_reference: "HBXL_WORD" });
      tasks.push({ id: taskId, jobId, locationId: locId, workCategory: cat.name, taskName: cat.name, taskDescription: null });
      for (const r of cat.structuredResources ?? []) {
        executor.resources.push({
          id: `res-${order}`,
          location_task_id: taskId,
          usage_description: r.usageDescription,
          product_description: r.productDescription,
          quantity: r.quantity,
          unit: r.unit,
          source_value_raw: r.sourceValueRaw,
          source_value_kind: r.sourceValueKind,
          source_order: order,
        });
        resources.push({
          id: `res-${order}`,
          locationTaskId: taskId,
          usageDescription: r.usageDescription,
          productDescription: r.productDescription,
          quantity: r.quantity,
          unit: r.unit,
          sourceValueRaw: r.sourceValueRaw,
          sourceValueKind: r.sourceValueKind,
          sourceOrder: order,
        });
        order++;
      }
    }
  }

  // Populate material cost rows from the real CSV
  csvRows.forEach((row, index) => {
    executor.materialRows.push({
      id: `mr-${index}`,
      job_id: jobId,
      source_import_id: "import-1",
      build_phase: row.buildPhase,
      description: row.description,
      unit_rate: row.unitRate.toFixed(2),
      unit: row.unit,
      qty_excluding_wastage: row.qtyExcludingWastage.toFixed(2),
      wastage_qty: row.wastageQty.toFixed(2),
      order_qty_including_wastage: row.orderQtyIncludingWastage.toFixed(2),
      cost_excluding_wastage: row.costExcludingWastage.toFixed(2),
      wastage_cost: row.wastageCost.toFixed(2),
      total_cost_including_wastage: row.totalCostIncludingWastage.toFixed(2),
      source_row_order: index + 1,
      material_row_kind: "PHYSICAL_PRODUCT",
    });
  });

  // Real Maureen assignments for the 2026-10-06 window (same as live test)
  const bed3Loc = locations.find((l) => l.name.includes("Bedroom 3"))!;
  const bed3Tasks = tasks.filter((t) => t.locationId === bed3Loc.id);
  const assignment = (locationTaskId: string, start: string, end: string) => ({
    id: `a-${locationTaskId}`,
    job_id: jobId,
    location_id: bed3Loc.id,
    location_name: bed3Loc.name,
    location_task_id: locationTaskId,
    task_name: bed3Tasks.find((t) => t.id === locationTaskId)?.taskName ?? null,
    work_category: bed3Tasks.find((t) => t.id === locationTaskId)?.workCategory ?? null,
    start_date: start,
    end_date: end,
    status: "assigned",
    contractor_name: "Rudy Test",
    job_title: "Maureen Orubebe",
    client_name: "Maureen Orubebe",
  });
  executor.assignments.push(
    assignment(bed3Tasks.find((t) => t.workCategory === "Fire Door")!.id, "2026-10-06", "2026-10-08"),
    assignment(bed3Tasks.find((t) => t.workCategory === "Room Decoration")!.id, "2026-10-12", "2026-10-13"),
    assignment(bed3Tasks.find((t) => t.workCategory === "Solid Wood Flooring")!.id, "2026-10-12", "2026-10-16"),
  );

  const { app } = buildRouter(executor);
  const server = await listen(app);
  try {
    const path = `${JARVIS_JOBS_ROUTE}/${jobId}/materials?days=7`;
    const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
      headers: signedGetHeaders(path, `nonce-${Date.now()}-mau-live`),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as any;

    const ready = body.items.filter((i: any) => i.state === "READY_TO_BUY");
    const confirm = body.items.filter((i: any) => i.state === "CONFIRM_QTY");
    const price = body.items.filter((i: any) => i.state === "PRICE_NEEDED");

    // Business-state parity with the live Weekly Buying screen (production baseline)
    assert.equal(body.knownPlannedSpend, 436.92, "known priced spend £436.92");
    assert.equal(ready.length, 7, "7 auto quantified/priced physical materials");
    assert.equal(confirm.length, 9, "9 priced physical materials requiring CONFIRM QTY");
    assert.equal(price.length, 4, "4 PRICE / PRODUCT NEEDED");
    // No DB writes occurred
    assert.equal(executor.transactionCalls, 0);
    assert.equal(executor.nonSelectCalls, 0);
  } finally {
    await server.close();
  }
});
