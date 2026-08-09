import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { SqlIntegrationContractorMessageRepository } from "../server/integration-contractor-message-repository.ts";
import type {
  IntegrationSqlExecutor,
  IntegrationSqlQueryResult,
  IntegrationSqlRow,
  IntegrationSqlTransaction,
} from "../server/integration-shadow-sql-repository.ts";
import {
  SqlContractorMessageService,
  type ContractorMessageService,
} from "../server/integration-contractor-message-service.ts";
import {
  CONTRACTOR_MESSAGE_ROUTE,
  createContractorMessageRouter,
} from "../server/integration-contractor-message-route.ts";
import type {
  WhatsAppProvider,
  WhatsAppSendInput,
  WhatsAppSendResult,
} from "../server/whatsapp.ts";

function snapshotFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 1,
    event_id: "evt-msg-0001",
    event_type: "change_order.approved",
    producer: "jarvis",
    correlation_id: "corr-msg-0001",
    occurred_at: "2026-08-03T11:59:00.000Z",
    change_order_id: "co-msg-0001",
    revision: 1,
    project_integration_id: "project-msg-0001",
    title: "Approved message shadow change",
    scope: "Install new electrical supply.",
    approval_status: "approved",
    approved_at: "2026-08-03T11:58:00.000Z",
    approved_by_actor_id: "actor-msg-0042",
    currency: "GBP",
    approved_amount_minor: 250000,
    tasks: [
      {
        task_id: "task-msg-0001",
        title: "Run new supply cable",
        instructions: "Install conduit and cable to DB.",
        quantity: 12,
        unit: "m",
        approved_amount_minor: 20000,
      },
    ],
    ...overrides,
  };
}

interface ApplicationRow {
  application_id: string;
  change_order_id: string;
  revision: number;
  applied_to_job_id: string;
  title: string;
  result: string;
  approved_snapshot: string;
  job_title: string;
}

function applicationRowFixture(overrides: Partial<ApplicationRow> = {}): ApplicationRow {
  return {
    application_id: "application-msg-0001",
    change_order_id: "co-msg-0001",
    revision: 1,
    applied_to_job_id: "job-msg-0001",
    title: "Approved message shadow change",
    result: "applied",
    approved_snapshot: JSON.stringify(snapshotFixture()),
    job_title: "Job 49 Flat2 1 Bedroom",
    ...overrides,
  };
}

interface MessageRow {
  id: string;
  application_id: string;
  job_id: string;
  change_order_id: string;
  revision: number;
  contractor_id: string;
  phone_e164: string;
  body: string;
  preview_hash: string;
  status: string;
  delivery_status: string;
  provider_message_id: string | null;
  reply_to_provider_message_id: string | null;
  inbound_provider_message_id: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  acknowledged_at: string | null;
  error_code: string | null;
  unmatched_reason: string | null;
  direction: "outbound" | "inbound";
}

class InMemoryMessageExecutor implements IntegrationSqlExecutor {
  applications: ApplicationRow[] = [];
  contractors: { id: string; name: string }[] = [];
  contractorPhones: { name: string; phone: string }[] = [];
  messages: MessageRow[] = [];
  readonly queries: string[] = [];
  fail = false;

  async query(sql: string, parameters: readonly unknown[]): Promise<IntegrationSqlQueryResult> {
    this.queries.push(sql);
    if (this.fail) throw new Error("offline message executor failure");

    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.includes("from integration_change_order_applications a")) {
      const [applicationId] = parameters;
      const row = this.applications.find((app) => app.application_id === applicationId);
      return { rows: row === undefined ? [] : [{ ...row }] };
    }

    if (normalized.startsWith("select id, name from contractors")) {
      const [contractorId] = parameters;
      const row = this.contractors.find((contractor) => contractor.id === contractorId);
      return { rows: row === undefined ? [] : [{ ...row }] };
    }

    if (normalized.includes("from contractors c") && normalized.includes("inner join lateral")) {
      const [jobId] = parameters;
      const rows = this.contractors
        .map((contractor) => {
          const phone = this.contractorPhones.find(
            (candidate) => candidate.name.toLowerCase().trim() === contractor.name.toLowerCase().trim(),
          )?.phone;
          if (phone === undefined || phone.length === 0) return undefined;
          return {
            contractor_id: contractor.id,
            name: contractor.name,
            phone,
            assigned_job_id: jobId === "job-msg-0001" && contractor.id === CONTRACTOR_ID ? jobId : null,
            assigned_job_title: jobId === "job-msg-0001" && contractor.id === CONTRACTOR_ID ? "Job 49 Flat2 1 Bedroom" : null,
          };
        })
        .filter((candidate): candidate is IntegrationSqlRow => candidate !== undefined);
      return { rows };
    }

    if (normalized.includes("from contractor_applications")) {
      const [name] = parameters;
      const match = this.contractorPhones.find(
        (candidate) =>
          candidate.name.toLowerCase().trim() === String(name).toLowerCase().trim(),
      );
      return { rows: match === undefined ? [] : [{ phone: match.phone }] };
    }

    if (normalized.startsWith("insert into contractor_messages") && normalized.includes("'inbound'")) {
      const [
        id,
        applicationId,
        jobId,
        changeOrderId,
        revision,
        contractorId,
        phoneE164,
        body,
        replyToProviderMessageId,
        inboundProviderMessageId,
        createdAt,
        unmatchedReason,
      ] = parameters as [
        string, string | null, string | null, string | null, number | null, string | null,
        string, string, string | null, string, string, string | null,
      ];
      if (this.messages.some((message) => message.inbound_provider_message_id === inboundProviderMessageId)) {
        return { rows: [] };
      }
      this.messages.push({
        id,
        application_id: applicationId ?? "",
        job_id: jobId ?? "",
        change_order_id: changeOrderId ?? "",
        revision: revision ?? 0,
        contractor_id: contractorId ?? "",
        phone_e164: phoneE164,
        body,
        preview_hash: "",
        status: "received",
        delivery_status: "none",
        provider_message_id: null,
        reply_to_provider_message_id: replyToProviderMessageId,
        inbound_provider_message_id: inboundProviderMessageId,
        confirmed_by: null,
        confirmed_at: null,
        created_at: createdAt,
        sent_at: null,
        delivered_at: null,
        read_at: null,
        acknowledged_at: null,
        error_code: null,
        unmatched_reason: unmatchedReason,
        direction: "inbound",
      });
      return { rows: [{ id }] };
    }

