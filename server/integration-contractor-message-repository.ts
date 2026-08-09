import { validateApprovedChangeOrder } from "./integration-contracts.ts";
import type { ApprovedChangeOrder } from "./integration-contracts.ts";
import type {
  IntegrationSqlExecutor,
  IntegrationSqlQueryResult,
  IntegrationSqlRow,
} from "./integration-shadow-sql-repository.ts";

export type ContractorMessageStatus = "previewed" | "queued" | "sent" | "failed";

export interface ContractorMessageRow {
  readonly id: string;
  readonly application_id: string;
  readonly job_id: string;
  readonly change_order_id: string;
  readonly revision: number;
  readonly contractor_id: string;
  readonly phone_e164: string;
  readonly body: string;
  readonly preview_hash: string;
  readonly status: ContractorMessageStatus;
  readonly provider_message_id?: string;
  readonly confirmed_by?: string;
  readonly confirmed_at?: string;
  readonly created_at: string;
  readonly sent_at?: string;
  readonly error_code?: string;
}

export interface ContractorApplicationContext {
  readonly application_id: string;
  readonly change_order_id: string;
  readonly revision: number;
  readonly applied_to_job_id: string;
  readonly title: string;
  readonly job_title: string;
  readonly snapshot: ApprovedChangeOrder;
}

export interface ContractorIdentity {
  readonly contractor_id: string;
  readonly name: string;
  readonly phone?: string;
}

export type LoadApplicationContextResult =
  | { readonly found: true; readonly context: ContractorApplicationContext }
  | {
      readonly found: false;
      readonly reason:
        | "application_missing"
        | "not_applied"
        | "job_missing"
        | "invalid_snapshot";
    };

export interface NewPreviewInput {
  readonly id: string;
  readonly application_id: string;
  readonly job_id: string;
  readonly change_order_id: string;
  readonly revision: number;
  readonly contractor_id: string;
  readonly phone_e164: string;
  readonly body: string;
  readonly preview_hash: string;
  readonly created_at: string;
}

export interface MarkSentInput {
  readonly id: string;
  readonly provider_message_id: string;
  readonly confirmed_by: string;
  readonly confirmed_at: string;
  readonly sent_at: string;
}

export interface MarkFailedInput {
  readonly id: string;
  readonly error_code: string;
}

export interface IntegrationContractorMessageRepository {
  loadApplicationContext(applicationId: string): Promise<LoadApplicationContextResult>;
  loadContractor(contractorId: string): Promise<ContractorIdentity | undefined>;
  insertPreview(input: NewPreviewInput): Promise<ContractorMessageRow>;
  findLatestPreview(
    applicationId: string,
    contractorId: string,
  ): Promise<ContractorMessageRow | undefined>;
  markSent(input: MarkSentInput): Promise<ContractorMessageRow | undefined>;
  markFailed(input: MarkFailedInput): Promise<ContractorMessageRow | undefined>;
}

export interface SqlContractorMessageRepositoryOptions {
  readonly executor: IntegrationSqlExecutor;
}

const MESSAGE_COLUMNS = `
  id,
  application_id,
  job_id,
  change_order_id,
  revision,
  contractor_id,
  phone_e164,
  body,
  preview_hash,
  status,
  provider_message_id,
  confirmed_by,
  confirmed_at,
  created_at,
  sent_at,
  error_code
`;

const LOAD_APPLICATION_CONTEXT_SQL = `
  SELECT a.application_id,
         a.change_order_id,
         a.revision,
         a.applied_to_job_id,
         a.title,
         a.result,
         c.approved_snapshot,
         j.title AS job_title
  FROM integration_change_order_applications a
  INNER JOIN integration_shadow_changes c
    ON c.change_order_id = a.change_order_id AND c.revision = a.revision
  LEFT JOIN jobs j
    ON j.id = a.applied_to_job_id
  WHERE a.application_id = $1
`;

const CONTRACTOR_BY_ID_SQL = `
  SELECT id, name
  FROM contractors
  WHERE id = $1
`;

