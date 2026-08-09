import { createHmac, timingSafeEqual } from "node:crypto";

export type WhatsAppDeliveryStatus = "sent" | "delivered" | "read" | "failed";

export interface WhatsAppWebhookStatusEvent {
  readonly kind: "status";
  readonly provider_message_id: string;
  readonly status: WhatsAppDeliveryStatus;
  readonly occurred_at: string;
  readonly error_code?: string;
}

export interface WhatsAppWebhookInboundTextEvent {
  readonly kind: "inbound_text";
  readonly provider_message_id: string;
  readonly from_wa_id: string;
  readonly body: string;
  readonly occurred_at: string;
  readonly context_provider_message_id?: string;
}

export type WhatsAppWebhookEvent = WhatsAppWebhookStatusEvent | WhatsAppWebhookInboundTextEvent;

export type WebhookVerificationResult =
  | { readonly ok: true; readonly challenge: string }
  | { readonly ok: false };

export function verifyWhatsAppWebhookChallenge(
  query: Record<string, unknown>,
  verifyToken: string | undefined,
): WebhookVerificationResult {
  if (typeof verifyToken !== "string" || verifyToken.length === 0) return { ok: false };
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];
  if (mode !== "subscribe" || token !== verifyToken || typeof challenge !== "string") {
    return { ok: false };
  }
  return { ok: true, challenge };
}

export function verifyWhatsAppWebhookSignature(input: {
  readonly rawBody: Buffer;
  readonly signatureHeader: string | string[] | undefined;
  readonly appSecret: string | undefined;
}): boolean {
  const header = Array.isArray(input.signatureHeader)
    ? input.signatureHeader[0]
    : input.signatureHeader;
  if (typeof input.appSecret !== "string" || input.appSecret.length === 0) return false;
  if (typeof header !== "string" || !header.startsWith("sha256=")) return false;

  const suppliedHex = header.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(suppliedHex)) return false;

  const expectedHex = createHmac("sha256", input.appSecret)
    .update(input.rawBody)
    .digest("hex");
  const supplied = Buffer.from(suppliedHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function parseWhatsAppWebhookEvents(payload: unknown): readonly WhatsAppWebhookEvent[] {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return [];
  const object = (payload as { object?: unknown }).object;
  if (object !== "whatsapp_business_account") return [];
  const entries = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return [];

  const events: WhatsAppWebhookEvent[] = [];
  for (const entry of entries) {
    const changes = entry !== null && typeof entry === "object"
      ? (entry as { changes?: unknown }).changes
      : undefined;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = change !== null && typeof change === "object"
        ? (change as { value?: unknown }).value
        : undefined;
      if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
      collectStatusEvents(value as Record<string, unknown>, events);
      collectInboundTextEvents(value as Record<string, unknown>, events);
    }
  }
  return events;
}

function collectStatusEvents(value: Record<string, unknown>, events: WhatsAppWebhookEvent[]): void {
  const statuses = value.statuses;
  if (!Array.isArray(statuses)) return;
  for (const item of statuses) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const status = item as Record<string, unknown>;
    const id = text(status.id);
    const rawStatus = text(status.status);
    const occurredAt = timestampToIso(status.timestamp);
    if (id === undefined || occurredAt === undefined || !isDeliveryStatus(rawStatus)) continue;
    const errorCode = firstErrorCode(status.errors);
    events.push({
      kind: "status",
      provider_message_id: id,
      status: rawStatus,
      occurred_at: occurredAt,
      ...(errorCode === undefined ? {} : { error_code: errorCode }),
    });
  }
}

function collectInboundTextEvents(value: Record<string, unknown>, events: WhatsAppWebhookEvent[]): void {
  const messages = value.messages;
  if (!Array.isArray(messages)) return;
  for (const item of messages) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const message = item as Record<string, unknown>;
    if (message.type !== "text") continue;
    const id = text(message.id);
    const from = text(message.from);
    const occurredAt = timestampToIso(message.timestamp);
    const body = message.text !== null && typeof message.text === "object"
      ? text((message.text as Record<string, unknown>).body)
      : undefined;
    if (id === undefined || from === undefined || occurredAt === undefined || body === undefined) continue;
    const contextId = message.context !== null && typeof message.context === "object"
      ? text((message.context as Record<string, unknown>).id)
      : undefined;
    events.push({
      kind: "inbound_text",
      provider_message_id: id,
      from_wa_id: from,
      body,
      occurred_at: occurredAt,
      ...(contextId === undefined ? {} : { context_provider_message_id: contextId }),
    });
  }
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function timestampToIso(value: unknown): string | undefined {
  const raw = text(value);
  if (raw === undefined) return undefined;
  const milliseconds = Number(raw) * 1000;
  if (!Number.isFinite(milliseconds)) return undefined;
  return new Date(milliseconds).toISOString();
}

function isDeliveryStatus(value: string | undefined): value is WhatsAppDeliveryStatus {
  return value === "sent" || value === "delivered" || value === "read" || value === "failed";
}

function firstErrorCode(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const first = value[0];
  if (first === null || typeof first !== "object" || Array.isArray(first)) return undefined;
  const code = (first as Record<string, unknown>).code;
  if (typeof code === "number") return `whatsapp_error_${code}`;
  return text(code);
}
