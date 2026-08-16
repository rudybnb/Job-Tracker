import express, { type Request, type Response, type Router } from "express";
import type { ContractorMessageService } from "./integration-contractor-message-service.ts";
import {
  parseWhatsAppWebhookEvents,
  verifyWhatsAppWebhookChallenge,
  verifyWhatsAppWebhookSignature,
} from "./whatsapp-webhook.ts";

export const WHATSAPP_WEBHOOK_ROUTE = "/api/whatsapp/webhook";

export interface WhatsAppWebhookRouteOptions {
  readonly service: ContractorMessageService;
  readonly verifyToken?: string;
  readonly appSecret?: string;
  readonly phoneNumberId?: string;
}

export function createWhatsAppWebhookRouter(options: WhatsAppWebhookRouteOptions): Router {
  const router = express.Router();

  router.get(WHATSAPP_WEBHOOK_ROUTE, (request: Request, response: Response) => {
    const verification = verifyWhatsAppWebhookChallenge(request.query, options.verifyToken);
    if (!verification.ok) {
      response.sendStatus(403);
      return;
    }
    response.status(200).send(verification.challenge);
  });

  router.post(
    WHATSAPP_WEBHOOK_ROUTE,
    express.raw({ type: "application/json", limit: "1mb" }),
    async (request: Request, response: Response) => {
      const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
      const verified = verifyWhatsAppWebhookSignature({
        rawBody,
        signatureHeader: request.header("x-hub-signature-256"),
        appSecret: options.appSecret,
      });
      if (!verified) {
        response.sendStatus(401);
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(rawBody.toString("utf8"));
      } catch {
        response.status(400).json({ error: "Invalid webhook JSON" });
        return;
      }

      const events = parseWhatsAppWebhookEvents(payload, {
        expectedPhoneNumberId: options.phoneNumberId,
      });
      await options.service.handleWhatsAppWebhookEvents(events);
      response.status(200).json({ status: "ok", events: events.length });
    },
  );

  return router;
}