const CONTRACTOR_PHONE_SQL = `
  SELECT phone
  FROM contractor_applications
  WHERE status = 'approved'
    AND phone IS NOT NULL
    AND phone <> ''
    AND lower(trim(first_name || ' ' || last_name)) = lower(trim($1))
  ORDER BY submitted_at DESC
  LIMIT 1
`;

const INSERT_PREVIEW_SQL = `
  INSERT INTO contractor_messages (
    id,
    application_id,
    job_id,
    change_order_id,
    revision,
    contractor_id,
    direction,
    channel,
    phone_e164,
    body,
    preview_hash,
    status,
    created_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
  RETURNING id
`;

const FIND_LATEST_PREVIEW_SQL = `
  SELECT ${MESSAGE_COLUMNS}
  FROM contractor_messages
  WHERE application_id = $1 AND contractor_id = $2 AND status = 'previewed'
  ORDER BY created_at DESC
  LIMIT 1
`;

const FIND_MESSAGE_BY_ID_SQL = `
  SELECT ${MESSAGE_COLUMNS}
  FROM contractor_messages
  WHERE id = $1
`;

const MARK_SENT_SQL = `
  UPDATE contractor_messages
  SET status = 'sent',
      provider_message_id = $1,
      confirmed_by = $2,
      confirmed_at = $3,
      sent_at = $4
  WHERE id = $5 AND status = 'previewed'
  RETURNING id
`;

const MARK_FAILED_SQL = `
  UPDATE contractor_messages
  SET status = 'failed',
      error_code = $1
  WHERE id = $2 AND status = 'previewed'
  RETURNING id
`;

