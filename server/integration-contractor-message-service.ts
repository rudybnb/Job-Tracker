import { createHash, randomUUID } from "node:crypto";
import { normalizePhoneToE164 } from "./phone-utils.ts";
import type { WhatsAppProvider } from "./whatsapp.ts";
import type {
  ContractorApplicationContext,
  ContractorMessageRow,
  IntegrationContractorMessageRepository,
} from "./integration-contractor-message-repository.ts";

export interface MessagePreview {
  readonly id: string;
  readonly application_id: string;
  readonly job_id: string;
  readonly change_order_id: string;
  readonly revision: number;
  readonly contractor_id: string;
  readonly contractor_name: string;
  readonly phone_e164: string;
  readonly body: string;
  readonly preview_hash: string;
  readonly status: "previewed";
  readonly created_at: string;
}

export type PreviewOutcome =
  | { readonly outcome: "application_not_found" }
  | { readonly outcome: "not_applied" }
  | { readonly outcome: "job_not_found" }
  | { readonly outcome: "contractor_not_found" }
  | { readonly outcome: "no_usable_phone" }
  | { readonly outcome: "previewed"; readonly preview: MessagePreview };

export type SendOutcome =
  | { readonly outcome: "application_not_found" }
  | { readonly outcome: "not_applied" }
  | { readonly outcome: "job_not_found" }
  | { readonly outcome: "contractor_not_found" }
  | { readonly outcome: "no_usable_phone" }
  | { readonly outcome: "no_preview" }
  | { readonly outcome: "preview_hash_mismatch" }
  | { readonly outcome: "confirmation_required" }
  | { readonly outcome: "provider_unconfigured" }
  | { readonly outcome: "provider_failed"; readonly error_code: string }
  | { readonly outcome: "sent"; readonly message: ContractorMessageRow };

export interface ContractorMessageService {
  previewApplicationMessage(input: {
    readonly application_id: string;
    readonly contractor_id: string;
  }): Promise<PreviewOutcome>;

  sendConfirmedMessage(input: {
    readonly application_id: string;
    readonly contractor_id: string;
    readonly preview_hash: string;
    readonly confirmed_by: string;
    readonly confirmed_at: string;
  }): Promise<SendOutcome>;
}

export interface ContractorMessageServiceOptions {
  readonly repository: IntegrationContractorMessageRepository;
  readonly provider: WhatsAppProvider | undefined;
  readonly now?: () => string;
  readonly messageId?: () => string;
  readonly normalizePhone?: (value: unknown) => string | undefined;
}

type ResolvedContext =
  | {
      readonly kind: "ok";
      readonly context: ContractorApplicationContext;
      readonly contractorId: string;
      readonly contractorName: string;
      readonly phoneE164: string;
    }
  | { readonly kind: "blocked"; readonly outcome: PreviewOutcome };

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_TIMESTAMP_PATTERN.test(value);
}

function previewHash(
  applicationId: string,
  contractorId: string,
  phoneE164: string,
  body: string,
): string {
  return createHash("sha256")
    .update([applicationId, contractorId, phoneE164, body].join("\n"))
    .digest("hex");
}

function buildInstructionBody(context: ContractorApplicationContext): string {
  const lines: string[] = [];
  lines.push(`WORK INSTRUCTION - ${context.job_title}`);
  lines.push("");
  lines.push(`Change order: ${context.change_order_id} (revision ${context.revision})`);
  lines.push(`Scope: ${context.snapshot.scope}`);
  lines.push("");
  lines.push("Approved tasks:");
  for (const task of context.snapshot.tasks) {
    lines.push(`- ${task.quantity} ${task.unit}: ${task.title}`);
    for (const instructionLine of task.instructions.split(/\r?\n/)) {
      const trimmed = instructionLine.trim();
      if (trimmed.length > 0) lines.push(`  ${trimmed}`);
    }
  }
  lines.push("");
  lines.push("Please reply to confirm you have received these instructions.");
  return lines.join("\n");
}

export class SqlContractorMessageService implements ContractorMessageService {
  readonly #repository: IntegrationContractorMessageRepository;
  readonly #provider: WhatsAppProvider | undefined;
  readonly #now: () => string;
  readonly #messageId: () => string;
  readonly #normalizePhone: (value: unknown) => string | undefined;

  constructor(options: ContractorMessageServiceOptions) {
    this.#repository = options.repository;
    this.#provider = options.provider;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#messageId = options.messageId ?? randomUUID;
    this.#normalizePhone = options.normalizePhone ?? normalizePhoneToE164;
  }

