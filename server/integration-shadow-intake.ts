import { createHash, randomUUID } from "node:crypto";
import {
  verifyMachineAuthentication,
  type IntegrationKeyLookup,
  type IntegrationNonceLookup,
  type MachineAuthHeaders,
} from "./integration-auth.ts";
import {
  validateApprovedChangeOrder,
  validateIdempotencyKey,
  type ApprovedChangeOrder,
} from "./integration-contracts.ts";
import type {
  ApprovedChangeSnapshot,
  IntegrationShadowRepository,
  ShadowReceipt,
  ShadowRejectionCode,
} from "./integration-shadow-repository.ts";

export interface ShadowIntakeOptions {
  readonly rawBody: Uint8Array;
  readonly headers: MachineAuthHeaders;
  readonly keyLookup: IntegrationKeyLookup;
  readonly nonceLookup: IntegrationNonceLookup;
  readonly repository: IntegrationShadowRepository;
  readonly now?: () => number;
  readonly requestId?: () => string;
}

export type ShadowIntakeResult =
  | { readonly status: "accepted" | "duplicate"; readonly receipt: ShadowReceipt }
  | { readonly status: "rejected"; readonly rejection_code: ShadowRejectionCode };

function rejected(rejectionCode: ShadowRejectionCode): ShadowIntakeResult {
  return { status: "rejected", rejection_code: rejectionCode };
}

function readSingleHeader(headers: MachineAuthHeaders, expectedName: string): string | undefined {
  const matches = Object.entries(headers).filter(
    ([name]) => name.toLowerCase() === expectedName.toLowerCase(),
  );
  if (matches.length !== 1) return undefined;

  const value = matches[0][1];
  if (typeof value !== "string") return undefined;
  return value;
}

function createSnapshot(payload: ApprovedChangeOrder): ApprovedChangeSnapshot {
  const tasks = Object.freeze(payload.tasks.map((task) => Object.freeze({ ...task })));
  return Object.freeze({ ...payload, tasks });
}

function duplicateReceipt(receipt: ShadowReceipt): ShadowReceipt {
  return { ...receipt, status: "duplicate" };
}

function resolveExistingEvent(
  receipt: ShadowReceipt,
  payloadSha256: string,
): ShadowIntakeResult {
  if (receipt.payload_sha256 === payloadSha256) {
    return { status: "duplicate", receipt: duplicateReceipt(receipt) };
  }
  return rejected("event_payload_conflict");
}

export async function processShadowIntake(
  options: ShadowIntakeOptions,
): Promise<ShadowIntakeResult> {
  let authentication;
  try {
    authentication = await verifyMachineAuthentication({
      headers: options.headers,
      rawBody: options.rawBody,
      keyLookup: options.keyLookup,
      nonceLookup: options.nonceLookup,
      now: options.now,
    });
  } catch {
    return rejected("authentication_failed");
  }
  if (!authentication.authenticated) return rejected("authentication_failed");

  let parsed: unknown;
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(options.rawBody);
    parsed = JSON.parse(json);
  } catch {
    return rejected("invalid_json");
  }

  const validation = validateApprovedChangeOrder(parsed);
  if (!validation.success) return rejected("invalid_contract");

  const payload = validation.data;
  const idempotencyKey = readSingleHeader(options.headers, "Idempotency-Key");
  if (!validateIdempotencyKey(idempotencyKey, payload.event_id)) {
    return rejected("invalid_idempotency_key");
  }

  const canonicalPayload = JSON.stringify(payload);
  const payloadSha256 = createHash("sha256").update(canonicalPayload).digest("hex");

  try {
    const existingEvent = await options.repository.findEventReceipt(
      payload.producer,
      payload.event_id,
    );
    if (existingEvent !== undefined) {
      return resolveExistingEvent(existingEvent, payloadSha256);
    }

    const existingRevision = await options.repository.findChangeOrderRevision(
      payload.producer,
      payload.change_order_id,
      payload.revision,
    );
    if (existingRevision !== undefined) {
      return rejected("change_order_revision_conflict");
    }

    const receivedAt = new Date(options.now?.() ?? Date.now()).toISOString();
    const receipt: ShadowReceipt = Object.freeze({
      receipt_id: options.requestId?.() ?? randomUUID(),
      event_id: payload.event_id,
      correlation_id: payload.correlation_id,
      change_order_id: payload.change_order_id,
      revision: payload.revision,
      project_integration_id: payload.project_integration_id,
      payload_sha256: payloadSha256,
      received_at: receivedAt,
      status: "accepted",
    });
    const storeResult = await options.repository.storeAcceptedChange({
      producer: payload.producer,
      receipt,
      snapshot: createSnapshot(payload),
    });

    if (storeResult.outcome === "event_exists") {
      return resolveExistingEvent(storeResult.receipt, payloadSha256);
    }
    if (storeResult.outcome === "revision_exists") {
      return rejected("change_order_revision_conflict");
    }
    return { status: "accepted", receipt };
  } catch {
    return rejected("repository_error");
  }
}
