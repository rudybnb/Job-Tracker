import express, { type Request, type Response, type Router } from "express";
import { requireAdmin } from "./integration-review-route.ts";
import type {
  ContractorMessageService,
  PreviewOutcome,
  SendOutcome,
} from "./integration-contractor-message-service.ts";

export const CONTRACTOR_MESSAGE_ROUTE = "/api/integrations/messages";
const PREVIEW_PATH = `${CONTRACTOR_MESSAGE_ROUTE}/previews`;
const SEND_PATH = `${CONTRACTOR_MESSAGE_ROUTE}/sends`;
const UNMATCHED_PATH = `${CONTRACTOR_MESSAGE_ROUTE}/unmatched`;
const CONTRACTOR_CANDIDATES_PATH = `${CONTRACTOR_MESSAGE_ROUTE}/contractor-candidates`;

const MAX_ID_LENGTH = 200;
const MAX_CONFIRMED_BY_LENGTH = 200;

export interface ContractorMessageRouteOptions {
  readonly service: ContractorMessageService;
}

function trimmedString(value: unknown, label: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_ID_LENGTH) return undefined;
  return trimmed;
}

type PreviewBodyResult =
  | {
      readonly success: true;
      readonly application_id: string;
      readonly contractor_id: string;
    }
  | { readonly success: false; readonly error: string };

function parsePreviewBody(body: unknown): PreviewBodyResult {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Invalid request body" };
  }
  const candidate = body as Record<string, unknown>;
  const applicationId = trimmedString(candidate.application_id, "application_id");
  if (applicationId === undefined) {
    return { success: false, error: "Invalid application_id" };
  }
  const contractorId = trimmedString(candidate.contractor_id, "contractor_id");
  if (contractorId === undefined) {
    return { success: false, error: "Invalid contractor_id" };
  }
  return { success: true, application_id: applicationId, contractor_id: contractorId };
}

type SendBodyResult =
  | {
      readonly success: true;
      readonly application_id: string;
      readonly contractor_id: string;
      readonly preview_hash: string;
      readonly confirmed_by: string;
      readonly confirmed_at: string;
    }
  | { readonly success: false; readonly error: string };

function parseSendBody(body: unknown): SendBodyResult {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Invalid request body" };
  }
  const candidate = body as Record<string, unknown>;
  const applicationId = trimmedString(candidate.application_id, "application_id");
  if (applicationId === undefined) {
    return { success: false, error: "Invalid application_id" };
  }
  const contractorId = trimmedString(candidate.contractor_id, "contractor_id");
  if (contractorId === undefined) {
    return { success: false, error: "Invalid contractor_id" };
  }
  const previewHash = trimmedString(candidate.preview_hash, "preview_hash");
  if (previewHash === undefined) {
    return { success: false, error: "Invalid preview_hash" };
  }
  const confirmedBy =
    typeof candidate.confirmed_by === "string"
      ? candidate.confirmed_by.trim()
      : "";
  if (confirmedBy.length === 0 || confirmedBy.length > MAX_CONFIRMED_BY_LENGTH) {
    return { success: false, error: "Invalid confirmed_by" };
  }
  const confirmedAt =
    typeof candidate.confirmed_at === "string" ? candidate.confirmed_at.trim() : "";
  if (confirmedAt.length === 0) {
    return { success: false, error: "Invalid confirmed_at" };
  }
  return {
    success: true,
    application_id: applicationId,
    contractor_id: contractorId,
    preview_hash: previewHash,
    confirmed_by: confirmedBy,
    confirmed_at: confirmedAt,
  };
}

