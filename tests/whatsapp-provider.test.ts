import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createWhatsAppProvider,
  HttpWhatsAppProvider,
} from "../server/whatsapp.ts";
import type { WhatsAppSendResult } from "../server/whatsapp.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface CapturedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

test("provider is not configured when env credentials are missing", () => {
  assert.equal(createWhatsAppProvider({}), undefined);
  assert.equal(createWhatsAppProvider({ WHATSAPP_ACCESS_TOKEN: "" }), undefined);
  assert.equal(
    createWhatsAppProvider({ WHATSAPP_PHONE_NUMBER_ID: "   " }),
    undefined,
  );
  assert.equal(
    createWhatsAppProvider({ WHATSAPP_ACCESS_TOKEN: "token", WHATSAPP_PHONE_NUMBER_ID: "" }),
    undefined,
  );
});

test("provider is configured when both env credentials are present", () => {
  const provider = createWhatsAppProvider({
    WHATSAPP_ACCESS_TOKEN: "access-token",
    WHATSAPP_PHONE_NUMBER_ID: "phone-id-0001",
  });
  assert.ok(provider !== undefined);
  assert.equal(provider.name, "meta-whatsapp");
});

test("sendText posts the correct WhatsApp Cloud API request and returns the message id", async () => {
  const captured: CapturedRequest[] = [];
  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    captured.push({
      url,
      method: (init.method ?? "GET").toUpperCase(),
      headers: (init.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init.body)),
    });
    return jsonResponse({ messages: [{ id: "wamid.GM00123" }] });
  };

  const provider = new HttpWhatsAppProvider({
    accessToken: "secret-token",
    phoneNumberId: "123456789",
    fetchImpl: fetchImpl as typeof fetch,
  });

  const result = await provider.sendText({ to: "+447912345678", body: "Test body" });

  assert.deepEqual(result, { ok: true, providerMessageId: "wamid.GM00123" });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].method, "POST");
  assert.equal(captured[0].url, "https://graph.facebook.com/v21.0/123456789/messages");
  assert.equal(captured[0].headers.Authorization, "Bearer secret-token");
  assert.deepEqual(captured[0].body, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "+447912345678",
    type: "text",
    text: { body: "Test body" },
    preview_url: false,
  });
});

test("sendText surfaces a controlled error on an HTTP failure", async () => {
  const fetchImpl = async (): Promise<Response> =>
    jsonResponse(
      { error: { code: 190, message: "Bad token" } },
      401,
    );

  const provider = new HttpWhatsAppProvider({
    accessToken: "bad-token",
    phoneNumberId: "123456789",
    fetchImpl: fetchImpl as typeof fetch,
  });

  const result: WhatsAppSendResult = await provider.sendText({
    to: "+447912345678",
    body: "Test body",
  });
  assert.deepEqual(result, { ok: false, errorCode: "whatsapp_error_190" });
});

test("sendText returns a controlled error when the message id is missing", async () => {
  const fetchImpl = async (): Promise<Response> => jsonResponse({ messages: [] });

  const provider = new HttpWhatsAppProvider({
    accessToken: "token",
    phoneNumberId: "123456789",
    fetchImpl: fetchImpl as typeof fetch,
  });

  const result = await provider.sendText({ to: "+447912345678", body: "Test body" });
  assert.deepEqual(result, { ok: false, errorCode: "whatsapp_missing_message_id" });
});

test("sendText rejects invalid destinations without any HTTP call", async () => {
  let called = false;
  const fetchImpl = async (): Promise<Response> => {
    called = true;
    return jsonResponse({});
  };

  const provider = new HttpWhatsAppProvider({
    accessToken: "token",
    phoneNumberId: "123456789",
    fetchImpl: fetchImpl as typeof fetch,
  });

  const result = await provider.sendText({ to: "not-a-number", body: "Test body" });
  assert.deepEqual(result, { ok: false, errorCode: "whatsapp_invalid_input" });
  assert.equal(called, false);
});
