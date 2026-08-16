import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import express from "express";
import type { ContractorMessageService } from "../server/integration-contractor-message-service.ts";
import {
  parseWhatsAppWebhookEvents,
  verifyWhatsAppWebhookChallenge,
  verifyWhatsAppWebhookSignature,
  type WhatsAppWebhookEvent,
} from "../server/whatsapp-webhook.ts";
import {
  createWhatsAppWebhookRouter,
  WHATSAPP_WEBHOOK_ROUTE,
} from "../server/whatsapp-webhook-route.ts";

const APP_SECRET = "app-secret-0001";
const VERIFY_TOKEN = "verify-token-0001";

function signature(rawBody: Buffer, secret = APP_SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

test("valid GET verification succeeds and wrong verify token is rejected", () => {
  assert.deepEqual(
    verifyWhatsAppWebhookChallenge(
      {
        "hub.mode": "subscribe",
        "hub.verify_token": VERIFY_TOKEN,
        "hub.challenge": "challenge-123",
      },
      VERIFY_TOKEN,
    ),
    { ok: true, challenge: "challenge-123" },
  );

  assert.deepEqual(
    verifyWhatsAppWebhookChallenge(
      {
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong",
        "hub.challenge": "challenge-123",
      },
      VERIFY_TOKEN,
    ),
    { ok: false },
  );
});

test("X-Hub-Signature-256 accepts valid raw bytes and rejects invalid or missing signatures", () => {
  const rawBody = Buffer.from('{"entry":[{"id":"1"}],"object":"whatsapp_business_account"}');

  assert.equal(
    verifyWhatsAppWebhookSignature({
      rawBody,
      signatureHeader: signature(rawBody),
      appSecret: APP_SECRET,
    }),
    true,
  );
  assert.equal(
    verifyWhatsAppWebhookSignature({
      rawBody,
      signatureHeader: undefined,
      appSecret: APP_SECRET,
    }),
    false,
  );
  assert.equal(
    verifyWhatsAppWebhookSignature({
      rawBody,
      signatureHeader: signature(Buffer.from("{}")),
      appSecret: APP_SECRET,
    }),
    false,
  );
});

test("signature verification uses raw bytes instead of reparsed JSON", () => {
  const rawBody = Buffer.from('{ "object" : "whatsapp_business_account", "entry" : [] }');
  const reparsed = Buffer.from(JSON.stringify(JSON.parse(rawBody.toString("utf8"))));

  assert.equal(
    verifyWhatsAppWebhookSignature({
      rawBody,
      signatureHeader: signature(rawBody),
      appSecret: APP_SECRET,
    }),
    true,
  );
  assert.equal(
    verifyWhatsAppWebhookSignature({
      rawBody: reparsed,
      signatureHeader: signature(rawBody),
      appSecret: APP_SECRET,
    }),
    false,
  );
});

test("parser extracts only WhatsApp status and inbound text events", () => {
  assert.deepEqual(parseWhatsAppWebhookEvents({ object: "page", entry: [] }), []);

  const events = parseWhatsAppWebhookEvents({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [
                { id: "wamid.outbound-1", status: "delivered", timestamp: "1786207200" },
                { id: "wamid.outbound-2", status: "failed", timestamp: "1786207260", errors: [{ code: 131026 }] },
              ],
              messages: [
                {
                  id: "wamid.inbound-1",
                  from: "447912345678",
                  timestamp: "1786207320",
                  type: "text",
                  text: { body: "Received" },
                  context: { id: "wamid.outbound-1" },
                },
                { id: "wamid.image-1", from: "447912345678", timestamp: "1786207320", type: "image" },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.equal(events.length, 3);
  assert.deepEqual(events[0], {
    kind: "status",
    provider_message_id: "wamid.outbound-1",
    status: "delivered",
    occurred_at: "2026-08-08T16:40:00.000Z",
  });
  assert.deepEqual(events[1], {
    kind: "status",
    provider_message_id: "wamid.outbound-2",
    status: "failed",
    occurred_at: "2026-08-08T16:41:00.000Z",
    error_code: "whatsapp_error_131026",
  });
  assert.deepEqual(events[2], {
    kind: "inbound_text",
    provider_message_id: "wamid.inbound-1",
    from_wa_id: "447912345678",
    body: "Received",
    occurred_at: "2026-08-08T16:42:00.000Z",
    context_provider_message_id: "wamid.outbound-1",
  });
});

test("parser filters events to the configured Meta phone number id when provided", () => {
  const events = parseWhatsAppWebhookEvents(
    {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "configured-phone-id" },
                messages: [
                  {
                    id: "wamid.inbound-configured",
                    from: "447912345678",
                    timestamp: "1786207320",
                    type: "text",
                    text: { body: "For configured number" },
                  },
                ],
              },
            },
            {
              value: {
                metadata: { phone_number_id: "other-phone-id" },
                messages: [
                  {
                    id: "wamid.inbound-other",
                    from: "447912345678",
                    timestamp: "1786207320",
                    type: "text",
                    text: { body: "For other number" },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    { expectedPhoneNumberId: "configured-phone-id" },
  );

  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    kind: "inbound_text",
    provider_message_id: "wamid.inbound-configured",
    from_wa_id: "447912345678",
    body: "For configured number",
    occurred_at: "2026-08-08T16:42:00.000Z",
  });
});

class RecordingWebhookService implements ContractorMessageService {
  readonly events: WhatsAppWebhookEvent[] = [];

  async previewApplicationMessage(): Promise<never> {
    throw new Error("not used");
  }

  async sendConfirmedMessage(): Promise<never> {
    throw new Error("not used");
  }

  async handleWhatsAppWebhookEvents(events: readonly WhatsAppWebhookEvent[]): Promise<void> {
    this.events.push(...events);
  }
}

test("webhook route uses raw body before express.json and requires Meta signature, not admin session", async () => {
  const service = new RecordingWebhookService();
  const app = express();
  app.use(createWhatsAppWebhookRouter({
    service,
    verifyToken: VERIFY_TOKEN,
    appSecret: APP_SECRET,
  }));
  app.use(express.json());

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    assert.ok(address !== null);
    const base = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const get = await fetch(
      `${base}${WHATSAPP_WEBHOOK_ROUTE}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=abc123`,
    );
    assert.equal(get.status, 200);
    assert.equal(await get.text(), "abc123");

    const rawBody = Buffer.from(
      '{ "object" : "whatsapp_business_account", "entry" : [{ "changes" : [{ "value" : { "statuses" : [{ "id" : "wamid.route-1", "status" : "sent", "timestamp" : "1786207200" }] } }] }] }',
    );
    const accepted = await fetch(`${base}${WHATSAPP_WEBHOOK_ROUTE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": signature(rawBody),
      },
      body: rawBody,
    });
    assert.equal(accepted.status, 200);
    assert.equal(service.events.length, 1);
    assert.equal(service.events[0].kind, "status");

    const missing = await fetch(`${base}${WHATSAPP_WEBHOOK_ROUTE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: rawBody,
    });
    assert.equal(missing.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  }
});
