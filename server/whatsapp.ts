// Minimal Meta WhatsApp Cloud API adapter.
// Configuration comes ONLY from the environment (WHATSAPP_ACCESS_TOKEN,
// WHATSAPP_PHONE_NUMBER_ID). The provider is dependency-injectable so tests
// substitute a mock and never call Meta.

export type WhatsAppSendResult =
  | { readonly ok: true; readonly providerMessageId: string }
  | { readonly ok: false; readonly errorCode: string };

export interface WhatsAppSendInput {
  readonly to: string;
  readonly body: string;
}

export interface WhatsAppProvider {
  readonly name: string;
  sendText(input: WhatsAppSendInput): Promise<WhatsAppSendResult>;
}

const E164_DESTINATION_PATTERN = /^\+[0-9]{8,15}$/;
const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

export interface HttpWhatsAppProviderOptions {
  readonly accessToken: string;
  readonly phoneNumberId: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

export class HttpWhatsAppProvider implements WhatsAppProvider {
  readonly name = "meta-whatsapp";
  readonly #accessToken: string;
  readonly #phoneNumberId: string;
  readonly #baseUrl: string;
  readonly #fetchImpl: typeof fetch;

  constructor(options: HttpWhatsAppProviderOptions) {
    this.#accessToken = options.accessToken;
    this.#phoneNumberId = options.phoneNumberId;
    this.#baseUrl = (options.baseUrl ?? GRAPH_API_BASE).replace(/\/+$/, "");
    this.#fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async sendText(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
    const to = typeof input?.to === "string" ? input.to.trim() : "";
    const body = typeof input?.body === "string" ? input.body.trim() : "";

    if (to.length === 0 || !E164_DESTINATION_PATTERN.test(to) || body.length === 0) {
      return { ok: false, errorCode: "whatsapp_invalid_input" };
    }

    try {
      const response = await this.#fetchImpl(`${this.#baseUrl}/${this.#phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.#accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { body },
          preview_url: false,
        }),
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        return { ok: false, errorCode: metaErrorCode(payload, response.status) };
      }

      const messageId = extractMessageId(payload);
      if (messageId === undefined) {
        return { ok: false, errorCode: "whatsapp_missing_message_id" };
      }
      return { ok: true, providerMessageId: messageId };
    } catch {
      return { ok: false, errorCode: "whatsapp_provider_network_error" };
    }
  }
}

export function createWhatsAppProvider(
  env: Record<string, string | undefined> = process.env,
): WhatsAppProvider | undefined {
  const accessToken = env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (
    accessToken === undefined ||
    accessToken.length === 0 ||
    phoneNumberId === undefined ||
    phoneNumberId.length === 0
  ) {
    return undefined;
  }
  return new HttpWhatsAppProvider({ accessToken, phoneNumberId });
}

function metaErrorCode(payload: unknown, httpStatus: number): string {
  if (payload !== null && typeof payload === "object") {
    const error = (payload as { error?: { code?: unknown; message?: unknown } }).error;
    if (error !== undefined && typeof error.code === "number") {
      return `whatsapp_error_${error.code}`;
    }
    if (
      error !== undefined &&
      typeof error.message === "string" &&
      error.message.trim().length > 0
    ) {
      return "whatsapp_api_error";
    }
  }
  return `whatsapp_http_${httpStatus}`;
}

function extractMessageId(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== "object") return undefined;
  const messages = (payload as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return undefined;
  const first = messages[0];
  if (first === null || typeof first !== "object") return undefined;
  const id = (first as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}
