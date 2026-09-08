import express, { type Router } from "express";
import type {
  IntegrationKeyLookup,
  IntegrationNonceLookup,
  MachineAuthHeaders,
} from "./integration-auth.ts";
import { verifyMachineAuthentication } from "./integration-auth.ts";
import type { IntegrationSqlExecutor, IntegrationSqlRow } from "./integration-shadow-sql-repository.ts";
import { HBXL_MATERIALS_USED_STREAM_KEY } from "../shared/job-match.ts";
import {
  allocateRoomBudgets,
  buildWeeklyBuyingList,
  matchWordProductsToCsv,
  type ActualPurchaseInput,
  type MaterialsUsedRow,
  type QuantityConfirmationInput,
  type WeeklyBuyingItem,
} from "../shared/procurement-pricing.ts";
import {
  buildRoomPackageProcurementChecklist,
  type ProcurementAssignment,
  type ProcurementLocation,
  type ProcurementLocationTask,
  type ProcurementStructuredResource,
} from "../shared/weekly-procurement.ts";
import { calculateBudgetTrackingCommercialSummary } from "../shared/budget-tracking.ts";

export const JARVIS_JOBS_ROUTE = "/api/integrations/jarvis/v1/jobs";
export const JARVIS_SCHEDULE_ROUTE = "/api/integrations/jarvis/v1/schedule";
export const JARVIS_WEEKLY_BUYING_DASHBOARD_ROUTE = "/api/integrations/jarvis/v1/dashboard/weekly-buying";