    if (normalized.startsWith("insert into contractor_messages")) {
      const [
        id,
        applicationId,
        jobId,
        changeOrderId,
        revision,
        contractorId,
        _direction,
        _channel,
        phoneE164,
        body,
        previewHash,
        status,
        createdAt,
      ] = parameters as [
        string, string, string, string, number, string, string, string,
        string, string, string, string, string,
      ];
      this.messages.push({
        id,
        application_id: applicationId,
        job_id: jobId,
        change_order_id: changeOrderId,
        revision,
        contractor_id: contractorId,
        phone_e164: phoneE164,
        body,
        preview_hash: previewHash,
        status,
        delivery_status: "none",
        provider_message_id: null,
        reply_to_provider_message_id: null,
        inbound_provider_message_id: null,
        confirmed_by: null,
        confirmed_at: null,
        created_at: createdAt,
        sent_at: null,
        delivered_at: null,
        read_at: null,
        acknowledged_at: null,
        error_code: null,
        unmatched_reason: null,
        direction: "outbound",
      });
      return { rows: [{ id }] };
    }

    if (normalized.startsWith("update contractor_messages set status = 'sent'")) {
      const [providerMessageId, confirmedBy, confirmedAt, sentAt, id] = parameters;
      const message = this.messages.find(
        (candidate) => candidate.id === id && candidate.status === "previewed",
      );
      if (message === undefined) return { rows: [] };
      message.status = "sent";
      message.delivery_status = "sent";
      message.provider_message_id = providerMessageId as string;
      message.confirmed_by = confirmedBy as string;
      message.confirmed_at = confirmedAt as string;
      message.sent_at = sentAt as string;
      return { rows: [{ id }] };
    }

    if (normalized.startsWith("select id") && normalized.includes("where direction = 'outbound' and provider_message_id")) {
      const [providerMessageId] = parameters;
      const row = this.messages.find(
        (message) => message.provider_message_id === providerMessageId && message.inbound_provider_message_id === null,
      );
      return { rows: row === undefined ? [] : [{ ...row }] };
    }

    if (normalized.startsWith("update contractor_messages set delivery_status = case")) {
      const [nextStatus, occurredAt, errorCode, providerMessageId] = parameters as [string, string, string | null, string];
      const message = this.messages.find(
        (candidate) => candidate.provider_message_id === providerMessageId && candidate.inbound_provider_message_id === null,
      );
      if (message === undefined) return { rows: [] };
      const rank: Record<string, number> = { none: 0, sent: 1, failed: 1, delivered: 2, read: 3 };
      if (rank[nextStatus] >= rank[message.delivery_status] && message.delivery_status !== "read") {
        message.delivery_status = nextStatus;
      }
      if ((nextStatus === "delivered" || nextStatus === "read") && message.delivered_at === null) {
        message.delivered_at = occurredAt;
      }
      if (nextStatus === "read" && message.read_at === null) {
        message.read_at = occurredAt;
      }
      if (nextStatus === "failed" && errorCode !== null) {
        message.error_code = errorCode;
      }
      return { rows: [{ id: message.id }] };
    }

    if (normalized.startsWith("update contractor_messages set acknowledged_at")) {
      const [acknowledgedAt, providerMessageId] = parameters;
      const message = this.messages.find(
        (candidate) => candidate.provider_message_id === providerMessageId && candidate.inbound_provider_message_id === null,
      );
      if (message !== undefined && message.acknowledged_at === null) {
        message.acknowledged_at = acknowledgedAt as string;
      }
      return { rows: [] };
    }

    if (normalized.includes("where inbound_provider_message_id = $1")) {
      const [providerMessageId] = parameters;
      const row = this.messages.find((message) => message.inbound_provider_message_id === providerMessageId);
      return { rows: row === undefined ? [] : [{ id: row.id }] };
    }

    if (normalized.includes("regexp_replace(phone_e164")) {
      const [phoneE164, limit] = parameters;
      const digits = String(phoneE164).replace(/\D/g, "");
      const rows = this.messages
        .filter(
          (message) =>
            message.inbound_provider_message_id === null &&
            message.status === "sent" &&
            message.phone_e164.replace(/\D/g, "") === digits,
        )
        .sort((a, b) => (b.sent_at ?? b.created_at).localeCompare(a.sent_at ?? a.created_at))
        .slice(0, Number(limit))
        .map((message) => ({ ...message }));
      return { rows };
    }

    if (normalized.startsWith("update contractor_messages set status = 'failed'")) {
      const [errorCode, id] = parameters;
      const message = this.messages.find(
        (candidate) => candidate.id === id && candidate.status === "previewed",
      );
      if (message === undefined) return { rows: [] };
      message.status = "failed";
      message.error_code = errorCode as string;
      return { rows: [{ id }] };
    }

    if (
      normalized.startsWith("select id,") &&
      normalized.includes("from contractor_messages") &&
      normalized.includes("status = 'previewed'")
    ) {
      const [applicationId, contractorId] = parameters;
      const rows = this.messages
        .filter(
          (message) =>
            message.application_id === applicationId &&
            message.contractor_id === contractorId &&
            message.status === "previewed",
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 1)
        .map((message) => ({ ...message }));
      return { rows };
    }

    if (normalized.includes("from contractor_messages m") && normalized.includes("where m.application_id = $1")) {
      const [applicationId] = parameters;
      const rows = this.messages
        .filter((message) => message.application_id === applicationId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((message) => ({
          ...message,
          contractor_name: this.contractors.find((contractor) => contractor.id === message.contractor_id)?.name ?? null,
        }));
      return { rows };
    }

    if (normalized.includes("from contractor_messages m") && normalized.includes("m.unmatched_reason is not null")) {
      const rows = this.messages
        .filter((message) => message.direction === "inbound" && message.unmatched_reason !== null)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((message) => ({ ...message }));
      return { rows };
    }

    if (
      normalized.startsWith("select id,") &&
      normalized.includes("from contractor_messages")
    ) {
      const [id] = parameters;
      const row = this.messages.find((message) => message.id === id);
      return { rows: row === undefined ? [] : [{ ...row }] };
    }

    return { rows: [] };
  }

  async transaction<T>(
    work: (transaction: IntegrationSqlTransaction) => Promise<T>,
  ): Promise<T> {
    const adapter: IntegrationSqlTransaction = {
      query: (sql, parameters) => this.query(sql, parameters),
    };
    return work(adapter);
  }
}

