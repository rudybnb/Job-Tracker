import { createHash, randomUUID } from "node:crypto";
import { validateApprovedChangeOrder } from "./integration-contracts.ts";
import type { ApprovedChangeSnapshot } from "./integration-shadow-repository.ts";
import type {
  IntegrationSqlExecutor,
  IntegrationSqlQueryResult,
  IntegrationSqlRow,
} from "./integration-shadow-sql-repository.ts";

export type ApplicationStatus =
  | "pending_mapping"
  | "ready"
  | "applied"
  | "blocked_no_mapping"
  | "already_applied"
  | "not_approved";

export interface IntegrationProjectMapping {
  readonly project_integration_id: string;
  readonly job_id: string;
  readonly mapped_by: string;
  readonly mapped_at: string;
}

export interface ChangeOrderApplicationRecord {
  readonly application_id: string;
  readonly change_order_id: string;
  readonly revision: number;
  readonly receipt_id: string;
  readonly event_id: string;
  readonly project_integration_id: string;
  readonly applied_to_job_id?: string;
  readonly applied_by?: string;
  readonly applied_at?: string;
  readonly title: string;
  readonly approved_amount_minor: number;
  readonly currency: string;
  readonly approved_snapshot_hash: string;
  readonly status: ApplicationStatus;
  readonly records_touched?: string;
}

export interface ApplicationReadiness {
  readonly change_order_id: string;
  readonly revision: number;
  readonly project_integration_id: string;
  readonly title: string;
  readonly currency: string;
  readonly approved_amount_minor: number;
  readonly review_status: string | null;
  readonly review_approved: boolean;
  readonly mapping?: IntegrationProjectMapping;
  readonly application?: ChangeOrderApplicationRecord;
  readonly status: ApplicationStatus;
}

export interface CreateApplicationRecordInput {
  readonly change_order_id: string;
  readonly revision: number;
  readonly created_by: string;
  readonly created_at: string;
  readonly application_id?: string;
}

export type CreateApplicationRecordResult =
  | { readonly outcome: "change_not_found" }
  | { readonly outcome: "not_approved" }
  | { readonly outcome: "already_applied" }
  | { readonly outcome: "blocked_no_mapping" }
  | { readonly outcome: "ready" };

export interface CreateProjectMappingInput {
  readonly project_integration_id: string;
  readonly job_id: string;
  readonly mapped_by: string;
  readonly mapped_at: string;
}

export type CreateProjectMappingResult =
  | { readonly outcome: "created"; readonly mapping: IntegrationProjectMapping }
  | { readonly outcome: "already_exists"; readonly mapping: IntegrationProjectMapping }
  | { readonly outcome: "invalid_input" }
  | { readonly outcome: "job_not_found" };

export interface ApplyApplicationInput {
  readonly change_order_id: string;
  readonly revision: number;
  readonly applied_by: string;
  readonly applied_at: string;
}

export type ApplyApplicationResult =
  | { readonly outcome: "change_not_found" }
  | { readonly outcome: "not_approved" }
  | { readonly outcome: "blocked_no_mapping" }
  | { readonly outcome: "job_not_found" }
  | { readonly outcome: "invalid_phase_task_data" }
  | { readonly outcome: "already_applied" }
  | {
      readonly outcome: "applied";
      readonly application_id: string;
      readonly applied_to_job_id: string;
    };

export interface IntegrationChangeOrderApplicationRepository {
  getReadiness(
    changeOrderId: string,
    revision: number,
  ): Promise<ApplicationReadiness | undefined>;
  createApplicationRecord(input: CreateApplicationRecordInput): Promise<CreateApplicationRecordResult>;
  createProjectMapping(input: CreateProjectMappingInput): Promise<CreateProjectMappingResult>;
  applyApplication(input: ApplyApplicationInput): Promise<ApplyApplicationResult>;
}

export interface SqlApplicationRepositoryOptions {
  readonly executor: IntegrationSqlExecutor;
  readonly jobExists: (jobId: string) => Promise<boolean>;
  readonly applicationId?: () => string;
}

const FIND_APPROVAL_CONTEXT_SQL = `
  SELECT c.receipt_id,
         c.event_id,
         c.change_order_id,
         c.revision,
         c.project_integration_id,
         c.approved_snapshot,
         rc.received_at,
         r.review_status
  FROM integration_shadow_changes c
  INNER JOIN integration_shadow_receipts rc ON rc.receipt_id = c.receipt_id
  LEFT JOIN integration_shadow_reviews r
    ON r.change_order_id = c.change_order_id AND r.revision = c.revision
  WHERE rc.result = 'accepted' AND c.change_order_id = $1 AND c.revision = $2
`;