  async previewApplicationMessage(input: {
    readonly application_id: string;
    readonly contractor_id: string;
  }): Promise<PreviewOutcome> {
    const resolved = await this.#resolve(input.application_id, input.contractor_id);
    if (resolved.kind !== "ok") return resolved.outcome;

    const { context, contractorId, contractorName, phoneE164 } = resolved;
    const body = buildInstructionBody(context);
    const hash = previewHash(context.application_id, contractorId, phoneE164, body);
    const created_at = this.#now();

    const row = await this.#repository.insertPreview({
      id: this.#messageId(),
      application_id: context.application_id,
      job_id: context.applied_to_job_id,
      change_order_id: context.change_order_id,
      revision: context.revision,
      contractor_id: contractorId,
      phone_e164: phoneE164,
      body,
      preview_hash: hash,
      created_at,
    });

    return {
      outcome: "previewed",
      preview: {
        id: row.id,
        application_id: row.application_id,
        job_id: row.job_id,
        change_order_id: row.change_order_id,
        revision: row.revision,
        contractor_id: row.contractor_id,
        contractor_name: contractorName,
        phone_e164: row.phone_e164,
        body: row.body,
        preview_hash: row.preview_hash,
        status: "previewed",
        created_at: row.created_at,
      },
    };
  }

  async sendConfirmedMessage(input: {
    readonly application_id: string;
    readonly contractor_id: string;
    readonly preview_hash: string;
    readonly confirmed_by: string;
    readonly confirmed_at: string;
  }): Promise<SendOutcome> {
    const resolved = await this.#resolve(input.application_id, input.contractor_id);
    if (resolved.kind !== "ok") return resolved.outcome;

    const { context, contractorId, phoneE164 } = resolved;

    if (typeof input.preview_hash !== "string" || input.preview_hash.length === 0) {
      return { outcome: "preview_hash_mismatch" };
    }
    const body = buildInstructionBody(context);
    const recomputed = previewHash(context.application_id, contractorId, phoneE164, body);
    if (input.preview_hash !== recomputed) {
      return { outcome: "preview_hash_mismatch" };
    }

    const preview = await this.#repository.findLatestPreview(
      context.application_id,
      contractorId,
    );
    if (preview === undefined) return { outcome: "no_preview" };
    if (preview.preview_hash !== recomputed) return { outcome: "preview_hash_mismatch" };

    const confirmedBy =
      typeof input.confirmed_by === "string" ? input.confirmed_by.trim() : "";
    if (confirmedBy.length === 0 || !isIsoTimestamp(input.confirmed_at)) {
      return { outcome: "confirmation_required" };
    }

    if (this.#provider === undefined) return { outcome: "provider_unconfigured" };

    let providerResult;
    try {
      providerResult = await this.#provider.sendText({ to: phoneE164, body });
    } catch {
      await this.#repository.markFailed({
        id: preview.id,
        error_code: "whatsapp_provider_exception",
      });
      return { outcome: "provider_failed", error_code: "whatsapp_provider_exception" };
    }

    if (!providerResult.ok) {
      await this.#repository.markFailed({
        id: preview.id,
        error_code: providerResult.errorCode,
      });
      return { outcome: "provider_failed", error_code: providerResult.errorCode };
    }

    const updated = await this.#repository.markSent({
      id: preview.id,
      provider_message_id: providerResult.providerMessageId,
      confirmed_by: confirmedBy,
      confirmed_at: input.confirmed_at,
      sent_at: this.#now(),
    });
    if (updated === undefined) {
      return { outcome: "provider_failed", error_code: "message_state_conflict" };
    }
    return { outcome: "sent", message: updated };
  }

  async #resolve(
    applicationId: string,
    contractorId: string,
  ): Promise<ResolvedContext> {
    const loaded = await this.#repository.loadApplicationContext(applicationId);
    if (!loaded.found) {
      if (loaded.reason === "not_applied") return { kind: "blocked", outcome: { outcome: "not_applied" } };
      if (loaded.reason === "job_missing") return { kind: "blocked", outcome: { outcome: "job_not_found" } };
      return { kind: "blocked", outcome: { outcome: "application_not_found" } };
    }
    const context = loaded.context;

    const contractor = await this.#repository.loadContractor(contractorId);
    if (contractor === undefined) {
      return { kind: "blocked", outcome: { outcome: "contractor_not_found" } };
    }

    const phoneE164 = this.#normalizePhone(contractor.phone);
    if (phoneE164 === undefined) {
      return { kind: "blocked", outcome: { outcome: "no_usable_phone" } };
    }

    return {
      kind: "ok",
      context,
      contractorId: contractor.contractor_id,
      contractorName: contractor.name,
      phoneE164,
    };
  }
}