class RecordingProvider implements WhatsAppProvider {
  readonly name = "test";
  readonly calls: WhatsAppSendInput[] = [];
  result: WhatsAppSendResult = { ok: true, providerMessageId: "wamid.msg-0001" };
  throwError = false;

  async sendText(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
    if (this.throwError) throw new Error("provider offline");
    this.calls.push(input);
    return this.result;
  }
}

function createService(
  executor: InMemoryMessageExecutor,
  provider: WhatsAppProvider | undefined,
): ContractorMessageService {
  return new SqlContractorMessageService({
    repository: new SqlIntegrationContractorMessageRepository({ executor }),
    provider,
    now: () => "2026-08-03T14:00:00.000Z",
    messageId: () => "message-msg-0001",
  });
}

function setupExecutor(executor: InMemoryMessageExecutor): void {
  executor.applications.push(applicationRowFixture());
  executor.contractors.push({ id: "contractor-msg-0001", name: "Marius Andronache" });
  executor.contractorPhones.push({ name: "Marius Andronache", phone: "07912 345678" });
}

const APPLICATION_ID = "application-msg-0001";
const CONTRACTOR_ID = "contractor-msg-0001";
const PHONE_E164 = "+447912345678";

function assertNoOperationalWrites(executor: InMemoryMessageExecutor): void {
  for (const sql of executor.queries) {
    assert.doesNotMatch(sql, /\b(delete\s+from|truncate|drop\s+table|alter\s+table)\b/i);
    assert.doesNotMatch(
      sql,
      /\b(update|insert)\s+(into\s+)?(jobs|contractors|contractor_applications|work_sessions|job_assignments|task_progress|clients|staff|simple_users)\b/i,
    );
    if (/^\s*insert into/i.test(sql)) {
      assert.match(sql, /^\s*insert into contractor_messages\b/i);
    }
    if (/^\s*update/i.test(sql)) {
      assert.match(sql, /^\s*update contractor_messages\b/i);
    }
  }
}

function assertNoFinancialReferences(executor: InMemoryMessageExecutor): void {
  const financialTables =
    /\b(clients|job_phases|sub_phases|phase_assignments|milestones|expenses|contractor_payments|work_hours|materials_catalog|budget_alerts|project_cashflow_weekly|project_master|material_purchases)\b/i;
  for (const sql of executor.queries) {
    assert.doesNotMatch(sql, financialTables);
  }
}

test("preview builds the instruction from the applied change only and sends nothing", async () => {
  const executor = new InMemoryMessageExecutor();
  setupExecutor(executor);
  const provider = new RecordingProvider();
  const service = createService(executor, provider);

  const result = await service.previewApplicationMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
  });

  assert.equal(result.outcome, "previewed");
  if (result.outcome !== "previewed") return;
  const { preview } = result;

  assert.equal(preview.contractor_name, "Marius Andronache");
  assert.equal(preview.phone_e164, PHONE_E164);
  assert.equal(preview.status, "previewed");

  const body = preview.body;
  assert.match(body, /WORK INSTRUCTION - Job 49 Flat2 1 Bedroom/);
  assert.match(body, /Change order: co-msg-0001 \(revision 1\)/);
  assert.match(body, /Scope: Install new electrical supply\./);
  assert.match(body, /- 12 m: Run new supply cable/);
  assert.match(body, /Install conduit and cable to DB\./);

  assert.doesNotMatch(body, /approved_amount_minor/);
  assert.doesNotMatch(body, /currency/);
  assert.doesNotMatch(body, /GBP/);
  assert.doesNotMatch(body, /250000/);
  assert.doesNotMatch(body, /20000/);
  assert.doesNotMatch(body, /evt-msg-0001/);
  assert.doesNotMatch(body, /producer/);
  assert.doesNotMatch(body, /correlation_id/);
  assert.doesNotMatch(body, /actor-msg-0042/);
  assert.doesNotMatch(body, /project_integration_id/);

  assert.equal(provider.calls.length, 0);
  assert.equal(executor.messages.length, 1);
  assert.equal(executor.messages[0].status, "previewed");
  assert.equal(executor.messages[0].preview_hash, preview.preview_hash);
  assertNoOperationalWrites(executor);
  assertNoFinancialReferences(executor);
});

test("unapplied and missing changes are blocked with zero provider calls", async () => {
  for (const result of ["ready", "pending_mapping", "blocked_no_mapping"]) {
    const executor = new InMemoryMessageExecutor();
    executor.applications.push(
      applicationRowFixture({ result }),
    );
    executor.contractors.push({ id: CONTRACTOR_ID, name: "Marius Andronache" });
    executor.contractorPhones.push({ name: "Marius Andronache", phone: "07912 345678" });
    const provider = new RecordingProvider();
    const service = createService(executor, provider);

    const preview = await service.previewApplicationMessage({
      application_id: APPLICATION_ID,
      contractor_id: CONTRACTOR_ID,
    });
    assert.equal(preview.outcome, "not_applied", `expected not_applied for ${result}`);
    assert.equal(provider.calls.length, 0);
    assert.equal(executor.messages.length, 0);
    assertNoOperationalWrites(executor);
  }

  const missing = new InMemoryMessageExecutor();
  const provider = new RecordingProvider();
  const service = createService(missing, provider);
  const result = await service.previewApplicationMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
  });
  assert.equal(result.outcome, "application_not_found");
  assert.equal(provider.calls.length, 0);
});

test("missing contractor is blocked", async () => {
  const executor = new InMemoryMessageExecutor();
  executor.applications.push(applicationRowFixture());
  const provider = new RecordingProvider();
  const service = createService(executor, provider);

  const result = await service.previewApplicationMessage({
    application_id: APPLICATION_ID,
    contractor_id: "contractor-missing-0001",
  });
  assert.equal(result.outcome, "contractor_not_found");
  assert.equal(provider.calls.length, 0);
  assert.equal(executor.messages.length, 0);
  assertNoOperationalWrites(executor);
});

test("invalid contractor phone is blocked", async () => {
  const executor = new InMemoryMessageExecutor();
  executor.applications.push(applicationRowFixture());
  executor.contractors.push({ id: CONTRACTOR_ID, name: "Marius Andronache" });
  executor.contractorPhones.push({ name: "Marius Andronache", phone: "not-a-number" });
  const provider = new RecordingProvider();
  const service = createService(executor, provider);

  const result = await service.previewApplicationMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
  });
  assert.equal(result.outcome, "no_usable_phone");
  assert.equal(provider.calls.length, 0);
  assert.equal(executor.messages.length, 0);
  assertNoOperationalWrites(executor);
});