const FIND_MAPPING_SQL = `
  SELECT project_integration_id, job_id, mapped_by, mapped_at
  FROM integration_project_mapping
  WHERE project_integration_id = $1
`;

const INSERT_MAPPING_SQL = `
  INSERT INTO integration_project_mapping (
    project_integration_id,
    job_id,
    mapped_by,
    mapped_at
  ) VALUES ($1, $2, $3, $4)
  ON CONFLICT (project_integration_id) DO NOTHING
  RETURNING project_integration_id
`;

const FIND_APPLICATION_SQL = `
  SELECT application_id,
         change_order_id,
         revision,
         receipt_id,
         event_id,
         project_integration_id,
         applied_to_job_id,
         applied_by,
         applied_at,
         title,
         approved_amount_minor,
         currency,
         approved_snapshot_hash,
         result,
         records_touched
  FROM integration_change_order_applications
  WHERE change_order_id = $1 AND revision = $2
`;

const FIND_APPLICATION_FOR_UPDATE_SQL = `
  SELECT application_id,
         change_order_id,
         revision,
         receipt_id,
         event_id,
         project_integration_id,
         applied_to_job_id,
         applied_by,
         applied_at,
         title,
         approved_amount_minor,
         currency,
         approved_snapshot_hash,
         result,
         records_touched
  FROM integration_change_order_applications
  WHERE change_order_id = $1 AND revision = $2
  FOR UPDATE
`;

const FIND_JOB_FOR_UPDATE_SQL = `
  SELECT id,
         notes,
         phases,
         phase_task_data
  FROM jobs
  WHERE id = $1
  FOR UPDATE
`;

const UPDATE_JOB_APPEND_SQL = `
  UPDATE jobs
  SET notes = $1,
      phases = $2,
      phase_task_data = $3
  WHERE id = $4
`;

const UPDATE_APPLICATION_APPLIED_SQL = `
  UPDATE integration_change_order_applications
  SET result = 'applied',
      applied_by = $1,
      applied_at = $2,
      records_touched = $3
  WHERE change_order_id = $4 AND revision = $5 AND result <> 'applied'
  RETURNING application_id
`;

const INSERT_APPLICATION_SQL = `
  INSERT INTO integration_change_order_applications (
    application_id,
    change_order_id,
    revision,
    receipt_id,
    event_id,
    project_integration_id,
    applied_to_job_id,
    applied_by,
    applied_at,
    title,
    approved_amount_minor,
    currency,
    approved_snapshot_hash,
    result,
    records_touched
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
  ON CONFLICT (change_order_id, revision) DO NOTHING
  RETURNING application_id
`;