function requiredString(row: IntegrationSqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid contractor message column: ${column}`);
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
    throw new Error("Invalid contractor message timestamp");
  }
  if (timestamp === undefined || Number.isNaN(timestamp.getTime())) {
    throw new Error("Invalid contractor message timestamp");
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
    throw new Error("Invalid contractor message revision");
  }
  return value;
}

function messageStatusOf(value: unknown): ContractorMessageStatus {
  if (
    value === "previewed" ||
    value === "queued" ||
    value === "sent" ||
    value === "failed"
  ) {
    return value;
  }
  throw new Error("Invalid contractor message status");
}

function parseSnapshot(value: unknown): ApprovedChangeOrder | undefined {
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
  return validation.data;
}

function mapMessageRow(row: IntegrationSqlRow): ContractorMessageRow {
  const status = messageStatusOf(row.status);
  return {
    id: requiredString(row, "id"),
    application_id: requiredString(row, "application_id"),
    job_id: optionalText(row, "job_id") ?? "",
    change_order_id: requiredString(row, "change_order_id"),
    revision: requiredRevision(row),
    contractor_id: requiredString(row, "contractor_id"),
    phone_e164: requiredString(row, "phone_e164"),
    body: requiredString(row, "body"),
    preview_hash: requiredString(row, "preview_hash"),
    status,
    ...(optionalText(row, "provider_message_id") === undefined
      ? {}
      : { provider_message_id: optionalText(row, "provider_message_id") as string }),
    ...(optionalText(row, "confirmed_by") === undefined
      ? {}
      : { confirmed_by: optionalText(row, "confirmed_by") as string }),
    ...(optionalTimestamp(row.confirmed_at) === undefined
      ? {}
      : { confirmed_at: optionalTimestamp(row.confirmed_at) as string }),
    created_at: toIsoTimestamp(row.created_at),
    ...(optionalTimestamp(row.sent_at) === undefined
      ? {}
      : { sent_at: optionalTimestamp(row.sent_at) as string }),
    ...(optionalText(row, "error_code") === undefined
      ? {}
      : { error_code: optionalText(row, "error_code") as string }),
  };
}

export class SqlIntegrationContractorMessageRepository
  implements IntegrationContractorMessageRepository
{
  readonly #executor: IntegrationSqlExecutor;

  constructor(options: SqlContractorMessageRepositoryOptions) {
    this.#executor = options.executor;
  }

  async loadApplicationContext(
    applicationId: string,
  ): Promise<LoadApplicationContextResult> {
    const row = (await this.#executor.query(LOAD_APPLICATION_CONTEXT_SQL, [applicationId]))
      .rows[0];
    if (row === undefined) return { found: false, reason: "application_missing" };
    if (requiredString(row, "result") !== "applied") {
      return { found: false, reason: "not_applied" };
    }
    const appliedToJobId = optionalText(row, "applied_to_job_id");
    const jobTitle = optionalText(row, "job_title");
    if (appliedToJobId === undefined || jobTitle === undefined) {
      return { found: false, reason: "job_missing" };
    }
    const snapshot = parseSnapshot(row.approved_snapshot);
    if (snapshot === undefined) return { found: false, reason: "invalid_snapshot" };
    return {
      found: true,
      context: {
        application_id: requiredString(row, "application_id"),
        change_order_id: requiredString(row, "change_order_id"),
        revision: requiredRevision(row),
        applied_to_job_id: appliedToJobId,
        title: requiredString(row, "title"),
        job_title: jobTitle,
        snapshot,
      },
    };
  }

  async loadContractor(contractorId: string): Promise<ContractorIdentity | undefined> {
    const row = (await this.#executor.query(CONTRACTOR_BY_ID_SQL, [contractorId])).rows[0];
    if (row === undefined) return undefined;
    const name = requiredString(row, "name");
    const phoneRow = (await this.#executor.query(CONTRACTOR_PHONE_SQL, [name])).rows[0];
    const phone = phoneRow === undefined ? undefined : optionalText(phoneRow, "phone");
    return { contractor_id: contractorId, name, ...(phone === undefined ? {} : { phone }) };
  }

  async insertPreview(input: NewPreviewInput): Promise<ContractorMessageRow> {
    await this.#executor.query(INSERT_PREVIEW_SQL, [
      input.id,
      input.application_id,
      input.job_id,
      input.change_order_id,
      input.revision,
      input.contractor_id,
      "outbound",
      "whatsapp",
      input.phone_e164,
      input.body,
      input.preview_hash,
      "previewed",
      input.created_at,
    ]);
    return {
      id: input.id,
      application_id: input.application_id,
      job_id: input.job_id,
      change_order_id: input.change_order_id,
      revision: input.revision,
      contractor_id: input.contractor_id,
      phone_e164: input.phone_e164,
      body: input.body,
      preview_hash: input.preview_hash,
      status: "previewed",
      created_at: input.created_at,
    };
  }

  async findLatestPreview(
    applicationId: string,
    contractorId: string,
  ): Promise<ContractorMessageRow | undefined> {
    const row = (
      await this.#executor.query(FIND_LATEST_PREVIEW_SQL, [applicationId, contractorId])
    ).rows[0];
    return row === undefined ? undefined : mapMessageRow(row);
  }

  async markSent(input: MarkSentInput): Promise<ContractorMessageRow | undefined> {
    const updated = await this.#executor.query(MARK_SENT_SQL, [
      input.provider_message_id,
      input.confirmed_by,
      input.confirmed_at,
      input.sent_at,
      input.id,
    ]);
    if (updated.rows.length === 0) return undefined;
    const row = (await this.#executor.query(FIND_MESSAGE_BY_ID_SQL, [input.id])).rows[0];
    return row === undefined ? undefined : mapMessageRow(row);
  }

  async markFailed(input: MarkFailedInput): Promise<ContractorMessageRow | undefined> {
    const updated = await this.#executor.query(MARK_FAILED_SQL, [input.error_code, input.id]);
    if (updated.rows.length === 0) return undefined;
    const row = (await this.#executor.query(FIND_MESSAGE_BY_ID_SQL, [input.id])).rows[0];
    return row === undefined ? undefined : mapMessageRow(row);
  }
}