test("missing mapped job is blocked", async () => {
  const executor = new InMemoryMessageExecutor();
  executor.applications.push(applicationRowFixture({ job_title: "" }));
  executor.contractors.push({ id: CONTRACTOR_ID, name: "Marius Andronache" });
  executor.contractorPhones.push({ name: "Marius Andronache", phone: "07912 345678" });
  const provider = new RecordingProvider();
  const service = createService(executor, provider);

  const result = await service.previewApplicationMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
  });
  assert.equal(result.outcome, "job_not_found");
  assert.equal(provider.calls.length, 0);
  assert.equal(executor.messages.length, 0);
});

test("international phone numbers are normalized without guessing the country", async () => {
  const executor = new InMemoryMessageExecutor();
  executor.applications.push(applicationRowFixture());
  executor.contractors.push({ id: CONTRACTOR_ID, name: "Hamza Aouichaoui" });
  executor.contractorPhones.push({ name: "Hamza Aouichaoui", phone: "+353 87 123 4567" });
  const provider = new RecordingProvider();
  const service = createService(executor, provider);

  const result = await service.previewApplicationMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
  });
  assert.equal(result.outcome, "previewed");
  if (result.outcome !== "previewed") return;
  assert.equal(result.preview.phone_e164, "+353871234567");
  assert.equal(provider.calls.length, 0);
});

test("send without explicit human confirmation is blocked", async () => {
  const executor = new InMemoryMessageExecutor();
  setupExecutor(executor);
  const provider = new RecordingProvider();
  const service = createService(executor, provider);

  const preview = await service.previewApplicationMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
  });
  assert.equal(preview.outcome, "previewed");
  if (preview.outcome !== "previewed") return;

  const noBy = await service.sendConfirmedMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
    preview_hash: preview.preview.preview_hash,
    confirmed_by: "",
    confirmed_at: "2026-08-03T14:01:00.000Z",
  });
  assert.equal(noBy.outcome, "confirmation_required");

  const badAt = await service.sendConfirmedMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
    preview_hash: preview.preview.preview_hash,
    confirmed_by: "admin",
    confirmed_at: "not-a-timestamp",
  });
  assert.equal(badAt.outcome, "confirmation_required");

  assert.equal(provider.calls.length, 0);
  assert.equal(executor.messages[0].status, "previewed");
  assertNoOperationalWrites(executor);
});

test("preview hash mismatch blocks the send with zero provider calls", async () => {
  const executor = new InMemoryMessageExecutor();
  setupExecutor(executor);
  const provider = new RecordingProvider();
  const service = createService(executor, provider);

  const preview = await service.previewApplicationMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
  });
  assert.equal(preview.outcome, "previewed");
  if (preview.outcome !== "previewed") return;

  const result = await service.sendConfirmedMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
    preview_hash: "f".repeat(64),
    confirmed_by: "admin",
    confirmed_at: "2026-08-03T14:01:00.000Z",
  });
  assert.equal(result.outcome, "preview_hash_mismatch");
  assert.equal(provider.calls.length, 0);
  assert.equal(executor.messages[0].status, "previewed");
  assertNoOperationalWrites(executor);
});

test("send without a matching stored preview is blocked", async () => {
  const executor = new InMemoryMessageExecutor();
  setupExecutor(executor);
  const provider = new RecordingProvider();
  const service = createService(executor, provider);

  const preview = await service.previewApplicationMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
  });
  assert.equal(preview.outcome, "previewed");
  if (preview.outcome !== "previewed") return;

  executor.messages = [];

  const result = await service.sendConfirmedMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
    preview_hash: preview.preview.preview_hash,
    confirmed_by: "admin",
    confirmed_at: "2026-08-03T14:01:00.000Z",
  });
  assert.equal(result.outcome, "no_preview");
  assert.equal(provider.calls.length, 0);
  assertNoOperationalWrites(executor);
});

test("valid confirmed send calls the provider exactly once and persists the message", async () => {
  const executor = new InMemoryMessageExecutor();
  setupExecutor(executor);
  const provider = new RecordingProvider();
  const service = createService(executor, provider);

  const preview = await service.previewApplicationMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
  });
  assert.equal(preview.outcome, "previewed");
  if (preview.outcome !== "previewed") return;

  const result = await service.sendConfirmedMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
    preview_hash: preview.preview.preview_hash,
    confirmed_by: "admin",
    confirmed_at: "2026-08-03T14:01:00.000Z",
  });

  assert.equal(result.outcome, "sent");
  if (result.outcome !== "sent") return;

  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0].to, PHONE_E164);
  assert.equal(provider.calls[0].body, preview.preview.body);

  const { message } = result;
  assert.equal(message.status, "sent");
  assert.equal(message.provider_message_id, "wamid.msg-0001");
  assert.equal(message.confirmed_by, "admin");
  assert.equal(message.confirmed_at, "2026-08-03T14:01:00.000Z");
  assert.equal(message.sent_at, "2026-08-03T14:00:00.000Z");
  assert.equal(message.preview_hash, preview.preview.preview_hash);

  assert.equal(executor.messages.length, 1);
  assert.equal(executor.messages[0].status, "sent");

  assertNoOperationalWrites(executor);
  assertNoFinancialReferences(executor);
});

test("provider failure is recorded safely as failed without a second call", async () => {
  const executor = new InMemoryMessageExecutor();
  setupExecutor(executor);
  const provider = new RecordingProvider();
  provider.result = { ok: false, errorCode: "whatsapp_error_500" };
  const service = createService(executor, provider);

  const preview = await service.previewApplicationMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
  });
  assert.equal(preview.outcome, "previewed");
  if (preview.outcome !== "previewed") return;

  const result = await service.sendConfirmedMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
    preview_hash: preview.preview.preview_hash,
    confirmed_by: "admin",
    confirmed_at: "2026-08-03T14:01:00.000Z",
  });

  assert.deepEqual(result, { outcome: "provider_failed", error_code: "whatsapp_error_500" });
  assert.equal(provider.calls.length, 1);
  assert.equal(executor.messages[0].status, "failed");
  assert.equal(executor.messages[0].error_code, "whatsapp_error_500");
  assert.equal(executor.messages[0].provider_message_id, null);
  assertNoOperationalWrites(executor);
});

