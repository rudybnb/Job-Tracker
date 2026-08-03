import express, { type Router } from "express";
import {
  processShadowIntake,
  type ShadowIntakeResult,
} from "./integration-shadow-intake.ts";
import type {
  IntegrationKeyLookup,
  IntegrationNonceLookup,
  MachineAuthHeaders,
} from "./integration-auth.ts";
import type { IntegrationShadowRepository } from "./integration-shadow-repository.ts";

export const JARVIS_SHADOW_CHANGE_ORDER_ROUTE = "/api/integrations/jarvis/v1/change-orders";

export type IntegrationNonceStore = (
  keyId: string,
  nonce: string,
) => void | Promise<void>;

export interface JarvisShadowRouteOptions {
  readonly enabled: boolean;
  readonly repository: IntegrationShadowRepository;
  readonly keyLookup: IntegrationKeyLookup;
  readonly nonceLookup: IntegrationNonceLookup;
  readonly nonceStore: IntegrationNonceStore;
  readonly now?: () => number;
  readonly requestId?: () => string;
}

function readSingleHeader(headers: MachineAuthHeaders, expectedName: string): string | undefined {
  const matches = Object.entries(headers).filter(
    ([name]) => name.toLowerCase() === expectedName.toLowerCase(),
  );
  if (matches.length !== 1) return undefined;

  const value = matches[0][1];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function statusForResult(result: ShadowIntakeResult): number {
  switch (result.status) {
    case "accepted":
      return 202;
    case "duplicate":
      return 200;
    case "rejected":
      break;
  }

  switch (result.rejection_code) {
    case "authentication_failed":
      return 401;
    case "invalid_json":
    case "invalid_idempotency_key":
      return 400;
    case "invalid_contract":
      return 422;
    case "event_payload_conflict":
    case "change_order_revision_conflict":
      return 409;
    case "repository_error":
      return 500;
  }
}

function responseForResult(result: ShadowIntakeResult): Record<string, unknown> {
  switch (result.status) {
    case "accepted":
    case "duplicate":
      return {
        status: result.status,
        receipt: result.receipt,
      };
    case "rejected":
      return {
        status: "rejected",
        rejection_code: result.rejection_code,
      };
  }
}

async function storeAuthenticatedNonce(
  headers: MachineAuthHeaders,
  store: IntegrationNonceStore,
): Promise<void> {
  const keyId = readSingleHeader(headers, "X-API-Key-Id");
  const nonce = readSingleHeader(headers, "X-Nonce");
  if (keyId !== undefined && nonce !== undefined) {
    await store(keyId, nonce);
  }
}

export function createJarvisShadowIntegrationRouter(
  options: JarvisShadowRouteOptions,
): Router {
  const router = express.Router();
  if (!options.enabled) return router;

  router.post(
    JARVIS_SHADOW_CHANGE_ORDER_ROUTE,
    express.raw({ type: "application/json", limit: "1mb" }),
    async (request, response) => {
      const rawBody = Buffer.isBuffer(request.body)
        ? request.body
        : Buffer.from([]);

      const result = await processShadowIntake({
        rawBody,
        headers: request.headers,
        keyLookup: options.keyLookup,
        nonceLookup: options.nonceLookup,
        repository: options.repository,
        now: options.now,
        requestId: options.requestId,
      });

      if (!(result.status === "rejected" && result.rejection_code === "authentication_failed")) {
        await storeAuthenticatedNonce(request.headers, options.nonceStore);
      }

      response.status(statusForResult(result)).json(responseForResult(result));
    },
  );

  return router;
}
