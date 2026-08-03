import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const MACHINE_AUTH_WINDOW_SECONDS = 5 * 60;

export interface MachineAuthHeaders {
  readonly [name: string]: string | readonly string[] | undefined;
}

export type IntegrationKeyLookup = (
  keyId: string,
) => string | Uint8Array | null | undefined | Promise<string | Uint8Array | null | undefined>;

export type IntegrationNonceLookup = (
  keyId: string,
  nonce: string,
) => boolean | Promise<boolean>;

export type MachineAuthFailureCode =
  | "missing_or_invalid_header"
  | "unknown_api_key"
  | "expired_timestamp"
  | "invalid_content_hash"
  | "invalid_signature"
  | "replayed_nonce";

export type MachineAuthResult =
  | { authenticated: true; keyId: string; nonce: string; timestamp: number }
  | { authenticated: false; code: MachineAuthFailureCode };

export interface VerifyMachineAuthenticationOptions {
  headers: MachineAuthHeaders;
  rawBody: Uint8Array;
  keyLookup: IntegrationKeyLookup;
  nonceLookup: IntegrationNonceLookup;
  now?: () => number;
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

function decodeSha256Hex(value: string): Buffer | undefined {
  if (!/^[a-f0-9]{64}$/i.test(value)) return undefined;
  return Buffer.from(value, "hex");
}

function constantTimeDigestMatch(actual: Buffer, suppliedHex: string): boolean {
  const supplied = decodeSha256Hex(suppliedHex);
  return supplied !== undefined && timingSafeEqual(actual, supplied);
}

export function buildMachineAuthSigningInput(
  keyId: string,
  timestamp: string,
  nonce: string,
  contentSha256: string,
): string {
  return ["v1", keyId, timestamp, nonce, contentSha256.toLowerCase()].join("\n");
}

export async function verifyMachineAuthentication(
  options: VerifyMachineAuthenticationOptions,
): Promise<MachineAuthResult> {
  const keyId = readSingleHeader(options.headers, "X-API-Key-Id");
  const timestampHeader = readSingleHeader(options.headers, "X-Timestamp");
  const nonce = readSingleHeader(options.headers, "X-Nonce");
  const contentSha256 = readSingleHeader(options.headers, "X-Content-SHA256");
  const signature = readSingleHeader(options.headers, "X-Signature");

  if (
    keyId === undefined ||
    !/^[A-Za-z0-9._-]{1,128}$/.test(keyId) ||
    timestampHeader === undefined ||
    !/^\d{1,12}$/.test(timestampHeader) ||
    nonce === undefined ||
    !/^[A-Za-z0-9._~-]{16,128}$/.test(nonce) ||
    contentSha256 === undefined ||
    decodeSha256Hex(contentSha256) === undefined ||
    signature === undefined ||
    decodeSha256Hex(signature) === undefined
  ) {
    return { authenticated: false, code: "missing_or_invalid_header" };
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isSafeInteger(timestamp)) {
    return { authenticated: false, code: "missing_or_invalid_header" };
  }

  const nowSeconds = Math.floor((options.now?.() ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestamp) > MACHINE_AUTH_WINDOW_SECONDS) {
    return { authenticated: false, code: "expired_timestamp" };
  }

  const secret = await options.keyLookup(keyId);
  if (secret === null || secret === undefined) {
    return { authenticated: false, code: "unknown_api_key" };
  }

  const actualContentHash = createHash("sha256").update(options.rawBody).digest();
  if (!constantTimeDigestMatch(actualContentHash, contentSha256)) {
    return { authenticated: false, code: "invalid_content_hash" };
  }

  const signingInput = buildMachineAuthSigningInput(
    keyId,
    timestampHeader,
    nonce,
    contentSha256,
  );
  const expectedSignature = createHmac("sha256", secret).update(signingInput).digest();
  if (!constantTimeDigestMatch(expectedSignature, signature)) {
    return { authenticated: false, code: "invalid_signature" };
  }

  if (await options.nonceLookup(keyId, nonce)) {
    return { authenticated: false, code: "replayed_nonce" };
  }

  return { authenticated: true, keyId, nonce, timestamp };
}