test("provider exception is recorded safely as failed", async () => {
  const executor = new InMemoryMessageExecutor();
  setupExecutor(executor);
  const provider = new RecordingProvider();
  provider.throwError = true;
  const service = createService(executor, provider);

  const preview = await service.previewApplicationMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
  });
  assert.equal(preview.outcome, "previewed");
  if (preview.outcome !== "previewed") return;

  const result = await service.sendConfirmedMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
    preview_hash: preview.preview.preview_hash,
    confirmed_by: "admin",
    confirmed_at: "2026-08-03T14:01:00.000Z",
  });

  assert.deepEqual(result, {
    outcome: "provider_failed",
    error_code: "whatsapp_provider_exception",
  });
  assert.equal(executor.messages[0].status, "failed");
  assert.equal(executor.messages[0].error_code, "whatsapp_provider_exception");
  assertNoOperationalWrites(executor);
});

async function seedSentOutbound(
  executor: InMemoryMessageExecutor,
  provider: RecordingProvider = new RecordingProvider(),
): Promise<{ service: ContractorMessageService; provider: RecordingProvider }> {
  setupExecutor(executor);
  const service = createService(executor, provider);
  const preview = await service.previewApplicationMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
  });
  assert.equal(preview.outcome, "previewed");
  if (preview.outcome !== "previewed") throw new Error("preview failed");
  const sent = await service.sendConfirmedMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
    preview_hash: preview.preview.preview_hash,
    confirmed_by: "admin",
    confirmed_at: "2026-08-03T14:01:00.000Z",
  });
  assert.equal(sent.outcome, "sent");
  provider.calls.length = 0;
  executor.queries.length = 0;
  return { service, provider };
}

test("webhook delivery statuses persist monotonically and duplicate status is safe", async () => {
  const executor = new InMemoryMessageExecutor();
  const { service, provider } = await seedSentOutbound(executor);

  await service.handleWhatsAppWebhookEvents([
    {
      kind: "status",
      provider_message_id: "wamid.msg-0001",
      status: "delivered",
      occurred_at: "2026-08-03T14:02:00.000Z",
    },
    {
      kind: "status",
      provider_message_id: "wamid.msg-0001",
      status: "delivered",
      occurred_at: "2026-08-03T14:02:30.000Z",
    },
    {
      kind: "status",
      provider_message_id: "wamid.msg-0001",
      status: "read",
      occurred_at: "2026-08-03T14:03:00.000Z",
    },
    {
      kind: "status",
      provider_message_id: "wamid.msg-0001",
      status: "sent",
      occurred_at: "2026-08-03T14:04:00.000Z",
    },
  ]);

  assert.equal(executor.messages[0].delivery_status, "read");
  assert.equal(executor.messages[0].delivered_at, "2026-08-03T14:02:00.000Z");
  assert.equal(executor.messages[0].read_at, "2026-08-03T14:03:00.000Z");
  assert.equal(provider.calls.length, 0);
  assertNoOperationalWrites(executor);
  assertNoFinancialReferences(executor);
});

test("webhook sent and failed statuses persist safely", async () => {
  const executor = new InMemoryMessageExecutor();
  const { service, provider } = await seedSentOutbound(executor);

  await service.handleWhatsAppWebhookEvents([
    {
      kind: "status",
      provider_message_id: "wamid.msg-0001",
      status: "sent",
      occurred_at: "2026-08-03T14:02:00.000Z",
    },
    {
      kind: "status",
      provider_message_id: "wamid.msg-0001",
      status: "failed",
      occurred_at: "2026-08-03T14:03:00.000Z",
      error_code: "whatsapp_error_131026",
    },
  ]);

  assert.equal(executor.messages[0].delivery_status, "failed");
  assert.equal(executor.messages[0].error_code, "whatsapp_error_131026");
  assert.equal(provider.calls.length, 0);
  assertNoOperationalWrites(executor);
});

test("inbound text reply links exactly by context id and acknowledges outbound only when inserted", async () => {
  const executor = new InMemoryMessageExecutor();
  const { service, provider } = await seedSentOutbound(executor);

  const event = {
    kind: "inbound_text" as const,
    provider_message_id: "wamid.inbound-0001",
    from_wa_id: "447912345678",
    body: "Received, thanks",
    occurred_at: "2026-08-03T14:05:00.000Z",
    context_provider_message_id: "wamid.msg-0001",
  };
  await service.handleWhatsAppWebhookEvents([event, event]);

  const inbound = executor.messages.filter((message) => message.inbound_provider_message_id !== null);
  assert.equal(inbound.length, 1);
  assert.equal(inbound[0].inbound_provider_message_id, "wamid.inbound-0001");
  assert.equal(inbound[0].reply_to_provider_message_id, "wamid.msg-0001");
  assert.equal(inbound[0].contractor_id, CONTRACTOR_ID);
  assert.equal(inbound[0].application_id, APPLICATION_ID);
  assert.equal(inbound[0].job_id, "job-msg-0001");
  assert.equal(inbound[0].change_order_id, "co-msg-0001");
  assert.equal(inbound[0].body, "Received, thanks");
  assert.equal(executor.messages[0].acknowledged_at, "2026-08-03T14:05:00.000Z");
  assert.equal(provider.calls.length, 0);
  assertNoOperationalWrites(executor);
  assertNoFinancialReferences(executor);
});

test("digit-only wa_id fallback links when unambiguous", async () => {
  const executor = new InMemoryMessageExecutor();
  const { service, provider } = await seedSentOutbound(executor);

  await service.handleWhatsAppWebhookEvents([
    {
      kind: "inbound_text",
      provider_message_id: "wamid.inbound-0002",
      from_wa_id: "447912345678",
      body: "Confirmed",
      occurred_at: "2026-08-03T14:06:00.000Z",
    },
  ]);

  const inbound = executor.messages.find((message) => message.inbound_provider_message_id === "wamid.inbound-0002");
  assert.ok(inbound !== undefined);
  assert.equal(inbound.reply_to_provider_message_id, "wamid.msg-0001");
  assert.equal(inbound.contractor_id, CONTRACTOR_ID);
  assert.equal(executor.messages[0].acknowledged_at, "2026-08-03T14:06:00.000Z");
  assert.equal(provider.calls.length, 0);
  assertNoOperationalWrites(executor);
});