function requiredString(row: IntegrationSqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid change-order application column: ${column}`);
  }
  return value;
}

function optionalText(row: IntegrationSqlRow, column: string): string | undefined {
  const value = row[column];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) return undefined;
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
    throw new Error("Invalid change-order application timestamp");
  }
  if (timestamp === undefined || Number.isNaN(timestamp.getTime())) {
    throw new Error("Invalid change-order application timestamp");
  }
  return timestamp.toISOString();
}

function optionalTimestamp(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return toIsoTimestamp(value);
}

function requiredRevision(row: IntegrationSqlRow): number {
  const value = row.revision;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error("Invalid change-order application revision");
  }
  return value;
}

function requiredMinor(row: IntegrationSqlRow): number {
  const value = row.approved_amount_minor;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  throw new Error("Invalid change-order application amount");
}

function applicationStatusOf(value: unknown): ApplicationStatus {
  if (
    value === "pending_mapping" ||
    value === "ready" ||
    value === "applied" ||
    value === "blocked_no_mapping" ||
    value === "already_applied" ||
    value === "not_approved"
  ) {
    return value;
  }
  throw new Error("Invalid change-order application status");
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

function snapshotHash(snapshot: ApprovedChangeSnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function changeOrderPhaseKey(changeOrderId: string, revision: number): string {
  return `CO ${changeOrderId} rev ${revision}`;
}

function buildNotesBlock(input: {
  readonly change_order_id: string;
  readonly revision: number;
  readonly title: string;
  readonly scope: string;
  readonly applied_at: string;
  readonly applied_by: string;
}): string {
  return [
    "",
    "",
    `=== Jarvis Change Order ${input.change_order_id} rev ${input.revision} ===`,
    `Title: ${input.title}`,
    `Scope: ${input.scope}`,
    `Applied: ${input.applied_at} by ${input.applied_by}`,
  ].join("\n");
}

function appendPhaseName(
  existing: unknown,
  phaseKey: string,
): { readonly value: string; readonly appended: boolean } {
  const parts =
    typeof existing === "string" && existing.trim().length > 0
      ? existing.split(",").map((part) => part.trim()).filter((part) => part.length > 0)
      : [];
  if (parts.includes(phaseKey)) return { value: parts.join(", "), appended: false };
  parts.push(phaseKey);
  return { value: parts.join(", "), appended: true };
}

function parsePhaseTaskDataValue(value: unknown):
  | { readonly success: true; readonly value: Record<string, unknown> }
  | { readonly success: false } {
  if (value === null || value === undefined) return { success: true, value: {} };
  let candidate: unknown = value;
  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    if (trimmed.length === 0 || trimmed === "{}") return { success: true, value: {} };
    try {
      candidate = JSON.parse(trimmed);
    } catch {
      return { success: false };
    }
  }
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { success: false };
  }
  return { success: true, value: candidate as Record<string, unknown> };
}

function firstContextRow(
  result: IntegrationSqlQueryResult,
): { row: IntegrationSqlRow; snapshot: ApprovedChangeSnapshot } | undefined {
  const row = result.rows[0];
  if (row === undefined) return undefined;
  const snapshot = parseSnapshot(row.approved_snapshot);
  if (snapshot === undefined) return undefined;
  return { row, snapshot };
}

function mapMapping(row: IntegrationSqlRow): IntegrationProjectMapping {
  return {
    project_integration_id: requiredString(row, "project_integration_id"),
    job_id: requiredString(row, "job_id"),
    mapped_by: requiredString(row, "mapped_by"),
    mapped_at: toIsoTimestamp(row.mapped_at),
  };
}

function mapApplication(row: IntegrationSqlRow): ChangeOrderApplicationRecord {
  const appliedToJobId = optionalText(row, "applied_to_job_id");
  const appliedBy = optionalText(row, "applied_by");
  const appliedAt = optionalTimestamp(row.applied_at);
  const recordsTouched = optionalText(row, "records_touched");
  return {
    application_id: requiredString(row, "application_id"),
    change_order_id: requiredString(row, "change_order_id"),
    revision: requiredRevision(row),
    receipt_id: requiredString(row, "receipt_id"),
    event_id: requiredString(row, "event_id"),
    project_integration_id: requiredString(row, "project_integration_id"),
    title: requiredString(row, "title"),
    approved_amount_minor: requiredMinor(row),
    currency: requiredString(row, "currency"),
    approved_snapshot_hash: requiredString(row, "approved_snapshot_hash"),
    status: applicationStatusOf(row.result),
    ...(appliedToJobId === undefined ? {} : { applied_to_job_id: appliedToJobId }),
    ...(appliedBy === undefined ? {} : { applied_by: appliedBy }),
    ...(appliedAt === undefined ? {} : { applied_at: appliedAt }),
    ...(recordsTouched === undefined ? {} : { records_touched: recordsTouched }),
  };
}

function readinessOf(
  row: IntegrationSqlRow,
  snapshot: ApprovedChangeSnapshot,
  mapping: IntegrationProjectMapping | undefined,
  application: ChangeOrderApplicationRecord | undefined,
): ApplicationReadiness {
  const reviewStatus = optionalText(row, "review_status");
  const reviewApproved = reviewStatus === "approved";
  let status: ApplicationStatus;
  if (!reviewApproved) {
    status = "not_approved";
  } else if (application !== undefined) {
    status = application.status;
  } else if (mapping !== undefined) {
    status = "ready";
  } else {
    status = "pending_mapping";
  }
  return {
    change_order_id: requiredString(row, "change_order_id"),
    revision: requiredRevision(row),
    project_integration_id: requiredString(row, "project_integration_id"),
    title: snapshot.title,
    currency: snapshot.currency,
    approved_amount_minor: snapshot.approved_amount_minor,
    review_status: reviewStatus ?? null,
    review_approved: reviewApproved,
    status,
    ...(mapping === undefined ? {} : { mapping }),
    ...(application === undefined ? {} : { application }),
  };
}

export class SqlIntegrationChangeOrderApplicationRepository
  implements IntegrationChangeOrderApplicationRepository
{
  readonly #executor: IntegrationSqlExecutor;
  readonly #jobExists: (jobId: string) => Promise<boolean>;
  readonly #applicationId: () => string;

  constructor(options: SqlApplicationRepositoryOptions) {
    this.#executor = options.executor;
    this.#jobExists = options.jobExists;
    this.#applicationId = options.applicationId ?? randomUUID;
  }

  async getReadiness(
    changeOrderId: string,
    revision: number,
  ): Promise<ApplicationReadiness | undefined> {
    const context = firstContextRow(
      await this.#executor.query(FIND_APPROVAL_CONTEXT_SQL, [changeOrderId, revision]),
    );
    if (context === undefined) return undefined;
    const { row, snapshot } = context;

    const mapping = this.#findMapping(
      await this.#executor.query(FIND_MAPPING_SQL, [snapshot.project_integration_id]),
    );
    const application = this.#findApplication(
      await this.#executor.query(FIND_APPLICATION_SQL, [changeOrderId, revision]),
    );

    return readinessOf(row, snapshot, mapping, application);
  }

  async createApplicationRecord(
    input: CreateApplicationRecordInput,
  ): Promise<CreateApplicationRecordResult> {
    return this.#executor.transaction(async (transaction) => {
      const context = firstContextRow(
        await transaction.query(FIND_APPROVAL_CONTEXT_SQL, [
          input.change_order_id,
          input.revision,
        ]),
      );
      if (context === undefined) return { outcome: "change_not_found" as const };
      const { row, snapshot } = context;

      const reviewStatus = optionalText(row, "review_status");
      if (reviewStatus !== "approved") return { outcome: "not_approved" as const };

      const application = this.#findApplication(
        await transaction.query(FIND_APPLICATION_SQL, [
          input.change_order_id,
          input.revision,
        ]),
      );
      if (application !== undefined) return { outcome: "already_applied" as const };

      const mapping = this.#findMapping(
        await transaction.query(FIND_MAPPING_SQL, [snapshot.project_integration_id]),
      );
      if (mapping === undefined) return { outcome: "blocked_no_mapping" as const };

      const inserted = await transaction.query(INSERT_APPLICATION_SQL, [
        input.application_id ?? this.#applicationId(),
        input.change_order_id,
        input.revision,
        requiredString(row, "receipt_id"),
        requiredString(row, "event_id"),
        snapshot.project_integration_id,
        mapping.job_id,
        input.created_by,
        input.created_at,
        snapshot.title,
        snapshot.approved_amount_minor,
        snapshot.currency,
        snapshotHash(snapshot),
        "ready",
        null,
      ]);
      if (inserted.rows.length === 0) return { outcome: "already_applied" as const };
      return { outcome: "ready" as const };
    });
  }

  async createProjectMapping(input: CreateProjectMappingInput): Promise<CreateProjectMappingResult> {
    const projectIntegrationId = input.project_integration_id.trim();
    const jobId = input.job_id.trim();
    if (projectIntegrationId.length === 0 || jobId.length === 0) {
      return { outcome: "invalid_input" };
    }
    if (!(await this.#jobExists(jobId))) {
      return { outcome: "job_not_found" };
    }
    const existing = this.#findMapping(
      await this.#executor.query(FIND_MAPPING_SQL, [projectIntegrationId]),
    );
    if (existing !== undefined) return { outcome: "already_exists", mapping: existing };

    const inserted = await this.#executor.query(INSERT_MAPPING_SQL, [
      projectIntegrationId,
      jobId,
      input.mapped_by.trim(),
      input.mapped_at,
    ]);
    if (inserted.rows.length === 0) {
      const concurrent = this.#findMapping(
        await this.#executor.query(FIND_MAPPING_SQL, [projectIntegrationId]),
      );
      if (concurrent !== undefined) return { outcome: "already_exists", mapping: concurrent };
      throw new Error("Project mapping insert conflicted without an existing mapping");
    }
    return {
      outcome: "created",
      mapping: {
        project_integration_id: projectIntegrationId,
        job_id: jobId,
        mapped_by: input.mapped_by.trim(),
        mapped_at: toIsoTimestamp(input.mapped_at),
      },
    };
  }

  async applyApplication(input: ApplyApplicationInput): Promise<ApplyApplicationResult> {
    return this.#executor.transaction(async (transaction) => {
      const context = firstContextRow(
        await transaction.query(FIND_APPROVAL_CONTEXT_SQL, [
          input.change_order_id,
          input.revision,
        ]),
      );
      if (context === undefined) return { outcome: "change_not_found" as const };
      const { row, snapshot } = context;

      const reviewStatus = optionalText(row, "review_status");
      if (reviewStatus !== "approved") return { outcome: "not_approved" as const };

      const existingApplication = this.#findApplication(
        await transaction.query(FIND_APPLICATION_FOR_UPDATE_SQL, [
          input.change_order_id,
          input.revision,
        ]),
      );
      if (existingApplication !== undefined && existingApplication.status === "applied") {
        return { outcome: "already_applied" as const };
      }

      const mapping = this.#findMapping(
        await transaction.query(FIND_MAPPING_SQL, [snapshot.project_integration_id]),
      );
      if (mapping === undefined) return { outcome: "blocked_no_mapping" as const };

      const jobRow = (
        await transaction.query(FIND_JOB_FOR_UPDATE_SQL, [mapping.job_id])
      ).rows[0];
      if (jobRow === undefined) return { outcome: "job_not_found" as const };

      const parsedTaskData = parsePhaseTaskDataValue(jobRow.phase_task_data);
      if (!parsedTaskData.success) return { outcome: "invalid_phase_task_data" as const };

      const phaseKey = changeOrderPhaseKey(snapshot.change_order_id, snapshot.revision);
      const nextTaskData: Record<string, unknown> = { ...parsedTaskData.value };
      const existingTasks = nextTaskData[phaseKey];
      const existingTaskIds = new Set<string>();
      if (Array.isArray(existingTasks)) {
        for (const task of existingTasks) {
          const taskId = (task as { task_id?: unknown } | null | undefined)?.task_id;
          if (typeof taskId === "string") existingTaskIds.add(taskId);
        }
      }
      const tasksToAppend: Record<string, unknown>[] = [];
      for (const task of snapshot.tasks) {
        if (typeof task.task_id === "string" && existingTaskIds.has(task.task_id)) continue;
        existingTaskIds.add(task.task_id);
        tasksToAppend.push({
          task_id: task.task_id,
          task: task.title,
          description: task.instructions,
          quantity: task.quantity,
          unit: task.unit,
        });
      }
      if (Array.isArray(existingTasks)) {
        nextTaskData[phaseKey] = [...existingTasks, ...tasksToAppend];
      } else {
        nextTaskData[phaseKey] = tasksToAppend;
      }

      const existingNotes =
        typeof jobRow.notes === "string" ? jobRow.notes : "";
      const notesBlock = buildNotesBlock({
        change_order_id: snapshot.change_order_id,
        revision: snapshot.revision,
        title: snapshot.title,
        scope: snapshot.scope,
        applied_at: input.applied_at,
        applied_by: input.applied_by,
      });
      const nextNotes =
        existingNotes.length === 0 ? notesBlock.trimStart() : existingNotes + notesBlock;

      const phases = appendPhaseName(jobRow.phases, phaseKey);
      const recordsTouched = JSON.stringify({
        applied_to_job_id: mapping.job_id,
        notes_appended: true,
        phase_key: phaseKey,
        tasks_appended: tasksToAppend.length,
        phases_appended: phases.appended,
      });

      let applicationId: string;
      if (existingApplication === undefined) {
        const inserted = await transaction.query(INSERT_APPLICATION_SQL, [
          this.#applicationId(),
          input.change_order_id,
          input.revision,
          requiredString(row, "receipt_id"),
          requiredString(row, "event_id"),
          snapshot.project_integration_id,
          mapping.job_id,
          input.applied_by,
          input.applied_at,
          snapshot.title,
          snapshot.approved_amount_minor,
          snapshot.currency,
          snapshotHash(snapshot),
          "applied",
          recordsTouched,
        ]);
        if (inserted.rows.length === 0) return { outcome: "already_applied" as const };
        applicationId = requiredString(inserted.rows[0], "application_id");
      } else {
        const updated = await transaction.query(UPDATE_APPLICATION_APPLIED_SQL, [
          input.applied_by,
          input.applied_at,
          recordsTouched,
          input.change_order_id,
          input.revision,
        ]);
        applicationId = requiredString(updated.rows[0], "application_id");
      }

      await transaction.query(UPDATE_JOB_APPEND_SQL, [
        nextNotes,
        phases.value,
        JSON.stringify(nextTaskData),
        mapping.job_id,
      ]);

      return {
        outcome: "applied" as const,
        application_id: applicationId,
        applied_to_job_id: mapping.job_id,
      };
    });
  }

  #findMapping(result: IntegrationSqlQueryResult): IntegrationProjectMapping | undefined {
    const row = result.rows[0];
    return row === undefined ? undefined : mapMapping(row);
  }

  #findApplication(result: IntegrationSqlQueryResult): ChangeOrderApplicationRecord | undefined {
    const row = result.rows[0];
    return row === undefined ? undefined : mapApplication(row);
  }
}