export function createContractorMessageRouter(options: ContractorMessageRouteOptions): Router {
  const router = express.Router();
  const { service } = options;

  router.use(requireAdmin as express.RequestHandler);

  router.get(CONTRACTOR_MESSAGE_ROUTE, async (request: Request, response: Response) => {
    try {
      const applicationId = trimmedString(request.query.application_id, "application_id");
      if (applicationId === undefined) {
        response.status(400).json({ error: "Invalid application_id" });
        return;
      }
      const messages = await service.listApplicationMessages(applicationId);
      response.json({ messages });
    } catch (error) {
      console.error("❌ Contractor message history read error:", error);
      response.status(500).json({ error: "Failed to read contractor message history" });
    }
  });

  router.get(UNMATCHED_PATH, async (_request: Request, response: Response) => {
    try {
      const messages = await service.listUnmatchedInboundMessages();
      response.json({ messages });
    } catch (error) {
      console.error("❌ Unmatched contractor message read error:", error);
      response.status(500).json({ error: "Failed to read unmatched contractor messages" });
    }
  });

  router.get(CONTRACTOR_CANDIDATES_PATH, async (request: Request, response: Response) => {
    try {
      const jobId = trimmedString(request.query.job_id, "job_id");
      if (jobId === undefined) {
        response.status(400).json({ error: "Invalid job_id" });
        return;
      }
      const contractors = await service.listContractorCandidates(jobId);
      response.json({ contractors });
    } catch (error) {
      console.error("❌ Contractor candidate read error:", error);
      response.status(500).json({ error: "Failed to read contractor candidates" });
    }
  });

  router.post(PREVIEW_PATH, async (request: Request, response: Response) => {
    try {
      const parsed = parsePreviewBody(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: parsed.error });
        return;
      }
      const outcome = await service.previewApplicationMessage(parsed);
      writePreviewOutcome(response, outcome);
    } catch (error) {
      console.error("❌ Contractor message preview error:", error);
      response.status(500).json({
        error: "Failed to generate contractor message preview",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post(SEND_PATH, async (request: Request, response: Response) => {
    try {
      const parsed = parseSendBody(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: parsed.error });
        return;
      }
      const outcome = await service.sendConfirmedMessage(parsed);
      writeSendOutcome(response, outcome);
    } catch (error) {
      console.error("❌ Contractor message send error:", error);
      response.status(500).json({
        error: "Failed to send contractor message",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return router;
}

function writePreviewOutcome(response: Response, outcome: PreviewOutcome): void {
  switch (outcome.outcome) {
    case "previewed":
      response.status(201).json({ status: "previewed", preview: outcome.preview });
      return;
    case "application_not_found":
      response.status(404).json({ error: "Application not found" });
      return;
    case "not_applied":
      response.status(409).json({ error: "Change order is not applied" });
      return;
    case "job_not_found":
      response.status(409).json({ error: "Applied job not found" });
      return;
    case "contractor_not_found":
      response.status(404).json({ error: "Contractor not found" });
      return;
    case "no_usable_phone":
      response.status(422).json({ error: "Contractor has no usable WhatsApp phone number" });
      return;
  }
}

function writeSendOutcome(response: Response, outcome: SendOutcome): void {
  switch (outcome.outcome) {
    case "sent":
      response.status(200).json({ status: "sent", message: outcome.message });
      return;
    case "application_not_found":
      response.status(404).json({ error: "Application not found" });
      return;
    case "not_applied":
      response.status(409).json({ error: "Change order is not applied" });
      return;
    case "job_not_found":
      response.status(409).json({ error: "Applied job not found" });
      return;
    case "contractor_not_found":
      response.status(404).json({ error: "Contractor not found" });
      return;
    case "no_usable_phone":
      response.status(422).json({ error: "Contractor has no usable WhatsApp phone number" });
      return;
    case "no_preview":
      response.status(409).json({ error: "No preview found; generate a preview before sending" });
      return;
    case "preview_hash_mismatch":
      response.status(409).json({ error: "Preview hash mismatch; refresh the preview before sending" });
      return;
    case "confirmation_required":
      response.status(400).json({ error: "Explicit human confirmation (confirmed_by, confirmed_at) is required" });
      return;
    case "provider_unconfigured":
      response.status(503).json({ error: "WhatsApp provider is not configured" });
      return;
    case "provider_failed":
      response.status(502).json({ error: "Provider send failed", error_code: outcome.error_code });
      return;
  }
}
