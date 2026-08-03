import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { test } from "node:test";
import {
  buildMachineAuthSigningInput,
  verifyMachineAuthentication,
  type IntegrationNonceLookup,
  type MachineAuthHeaders,
} from "../server/integration-auth.ts";

const NOW_MS = Date.UTC(2026, 7, 3, 12, 0, 0);
const KEY_ID = "jarvis-test-key";
const SECRET = "offline-test-secret";
const NONCE = "nonce-00000000000001";
const RAW_BODY = Buffer.from('{"event_id":"evt-2026-0001"}', "utf8");

function signedHeaders(overrides: MachineAuthHeaders = {}): MachineAuthHeaders {
  const defaultTimestamp = String(Math.floor(NOW_MS / 1000));
  const defaultContentHash = createHash("sha256").update(RAW_BODY).digest("hex");
  const timestamp = typeof overrides["X-Timestamp"] === "string"
    ? overrides["X-Timestamp"]
    : defaultTimestamp;
  const contentHash = typeof overrides["X-Content-SHA256"] === "string"
    ? overrides["X-Content-SHA256"]
    : defaultContentHash;
  const calculatedSignature = createHmac("sha256", SECRET)
    .update(buildMachineAuthSigningInput(KEY_ID, timestamp, NONCE, contentHash))
    .digest("hex");
  return {
    "X-API-Key-Id": KEY_ID,
    "X-Timestamp": timestamp,
    "X-Nonce": NONCE,
    "X-Content-SHA256": contentHash,
    "X-Signature": calculatedSignature,
    ...overrides,
  };
}

async function verify(
  headers: MachineAuthHeaders,
  nonceLookup: IntegrationNonceLookup = () => false,
) {
  return verifyMachineAuthentication({
    headers,
    rawBody: RAW_BODY,
    keyLookup: (keyId) => keyId === KEY_ID ? SECRET : undefined,
    nonceLookup,
    now: () => NOW_MS,
  });
}

test("valid machine-authenticated request passes with injected lookups", async () => {
  const result = await verify(signedHeaders());
  assert.deepEqual(result, {
    authenticated: true,
    keyId: KEY_ID,
    nonce: NONCE,
    timestamp: Math.floor(NOW_MS / 1000),
  });
});

test("invalid content hash fails", async () => {
  const result = await verify(signedHeaders({
    "X-Content-SHA256": "0".repeat(64),
  }));
  assert.deepEqual(result, { authenticated: false, code: "invalid_content_hash" });
});

test("invalid signature fails", async () => {
  const result = await verify(signedHeaders({
    "X-Signature": "0".repeat(64),
  }));
  assert.deepEqual(result, { authenticated: false, code: "invalid_signature" });
});

test("timestamp outside the five-minute window fails", async () => {
  const expiredTimestamp = String(Math.floor(NOW_MS / 1000) - 301);
  const result = await verify(signedHeaders({ "X-Timestamp": expiredTimestamp }));
  assert.deepEqual(result, { authenticated: false, code: "expired_timestamp" });
});

test("replayed nonce fails through the injected nonce lookup", async () => {
  let lookupArguments: [string, string] | undefined;
  const result = await verify(signedHeaders(), (keyId, nonce) => {
    lookupArguments = [keyId, nonce];
    return true;
  });
  assert.deepEqual(lookupArguments, [KEY_ID, NONCE]);
  assert.deepEqual(result, { authenticated: false, code: "replayed_nonce" });
});

test("all five authentication headers are required", async () => {
  for (const header of [
    "X-API-Key-Id",
    "X-Timestamp",
    "X-Nonce",
    "X-Content-SHA256",
    "X-Signature",
  ]) {
    const headers = { ...signedHeaders() };
    delete headers[header];
    const result = await verify(headers);
    assert.deepEqual(result, { authenticated: false, code: "missing_or_invalid_header" });
  }
});