test("ambiguous or unmatched inbound replies are retained without acknowledgement", async () => {
  const executor = new InMemoryMessageExecutor();
  const { service, provider } = await seedSentOutbound(executor);
  executor.messages.push({
    ...executor.messages[0],
    id: "message-msg-0002",
    provider_message_id: "wamid.msg-0002",
    sent_at: "2026-08-03T14:02:00.000Z",
    acknowledged_at: null,
  });

  await service.handleWhatsAppWebhookEvents([
    {
      kind: "inbound_text",
      provider_message_id: "wamid.inbound-0003",
      from_wa_id: "447912345678",
      body: "Which job?",
      occurred_at: "2026-08-03T14:07:00.000Z",
    },
    {
      kind: "inbound_text",
      provider_message_id: "wamid.inbound-0004",
      from_wa_id: "447700900123",
      body: "Hello",
      occurred_at: "2026-08-03T14:08:00.000Z",
    },
  ]);

  const ambiguous = executor.messages.find((message) => message.inbound_provider_message_id === "wamid.inbound-0003");
  const unmatched = executor.messages.find((message) => message.inbound_provider_message_id === "wamid.inbound-0004");
  assert.ok(ambiguous !== undefined);
  assert.ok(unmatched !== undefined);
  assert.equal(ambiguous.contractor_id, "");
  assert.equal(ambiguous.application_id, "");
  assert.equal(ambiguous.unmatched_reason, "ambiguous_phone_match");
  assert.equal(unmatched.contractor_id, "");
  assert.equal(unmatched.application_id, "");
  assert.equal(unmatched.unmatched_reason, "no_matching_outbound");
  assert.equal(executor.messages[0].acknowledged_at, null);
  assert.equal(executor.messages[1].acknowledged_at, null);
  assert.equal(provider.calls.length, 0);
  assertNoOperationalWrites(executor);
  assertNoFinancialReferences(executor);
});

test("unconfigured provider blocks the send without a live call", async () => {
  const executor = new InMemoryMessageExecutor();
  setupExecutor(executor);
  const service = createService(executor, undefined);

  const preview = await service.previewApplicationMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
  });
  assert.equal(preview.outcome, "previewed");
  if (preview.outcome !== "previewed") return;

  const result = await service.sendConfirmedMessage({
    application_id: APPLICATION_ID,
    contractor_id: CONTRACTOR_ID,
    preview_hash: preview.preview.preview_hash,
    confirmed_by: "admin",
    confirmed_at: "2026-08-03T14:01:00.000Z",
  });
  assert.equal(result.outcome, "provider_unconfigured");
  assert.equal(executor.messages[0].status, "previewed");
  assertNoOperationalWrites(executor);
});

test("approval and apply paths never import the WhatsApp provider or message service", async () => {
  for (const file of [
    "../server/integration-application-route.ts",
    "../server/integration-change-order-applications.ts",
    "../server/integration-review-route.ts",
    "../server/integration-review-repository.ts",
    "../server/integration-shadow-route.ts",
  ]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /whatsapp|whats-app|WhatsApp/i);
    assert.doesNotMatch(source, /integration-contractor-message|ContractorMessage|sendText|graph\.facebook/i);
  }
});

test("contractor message route imports only express, admin guard, and service types", async () => {
  const source = await readFile(
    new URL("../server/integration-contractor-message-route.ts", import.meta.url),
    "utf8",
  );
  const importedModules = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(importedModules, [
    "express",
    "./integration-review-route.ts",
    "./integration-contractor-message-service.ts",
  ]);
  assert.doesNotMatch(
    source,
    /database-storage|\.\/db|integration-shadow-sql-repository|whatsapp\.ts|Telegram|sendgrid|twilio|stripe|notifications/i,
  );
});