const ACTIVE_JOB_STATUSES = ["pending", "assigned"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Read API result types (business-facing, no internal DB leakage) ────────

export interface JarvisJobListItem {
  jobId: string;
  jobName: string;
  clientId: string | null;
  clientName: string | null;
  address: string | null;
  postcode: string | null;
  status: string;
}

export interface JarvisJobOverview {
  job: {
    jobId: string;
    jobName: string;
    clientId: string | null;
    clientName: string | null;
    address: string | null;
    postcode: string | null;
    status: string;
  };
  quotedValue: number | null;
  estimatedCost: number;
  forecastGrossProfit: number | null;
  marginPercent: number | null;
  counts: {
    locations: number;
    tasks: number;
    assignments: number;
  };
}

export type MaterialBusinessState = "READY_TO_BUY" | "CONFIRM_QTY" | "PRICE_NEEDED";

export interface JarvisMaterialItem {
  materialDescription: string;
  room: string;
  locationTaskIds: string[];
  unit: string;
  quantityNeeded: number;
  hbxlUnitRate: number;
  plannedBudget: number;
  purchasedQuantity: number;
  stillToBuyQuantity: number;
  state: MaterialBusinessState;
  workPackage?: string;
}

export interface JarvisMaterialsResponse {
  period: {
    start: string;
    end: string;
    days: number;
  };
  scheduledPackages: number;
  knownPlannedSpend: number;
  actualPurchased: number;
  remainingToBuyPriced: number;
  items: JarvisMaterialItem[];
}

export interface JarvisScheduleEntry {
  jobId: string | null;
  jobName: string | null;
  clientName: string | null;
  locationId: string | null;
  locationName: string | null;
  locationTaskId: string | null;
  workPackage: string | null;
  taskName: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string | null;
  assignedWorkers: string[];
}

export interface JarvisWeeklyBuyingRow {
  jobId: string;
  jobName: string;
  clientName: string | null;
  scheduledWorkCount: number;
  knownMaterialSpend: number;
  confirmQtyCount: number;
  priceNeededCount: number;
  materialsStillToBuyCount: number;
}

// ─── Repository ─────────────────────────────────────────────────────────────

export interface JarvisReadRepository {
  listJobs(search?: string): Promise<JarvisJobListItem[]>;
  getJobOverview(jobId: string): Promise<JarvisJobOverview | undefined>;
  getMaterials(jobId: string, days: number, today?: Date): Promise<JarvisMaterialsResponse | undefined>;
  getSchedule(days: number, today?: Date): Promise<JarvisScheduleEntry[]>;
  getWeeklyBuyingDashboard(days: number, today?: Date): Promise<JarvisWeeklyBuyingRow[]>;
}

interface JobRow {
  id: string;
  client_id: string | null;
  client_name: string | null;
  title: string;
  location: string | null;
  address: string | null;
  postcode: string | null;
  status: string;
}

export class SqlJarvisReadRepository implements JarvisReadRepository {
  private readonly executor: IntegrationSqlExecutor;

  constructor(executor: IntegrationSqlExecutor) {
    this.executor = executor;
  }

  async listJobs(search?: string): Promise<JarvisJobListItem[]> {
    const keyword = search?.trim();
    let rows: readonly IntegrationSqlRow[];
    if (keyword) {
      const pattern = `%${keyword}%`;
      const result = await this.executor.query(
        `SELECT j.id, j.client_id, c.name AS client_name, j.title, j.location, j.address,
                j.postcode, j.status
         FROM jobs j
         LEFT JOIN clients c ON j.client_id = c.id
         WHERE j.title ILIKE $1 OR c.name ILIKE $1
         ORDER BY j.title, j.id`,
        [pattern],
      );
      rows = result.rows;
    } else {
      const result = await this.executor.query(
        `SELECT j.id, j.client_id, c.name AS client_name, j.title, j.location, j.address,
                j.postcode, j.status
         FROM jobs j
         LEFT JOIN clients c ON j.client_id = c.id
         ORDER BY j.title, j.id`,
        [],
      );
      rows = result.rows;
    }
    return rows.map(toJobListItem);
  }

  async getJobOverview(jobId: string): Promise<JarvisJobOverview | undefined> {
    const jobResult = await this.executor.query(
      `SELECT j.id, j.client_id, c.name AS client_name, j.title, j.location, j.address,
              j.postcode, j.status, j.quoted_amount, j.phase_task_data
       FROM jobs j
       LEFT JOIN clients c ON j.client_id = c.id
       WHERE j.id = $1`,
      [jobId],
    );
    const jobRow = jobResult.rows[0];
    if (jobRow === undefined) return undefined;

    const [locationsResult, tasksResult, assignmentsResult] = await Promise.all([
      this.executor.query(`SELECT COUNT(*)::int AS n FROM job_locations WHERE job_id = $1`, [jobId]),
      this.executor.query(`SELECT COUNT(*)::int AS n FROM job_location_tasks WHERE job_id = $1`, [jobId]),
      this.executor.query(`SELECT COUNT(*)::int AS n FROM job_assignments WHERE job_id = $1`, [jobId]),
    ]);

    const commercial = calculateBudgetTrackingCommercialSummary({
      quotedAmount: jobRow.quoted_amount,
      phaseTaskData: jobRow.phase_task_data,
    });

    return {
      job: {
        jobId: requiredString(jobRow, "id"),
        jobName: requiredString(jobRow, "title"),
        clientId: optionalString(jobRow, "client_id"),
        clientName: optionalString(jobRow, "client_name"),
        address: optionalString(jobRow, "address") ?? optionalString(jobRow, "location"),
        postcode: optionalString(jobRow, "postcode"),
        status: requiredString(jobRow, "status"),
      },
      quotedValue: commercial.clientQuote,
      estimatedCost: commercial.estimatedCost,
      forecastGrossProfit: commercial.forecastGrossProfit,
      marginPercent: commercial.forecastMarginPercent,
      counts: {
        locations: countValue(locationsResult, "n"),
        tasks: countValue(tasksResult, "n"),
        assignments: countValue(assignmentsResult, "n"),
      },
    };
  }

  async getMaterials(jobId: string, days: number, today = new Date()): Promise<JarvisMaterialsResponse | undefined> {
    const jobExists = await this.executor.query(`SELECT id FROM jobs WHERE id = $1`, [jobId]);
    if (jobExists.rows.length === 0) return undefined;

    const [materialRows, structuredResources, tasks, locations, assignments, actuals, confirmations] =
      await Promise.all([
        this.loadMaterialCostRows(jobId),
        this.loadStructuredResources(jobId),
        this.loadTasks(jobId),
        this.loadLocations(jobId),
        this.loadAssignments(jobId),
        this.loadActuals(jobId),
        this.loadConfirmations(jobId),
      ]);

    const csvRows = materialRows.map(toMaterialsUsedRow);

    // Pre-filter assignments to the requested window, then hand the windowed
    // set to the shared Room-Package builder with "all-job". For days=7 this is
    // numerically identical to the live Weekly Buying screen's "NEXT 7 DAYS"
    // filter (today .. today+6), so every downstream allocation/pricing/state
    // calculation is the exact same shared logic — nothing is re-derived here.
    const windowedAssignments = assignments.filter((a) => assignmentInWindow(a, days, today));

    const roomPackageChecklist = buildRoomPackageProcurementChecklist({
      jobId,
      assignments: windowedAssignments,
      locations,
      tasks,
      structuredResources,
      filter: "all-job",
      today,
    });
    const scheduledTaskIds = new Set(roomPackageChecklist.map((item) => item.locationTaskId));

    const productMatches = matchWordProductsToCsv(
      Array.from(new Set(structuredResources.map((r) => r.productDescription).filter(Boolean))),
      csvRows,
    );
    const allocations = allocateRoomBudgets(structuredResources, productMatches, scheduledTaskIds);

    const weeklySummary = buildWeeklyBuyingList(
      allocations,
      roomPackageChecklist,
      productMatches,
      csvRows,
      actuals,
      confirmations,
    );

    const period = windowPeriod(days, today);

    return {
      period,
      scheduledPackages: roomPackageChecklist.length,
      knownPlannedSpend: weeklySummary.plannedSpend,
      actualPurchased: weeklySummary.actualPurchased,
      remainingToBuyPriced: weeklySummary.remainingToBuyBudget,
      items: weeklySummary.items.map(toJarvisMaterialItem),
    };
  }

  async getSchedule(days: number, today = new Date()): Promise<JarvisScheduleEntry[]> {
    const result = await this.executor.query(
      `SELECT a.id, a.job_id, a.location_id, a.location_name, a.location_task_id,
              a.task_name, a.work_category, a.start_date, a.end_date, a.status,
              a.contractor_name,
              j.title AS job_title, c.name AS client_name
       FROM job_assignments a
       LEFT JOIN jobs j ON a.job_id = j.id
       LEFT JOIN clients c ON j.client_id = c.id
       ORDER BY a.start_date, j.title`,
      [],
    );
    const entries: JarvisScheduleEntry[] = [];
    for (const row of result.rows) {
      const { start, end } = deriveWindow(days, today);
      if (!overlapsWindow(optionalNullableString(row, "start_date"), optionalNullableString(row, "end_date"), start, end)) continue;
      entries.push({
        jobId: optionalString(row, "job_id"),
        jobName: optionalString(row, "job_title"),
        clientName: optionalString(row, "client_name"),
        locationId: optionalString(row, "location_id"),
        locationName: optionalString(row, "location_name"),
        locationTaskId: optionalString(row, "location_task_id"),
        workPackage: optionalString(row, "work_category") ?? optionalString(row, "task_name"),
        taskName: optionalString(row, "task_name") ?? optionalString(row, "hbxl_job"),
        startDate: optionalString(row, "start_date"),
        endDate: optionalString(row, "end_date"),
        status: optionalString(row, "status"),
        assignedWorkers: contractorNames(row.contractor_name),
      });
    }
    return entries;
  }

  async getWeeklyBuyingDashboard(days: number, today = new Date()): Promise<JarvisWeeklyBuyingRow[]> {
    const jobsResult = await this.executor.query(
      `SELECT j.id, j.title, c.name AS client_name, j.status
       FROM jobs j
       LEFT JOIN clients c ON j.client_id = c.id
       WHERE j.status::text = ANY($1::text[])
       ORDER BY j.title, j.id`,
      [ACTIVE_JOB_STATUSES],
    );

    const rows: JarvisWeeklyBuyingRow[] = [];
    for (const job of jobsResult.rows) {
      const jobId = requiredString(job, "id");
      const materials = await this.getMaterials(jobId, days, today);
      if (materials === undefined || materials.scheduledPackages === 0) continue;

      const confirmQtyCount = materials.items.filter((i) => i.state === "CONFIRM_QTY").length;
      const priceNeededCount = materials.items.filter((i) => i.state === "PRICE_NEEDED").length;
      const materialsStillToBuyCount = materials.items.filter((i) => i.stillToBuyQuantity > 0).length;

      rows.push({
        jobId,
        jobName: requiredString(job, "title"),
        clientName: optionalString(job, "client_name"),
        scheduledWorkCount: materials.scheduledPackages,
        knownMaterialSpend: materials.knownPlannedSpend,
        confirmQtyCount,
        priceNeededCount,
        materialsStillToBuyCount,
      });
    }
    return rows;
  }

  private async loadMaterialCostRows(jobId: string): Promise<any[]> {
    const result = await this.executor.query(
      `SELECT mr.build_phase, mr.description, mr.unit_rate, mr.unit,
              mr.qty_excluding_wastage, mr.wastage_qty,
              mr.order_qty_including_wastage, mr.cost_excluding_wastage,
              mr.wastage_cost, mr.total_cost_including_wastage,
              mr.material_row_kind
       FROM job_material_cost_resources mr
       JOIN project_source_import psi ON mr.source_import_id = psi.id
       WHERE mr.job_id = $1
         AND psi.source_stream_key = $2
         AND psi.is_current_revision = true
         AND psi.status = 'IMPORTED'
       ORDER BY mr.source_row_order`,
      [jobId, HBXL_MATERIALS_USED_STREAM_KEY],
    );
    return result.rows as any[];
  }

  private async loadStructuredResources(jobId: string): Promise<ProcurementStructuredResource[]> {
    const result = await this.executor.query(
      `SELECT tr.id, tr.location_task_id, tr.usage_description, tr.product_description,
              tr.quantity, tr.unit, tr.source_value_raw, tr.source_value_kind,
              tr.source_order
       FROM job_location_task_resources tr
       JOIN job_location_tasks t ON tr.location_task_id = t.id
       WHERE t.job_id = $1
       ORDER BY tr.source_order`,
      [jobId],
    );
    return result.rows.map((row) => {
      const resource: ProcurementStructuredResource = {
        locationTaskId: requiredString(row, "location_task_id"),
        usageDescription: requiredString(row, "usage_description"),
        productDescription: requiredString(row, "product_description"),
        quantity: optionalString(row, "quantity"),
        unit: optionalString(row, "unit"),
        sourceValueRaw: optionalString(row, "source_value_raw"),
        sourceValueKind: requiredValueKind(row.source_value_kind),
        sourceOrder: requiredNumber(row.source_order),
      };
      const id = optionalString(row, "id");
      if (id !== null) resource.id = id;
      const reference = optionalString(row, "source_reference");
      if (reference !== null) resource.sourceReference = reference;
      return resource;
    });
  }

  private async loadTasks(jobId: string): Promise<ProcurementLocationTask[]> {
    const result = await this.executor.query(
      `SELECT id, job_id, location_id, work_category, task_name, task_description, source_reference
       FROM job_location_tasks
       WHERE job_id = $1
       ORDER BY created_at`,
      [jobId],
    );
    return result.rows.map((row) => ({
      id: requiredString(row, "id"),
      jobId: requiredString(row, "job_id"),
      locationId: requiredString(row, "location_id"),
      workCategory: requiredString(row, "work_category"),
      taskName: requiredString(row, "task_name"),
      taskDescription: optionalString(row, "task_description"),
      sourceReference: optionalString(row, "source_reference"),
    }));
  }

  private async loadLocations(jobId: string): Promise<ProcurementLocation[]> {
    const result = await this.executor.query(
      `SELECT id, job_id, name FROM job_locations WHERE job_id = $1 ORDER BY created_at`,
      [jobId],
    );
    return result.rows.map((row) => ({
      id: requiredString(row, "id"),
      jobId: requiredString(row, "job_id"),
      name: requiredString(row, "name"),
    }));
  }

  private async loadAssignments(jobId: string): Promise<ProcurementAssignment[]> {
    const result = await this.executor.query(
      `SELECT id, job_id, location_id, location_task_id, start_date, end_date
       FROM job_assignments
       WHERE job_id = $1 AND location_id IS NOT NULL AND location_task_id IS NOT NULL
       ORDER BY start_date`,
      [jobId],
    );
    return result.rows.map((row) => ({
      id: requiredString(row, "id"),
      jobId: optionalString(row, "job_id"),
      locationId: optionalString(row, "location_id"),
      locationTaskId: optionalString(row, "location_task_id"),
      startDate: requiredString(row, "start_date"),
      endDate: requiredString(row, "end_date"),
    }));
  }

  private async loadActuals(jobId: string): Promise<ActualPurchaseInput[]> {
    const result = await this.executor.query(
      `SELECT id, job_id, material_key, material_description, supplier_name,
              supplier_unit_price, actual_quantity, actual_total, purchase_date,
              payment_status, notes
       FROM job_material_cost_actuals
       WHERE job_id = $1`,
      [jobId],
    );
    return result.rows.map((row) => ({
      id: requiredString(row, "id"),
      jobId: requiredString(row, "job_id"),
      materialKey: optionalString(row, "material_key"),
      materialDescription: requiredString(row, "material_description"),
      supplierName: optionalString(row, "supplier_name"),
      supplierUnitPrice: requiredString(row, "supplier_unit_price"),
      actualQuantity: requiredString(row, "actual_quantity"),
      actualTotal: requiredString(row, "actual_total"),
      purchaseDate: optionalString(row, "purchase_date"),
      paymentStatus: requiredString(row, "payment_status"),
      notes: optionalString(row, "notes"),
    }));
  }

  private async loadConfirmations(jobId: string): Promise<QuantityConfirmationInput[]> {
    const result = await this.executor.query(
      `SELECT id, job_id, location_task_id, material_key, material_description,
              confirmed_quantity, unit, confirmed_by, confirmed_at, notes
       FROM job_location_task_material_confirmations
       WHERE job_id = $1`,
      [jobId],
    );
    return result.rows.map((row) => {
      const confirmation: QuantityConfirmationInput = {
        locationTaskId: requiredString(row, "location_task_id"),
        materialKey: requiredString(row, "material_key"),
        confirmedQuantity: requiredString(row, "confirmed_quantity"),
      };
      const description = optionalString(row, "material_description");
      if (description !== null) confirmation.materialDescription = description;
      const unit = optionalString(row, "unit");
      if (unit !== null) confirmation.unit = unit;
      return confirmation;
    });
  }
}

// ─── Router ─────────────────────────────────────────────────────────────────

export interface JarvisReadApiRouteOptions {
  readonly enabled: boolean;
  readonly repository: JarvisReadRepository;
  readonly keyLookup: IntegrationKeyLookup;
  readonly nonceLookup: IntegrationNonceLookup;
  readonly nonceStore: (keyId: string, nonce: string) => void | Promise<void>;
  readonly now?: () => number;
}

export function createJarvisReadApiRouter(options: JarvisReadApiRouteOptions): Router {
  const router = express.Router();
  if (!options.enabled) return router;

  const authenticate = async (request: express.Request): Promise<{ ok: true } | { ok: false; code: string }> => {
    const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.from([]);
    const query = canonicalQuery(request.query);
    const authenticated = await verifyMachineAuthentication({
      headers: request.headers as MachineAuthHeaders,
      rawBody,
      keyLookup: options.keyLookup,
      nonceLookup: options.nonceLookup,
      now: options.now,
      query,
    });
    if (!authenticated.authenticated) {
      return { ok: false, code: authenticated.code };
    }
    await options.nonceStore(authenticated.keyId, authenticated.nonce);
    return { ok: true };
  };

  const guard = (
    handler: (request: express.Request, response: express.Response) => Promise<void>,
  ): express.RequestHandler => {
    return async (request, response) => {
      const auth = await authenticate(request);
      if (!auth.ok) {
        response.status(401).json({ error: "Unauthorized", code: auth.code });
        return;
      }
      await handler(request, response);
    };
  };

  router.use(express.raw({ type: "application/json", limit: "64kb" }));

  router.get(
    JARVIS_JOBS_ROUTE,
    guard(async (request, response) => {
      const search = typeof request.query.search === "string" ? request.query.search : undefined;
      response.json(await options.repository.listJobs(search));
    }),
  );

  router.get(
    `${JARVIS_JOBS_ROUTE}/:jobId/materials`,
    guard(async (request, response) => {
      const days = parseDays(request.query.days);
      const jobId = request.params.jobId;
      const available = await options.repository.getMaterials(jobId, days, new Date(options.now?.() ?? Date.now()));
      if (available === undefined) {
        response.status(404).json({ error: "Job not found", code: "job_not_found" });
        return;
      }
      response.json(available);
    }),
  );

  router.get(
    `${JARVIS_JOBS_ROUTE}/:jobId`,
    guard(async (request, response) => {
      const jobId = request.params.jobId;
      const overview = await options.repository.getJobOverview(jobId);
      if (overview === undefined) {
        response.status(404).json({ error: "Job not found", code: "job_not_found" });
        return;
      }
      response.json(overview);
    }),
  );

  router.get(
    JARVIS_SCHEDULE_ROUTE,
    guard(async (request, response) => {
      const days = parseDays(request.query.days);
      response.json(await options.repository.getSchedule(days, new Date(options.now?.() ?? Date.now())));
    }),
  );

  router.get(
    JARVIS_WEEKLY_BUYING_DASHBOARD_ROUTE,
    guard(async (request, response) => {
      const days = parseDays(request.query.days);
      response.json(
        await options.repository.getWeeklyBuyingDashboard(days, new Date(options.now?.() ?? Date.now())),
      );
    }),
  );

  return router;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toJobListItem(row: IntegrationSqlRow): JarvisJobListItem {
  return {
    jobId: requiredString(row, "id"),
    jobName: requiredString(row, "title"),
    clientId: optionalString(row, "client_id"),
    clientName: optionalString(row, "client_name"),
    address: optionalString(row, "address") ?? optionalString(row, "location"),
    postcode: optionalString(row, "postcode"),
    status: requiredString(row, "status"),
  };
}

function toMaterialsUsedRow(row: any): MaterialsUsedRow {
  return {
    buildPhase: row.build_phase,
    description: row.description,
    unitRate: toNumber(row.unit_rate),
    unit: row.unit,
    qtyExcludingWastage: toNumber(row.qty_excluding_wastage),
    wastageQty: toNumber(row.wastage_qty),
    orderQtyIncludingWastage: toNumber(row.order_qty_including_wastage),
    costExcludingWastage: toNumber(row.cost_excluding_wastage),
    wastageCost: toNumber(row.wastage_cost),
    totalCostIncludingWastage: toNumber(row.total_cost_including_wastage),
  };
}

function toJarvisMaterialItem(item: WeeklyBuyingItem): JarvisMaterialItem {
  const state: MaterialBusinessState = item.needsConfirmation
    ? "CONFIRM_QTY"
    : item.isPriced
      ? "READY_TO_BUY"
      : "PRICE_NEEDED";

  const room = item.neededForRooms[0] ?? "";
  const parsed = parseRoomAndPackage(room);

  return {
    materialDescription: item.description,
    room: parsed.room,
    locationTaskIds: item.locationTaskIds,
    unit: item.unit,
    quantityNeeded: item.qtyNeeded,
    hbxlUnitRate: item.unitRate,
    plannedBudget: item.hbxlBudget,
    purchasedQuantity: item.qtyBought,
    stillToBuyQuantity: item.stillToBuyQty,
    state,
    ...(parsed.workPackage ? { workPackage: parsed.workPackage } : {}),
  };
}

function parseRoomAndPackage(value: string): { room: string; workPackage?: string } {
  const separatorIndex = value.lastIndexOf(" — ");
  if (separatorIndex < 0) return { room: value };
  return {
    room: value.slice(0, separatorIndex).trim(),
    workPackage: value.slice(separatorIndex + 3).trim() || undefined,
  };
}

function canonicalQuery(query: Record<string, unknown>): string | undefined {
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") entries.push([key, item]);
      }
    } else if (typeof value === "string") {
      entries.push([key, value]);
    }
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  if (entries.length === 0) return undefined;
  return entries.map(([key, value]) => `${key}=${value}`).join("&");
}