test("contractor messages design migration is additive, non-destructive, and unregistered", async () => {
  const migrationUrl = new URL(
    "../migration-designs/phase1c-step1-contractor-messages.sql",
    import.meta.url,
  );
  const sql = await readFile(migrationUrl, "utf8");
  const withoutComments = sql.replace(/^\s*--.*$/gm, "");
  const statements = withoutComments.split(";").map((statement) => statement.trim()).filter(Boolean);

  assert.equal(statements.length, 1);
  assert.match(statements[0], /^CREATE TABLE IF NOT EXISTS contractor_messages\b/i);
  assert.match(withoutComments, /REFERENCES integration_change_order_applications\(application_id\)/i);
  assert.match(withoutComments, /REFERENCES jobs\(id\)/i);
  assert.match(withoutComments, /REFERENCES contractors\(id\)/i);
  assert.match(
    withoutComments,
    /status TEXT NOT NULL CHECK\s*\(status IN \('previewed',\s*'queued',\s*'sent',\s*'failed'\)\)/i,
  );
  assert.match(withoutComments, /direction TEXT NOT NULL CHECK\s*\(direction = 'outbound'\)/i);
  assert.match(withoutComments, /channel TEXT NOT NULL CHECK\s*\(channel = 'whatsapp'\)/i);
  assert.match(withoutComments, /phone_e164 TEXT NOT NULL CHECK\s*\(phone_e164 ~ '\^\\\+\[0-9\]\{8,15\}\$'\)/i);
  assert.doesNotMatch(withoutComments, /\b(DROP|DELETE|TRUNCATE|ALTER|UPDATE)\b/i);
  assert.doesNotMatch(migrationUrl.pathname, /\/migrations\//i);
});

test("inbound contractor messages design is dormant and retains unmatched replies safely", async () => {
  const migrationUrl = new URL(
    "../migration-designs/phase1c-step2-contractor-messages-inbound.sql",
    import.meta.url,
  );
  const sql = await readFile(migrationUrl, "utf8");
  const withoutComments = sql.replace(/^\s*--.*$/gm, "");
  const statements = withoutComments.split(";").map((statement) => statement.trim()).filter(Boolean);

  assert.equal(statements.length, 2);
  assert.match(statements[0], /^CREATE TABLE IF NOT EXISTS contractor_messages\b/i);
  assert.match(withoutComments, /direction TEXT NOT NULL CHECK\s*\(direction IN \('outbound',\s*'inbound'\)\)/i);
  assert.match(
    withoutComments,
    /delivery_status TEXT NOT NULL DEFAULT 'none'\s*CHECK \(delivery_status IN \('none',\s*'sent',\s*'delivered',\s*'read',\s*'failed'\)\)/i,
  );
  assert.match(withoutComments, /delivered_at TIMESTAMPTZ/i);
  assert.match(withoutComments, /read_at TIMESTAMPTZ/i);
  assert.match(withoutComments, /acknowledged_at TIMESTAMPTZ/i);
  assert.match(withoutComments, /reply_to_provider_message_id TEXT/i);
  assert.match(withoutComments, /inbound_provider_message_id TEXT/i);
  assert.match(withoutComments, /unmatched_reason TEXT/i);
  assert.match(withoutComments, /application_id UUID\s+REFERENCES integration_change_order_applications\(application_id\)/i);
  assert.match(withoutComments, /contractor_id VARCHAR REFERENCES contractors\(id\)/i);
  assert.match(statements[1], /^CREATE UNIQUE INDEX IF NOT EXISTS contractor_messages_inbound_provider_message_id_unique\b/i);
  assert.doesNotMatch(withoutComments, /\b(DROP|DELETE|TRUNCATE|ALTER|UPDATE)\b/i);
  assert.doesNotMatch(migrationUrl.pathname, /\/migrations\//i);
});

interface TestRouteContext {
  readonly executor: InMemoryMessageExecutor;
  readonly provider: RecordingProvider;
  setSession(session: { role?: string; username?: string } | undefined): void;
  get(path: string): Promise<{ status: number; body: Record<string, unknown> }>;
  post(path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }>;
}

async function withTestRoute(
  run: (context: TestRouteContext) => Promise<void>,
): Promise<void> {
  const executor = new InMemoryMessageExecutor();
  setupExecutor(executor);
  const provider = new RecordingProvider();
  const app = express();
  app.use(express.json());

  let session: { role?: string; username?: string } | undefined = { role: "admin", username: "admin" };
  app.use((request: Request, _response: Response, next: NextFunction) => {
    (request as unknown as { session?: { role?: string; username?: string } }).session = session;
    next();
  });
  app.use(createContractorMessageRouter({
    service: createService(executor, provider),
  }));

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    assert.ok(address !== null);
    const base = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const post = async (path: string, body: unknown) => {
      const response = await fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      return {
        status: response.status,
        body: text.length === 0 ? {} : (JSON.parse(text) as Record<string, unknown>),
      };
    };

    const get = async (path: string) => {
      const response = await fetch(base + path);
      const text = await response.text();
      return {
        status: response.status,
        body: text.length === 0 ? {} : (JSON.parse(text) as Record<string, unknown>),
      };
    };

    await run({
      executor,
      provider,
      setSession: (nextSession) => {
        session = nextSession;
      },
      get,
      post,
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  }
}

const PREVIEW_PATH = `${CONTRACTOR_MESSAGE_ROUTE}/previews`;
const SEND_PATH = `${CONTRACTOR_MESSAGE_ROUTE}/sends`;
const HISTORY_PATH = `${CONTRACTOR_MESSAGE_ROUTE}?application_id=${APPLICATION_ID}`;
const UNMATCHED_PATH = `${CONTRACTOR_MESSAGE_ROUTE}/unmatched`;
const CONTRACTOR_CANDIDATES_PATH = `${CONTRACTOR_MESSAGE_ROUTE}/contractor-candidates?job_id=job-msg-0001`;

const previewBody = { application_id: APPLICATION_ID, contractor_id: CONTRACTOR_ID };

test("message endpoints reject missing and non-admin sessions", async () => {
  await withTestRoute(async ({ executor, provider, get, post, setSession }) => {
    setSession(undefined);
    assert.equal((await get(HISTORY_PATH)).status, 401);
    assert.equal((await get(UNMATCHED_PATH)).status, 401);
    assert.equal((await get(CONTRACTOR_CANDIDATES_PATH)).status, 401);
    assert.equal((await post(PREVIEW_PATH, previewBody)).status, 401);
    assert.equal((await post(SEND_PATH, previewBody)).status, 401);

    setSession({ role: "contractor", username: "bob" });
    assert.equal((await get(HISTORY_PATH)).status, 401);
    assert.equal((await get(UNMATCHED_PATH)).status, 401);
    assert.equal((await get(CONTRACTOR_CANDIDATES_PATH)).status, 401);
    assert.equal((await post(PREVIEW_PATH, previewBody)).status, 401);
    assert.equal((await post(SEND_PATH, previewBody)).status, 401);

    assert.equal(provider.calls.length, 0);
    assert.equal(executor.messages.length, 0);
    assertNoOperationalWrites(executor);
  });
});

test("admin history returns outbound delivery state with linked inbound replies", async () => {
  await withTestRoute(async ({ executor, get, post }) => {
    const preview = await post(PREVIEW_PATH, previewBody);
    assert.equal(preview.status, 201);
    const hash = (preview.body.preview as Record<string, unknown>).preview_hash as string;
    const send = await post(SEND_PATH, {
      application_id: APPLICATION_ID,
      contractor_id: CONTRACTOR_ID,
      preview_hash: hash,
      confirmed_by: "admin",
      confirmed_at: "2026-08-03T14:01:00.000Z",
    });
    assert.equal(send.status, 200);
    executor.messages[0].delivery_status = "read";
    executor.messages[0].delivered_at = "2026-08-03T14:02:00.000Z";
    executor.messages[0].read_at = "2026-08-03T14:03:00.000Z";
    executor.messages[0].acknowledged_at = "2026-08-03T14:04:00.000Z";
    executor.messages.push({
      id: "message-inbound-0001",
      application_id: APPLICATION_ID,
      job_id: "job-msg-0001",
      change_order_id: "co-msg-0001",
      revision: 1,
      contractor_id: CONTRACTOR_ID,
      phone_e164: PHONE_E164,
      body: "Received, thanks.",
      preview_hash: "",
      status: "received",
      delivery_status: "none",
      provider_message_id: null,
      reply_to_provider_message_id: "wamid.msg-0001",
      inbound_provider_message_id: "wamid.inbound-0001",
      confirmed_by: null,
      confirmed_at: null,
      created_at: "2026-08-03T14:04:00.000Z",
      sent_at: null,
      delivered_at: null,
      read_at: null,
      acknowledged_at: null,
      error_code: null,
      unmatched_reason: null,
      direction: "inbound",
    });

    const history = await get(HISTORY_PATH);
    assert.equal(history.status, 200);
    const messages = history.body.messages as Record<string, unknown>[];
    assert.equal(messages.length, 1);
    assert.equal(messages[0].contractor_name, "Marius Andronache");
    assert.equal(messages[0].delivery_status, "read");
    assert.equal(messages[0].delivered_at, "2026-08-03T14:02:00.000Z");
    assert.equal(messages[0].read_at, "2026-08-03T14:03:00.000Z");
    assert.equal(messages[0].acknowledged_at, "2026-08-03T14:04:00.000Z");
    const replies = messages[0].replies as Record<string, unknown>[];
    assert.equal(replies.length, 1);
    assert.equal(replies[0].body, "Received, thanks.");
    assertNoOperationalWrites(executor);
  });
});

test("admin unmatched endpoint returns only unmatched inbound messages", async () => {
  await withTestRoute(async ({ executor, get }) => {
    executor.messages.push({
      id: "message-unmatched-0001",
      application_id: "",
      job_id: "",
      change_order_id: "",
      revision: 0,
      contractor_id: "",
      phone_e164: "+447700900123",
      body: "What job is this?",
      preview_hash: "",
      status: "received",
      delivery_status: "none",
      provider_message_id: null,
      reply_to_provider_message_id: null,
      inbound_provider_message_id: "wamid.unmatched-0001",
      confirmed_by: null,
      confirmed_at: null,
      created_at: "2026-08-03T15:00:00.000Z",
      sent_at: null,
      delivered_at: null,
      read_at: null,
      acknowledged_at: null,
      error_code: null,
      unmatched_reason: "no_matching_outbound",
      direction: "inbound",
    });
    executor.messages.push({
      id: "message-matched-inbound-0001",
      application_id: APPLICATION_ID,
      job_id: "job-msg-0001",
      change_order_id: "co-msg-0001",
      revision: 1,
      contractor_id: CONTRACTOR_ID,
      phone_e164: PHONE_E164,
      body: "Matched reply",
      preview_hash: "",
      status: "received",
      delivery_status: "none",
      provider_message_id: null,
      reply_to_provider_message_id: "wamid.msg-0001",
      inbound_provider_message_id: "wamid.inbound-0002",
      confirmed_by: null,
      confirmed_at: null,
      created_at: "2026-08-03T14:00:00.000Z",
      sent_at: null,
      delivered_at: null,
      read_at: null,
      acknowledged_at: null,
      error_code: null,
      unmatched_reason: null,
      direction: "inbound",
    });

    const response = await get(UNMATCHED_PATH);
    assert.equal(response.status, 200);
    const messages = response.body.messages as Record<string, unknown>[];
    assert.equal(messages.length, 1);
    assert.equal(messages[0].phone_e164, "+447700900123");
    assert.equal(messages[0].body, "What job is this?");
    assert.equal(messages[0].unmatched_reason, "no_matching_outbound");
    assert.equal(messages[0].inbound_provider_message_id, "wamid.unmatched-0001");
    assertNoOperationalWrites(executor);
  });
});

test("admin contractor candidates endpoint returns narrow safe fields", async () => {
  await withTestRoute(async ({ executor, get }) => {
    executor.contractors.push({ id: "contractor-msg-0002", name: "No Phone" });
    const response = await get(CONTRACTOR_CANDIDATES_PATH);

    assert.equal(response.status, 200);
    const contractors = response.body.contractors as Record<string, unknown>[];
    assert.equal(contractors.length, 1);
    assert.deepEqual(Object.keys(contractors[0]).sort(), [
      "assigned_job_id",
      "assigned_job_title",
      "contractor_id",
      "name",
      "phone",
    ]);
    assert.equal(contractors[0].contractor_id, CONTRACTOR_ID);
    assert.equal(contractors[0].name, "Marius Andronache");
    assert.equal(contractors[0].phone, "07912 345678");
    assertNoOperationalWrites(executor);
  });
});

test("admin preview returns the generated instruction and never sends", async () => {
  await withTestRoute(async ({ executor, provider, post }) => {
    const response = await post(PREVIEW_PATH, previewBody);

    assert.equal(response.status, 201);
    assert.equal(response.body.status, "previewed");
    const preview = response.body.preview as Record<string, unknown>;
    assert.equal(preview.contractor_name, "Marius Andronache");
    assert.equal(preview.phone_e164, PHONE_E164);
    assert.equal(typeof preview.preview_hash, "string");
    assert.match(String(preview.body), /WORK INSTRUCTION/);
    assert.equal(provider.calls.length, 0);
    assert.equal(executor.messages.length, 1);
    assertNoOperationalWrites(executor);
  });
});

test("admin preview rejects missing contractor phone", async () => {
  await withTestRoute(async ({ executor, provider, post }) => {
    executor.contractorPhones = [{ name: "Marius Andronache", phone: "nope" }];
    const response = await post(PREVIEW_PATH, previewBody);
    assert.equal(response.status, 422);
    assert.equal(provider.calls.length, 0);
    assertNoOperationalWrites(executor);
  });
});

test("confirmed send returns sent and calls the provider exactly once", async () => {
  await withTestRoute(async ({ executor, provider, post }) => {
    const preview = await post(PREVIEW_PATH, previewBody);
    assert.equal(preview.status, 201);
    const hash = (preview.body.preview as Record<string, unknown>).preview_hash as string;

    const send = await post(SEND_PATH, {
      application_id: APPLICATION_ID,
      contractor_id: CONTRACTOR_ID,
      preview_hash: hash,
      confirmed_by: "admin",
      confirmed_at: "2026-08-03T14:01:00.000Z",
    });

    assert.equal(send.status, 200);
    assert.equal(send.body.status, "sent");
    assert.equal(provider.calls.length, 1);
    assert.equal((send.body.message as Record<string, unknown>).provider_message_id, "wamid.msg-0001");
    assertNoOperationalWrites(executor);
  });
});

test("send without human confirmation returns 400 and never calls the provider", async () => {
  await withTestRoute(async ({ executor, provider, post }) => {
    const preview = await post(PREVIEW_PATH, previewBody);
    const hash = (preview.body.preview as Record<string, unknown>).preview_hash as string;

    const noConfirm = await post(SEND_PATH, {
      application_id: APPLICATION_ID,
      contractor_id: CONTRACTOR_ID,
      preview_hash: hash,
    });
    assert.equal(noConfirm.status, 400);

    const mismatch = await post(SEND_PATH, {
      application_id: APPLICATION_ID,
      contractor_id: CONTRACTOR_ID,
      preview_hash: "f".repeat(64),
      confirmed_by: "admin",
      confirmed_at: "2026-08-03T14:01:00.000Z",
    });
    assert.equal(mismatch.status, 409);

    assert.equal(provider.calls.length, 0);
    assert.equal(executor.messages[0].status, "previewed");
    assertNoOperationalWrites(executor);
  });
});