function parseDays(value: unknown): number {
  const days = Number(value);
  if (!Number.isFinite(days) || days < 1 || days > 365) return 7;
  return Math.floor(days);
}

function deriveWindow(days: number, today: Date) {
  const startMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return { start: startMs, end: startMs + (days - 1) * DAY_MS };
}

function windowPeriod(days: number, today: Date) {
  const { start, end } = deriveWindow(days, today);
  return {
    start: new Date(start).toISOString().slice(0, 10),
    end: new Date(end).toISOString().slice(0, 10),
    days,
  };
}

function dateValue(value: string): number {
  const normalized = value.trim();
  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  const british = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : british
      ? { year: Number(british[3]), month: Number(british[2]), day: Number(british[1]) }
      : null;
  if (!parts) return Number.NaN;
  const result = Date.UTC(parts.year, parts.month - 1, parts.day);
  const date = new Date(result);
  return date.getUTCFullYear() === parts.year && date.getUTCMonth() === parts.month - 1 && date.getUTCDate() === parts.day
    ? result
    : Number.NaN;
}

function assignmentInWindow(assignment: ProcurementAssignment, days: number, today: Date): boolean {
  const { start, end } = deriveWindow(days, today);
  return overlapsWindow(assignment.startDate, assignment.endDate, start, end);
}

function overlapsWindow(startRaw: string | null | undefined, endRaw: string | null | undefined, start: number, end: number): boolean {
  const startValue = startRaw ? dateValue(startRaw) : Number.NaN;
  const endValue = endRaw ? dateValue(endRaw) : Number.NaN;
  return Number.isFinite(startValue) && Number.isFinite(endValue) && startValue <= endValue && startValue <= end && endValue >= start;
}

function contractorNames(value: unknown): string[] {
  if (typeof value !== "string" || value.trim().length === 0) return [];
  return [value.trim()];
}

function requiredString(row: IntegrationSqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid jarvis read API column: ${column}`);
  }
  return value;
}

function optionalString(row: IntegrationSqlRow, column: string): string | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length > 0 ? text : null;
}

function optionalNullableString(row: IntegrationSqlRow, column: string): string | null | undefined {
  return optionalString(row, column) ?? undefined;
}

function requiredValueKind(value: unknown): ProcurementStructuredResource["sourceValueKind"] {
  if (value === "quantity" || value === "currency_unclassified" || value === "blank") return value;
  throw new Error("Invalid source_value_kind");
}

function requiredNumber(value: unknown): number {
  const num = Number(value);
  if (!Number.isInteger(num)) throw new Error("Expected integer");
  return num;
}

function countValue(result: { rows: readonly IntegrationSqlRow[] }, column: string): number {
  const value = result.rows[0]?.[column];
  const num = Number(value);
  return Number.isInteger(num) ? num : 0;
}

function toNumber(value: unknown): number {
  const num = Number(value ?? "0");
  return Number.isFinite(num) ? num : 0;
}
