/**
 * Phase QR-5 — Worker phone check-in/check-out flow tests.
 *
 * Focused on QR-5 additions:
 *   - toIsoTimestamp: normalises the checked-in time surfaced to the
 *     worker phone by the current-session endpoint.
 *   - hashQrToken: the server-side token hashing reused by the
 *     current-session and checkout endpoints (same token → same session).
 */

import assert from "node:assert/strict";
import test from "node:test";
import { hashQrToken, toIsoTimestamp } from "../server/site-checkin.ts";

test("toIsoTimestamp: Date input becomes ISO", () => {
  assert.equal(toIsoTimestamp(new Date("2026-01-01T10:00:00Z")), "2026-01-01T10:00:00.000Z");
});

test("toIsoTimestamp: ISO string input is preserved", () => {
  assert.equal(toIsoTimestamp("2026-01-01T10:00:00Z"), "2026-01-01T10:00:00.000Z");
});

test("toIsoTimestamp: null/undefined map to null", () => {
  assert.equal(toIsoTimestamp(null), null);
  assert.equal(toIsoTimestamp(undefined), null);
});

test("toIsoTimestamp: invalid input maps to null, never throws", () => {
  assert.equal(toIsoTimestamp("not-a-date"), null);
  assert.equal(toIsoTimestamp(""), null);
});

test("hashQrToken: deterministic hash reused for session lookups", () => {
  const token = "site-qr-token-abc";
  assert.equal(hashQrToken(token).length, 64);
  assert.equal(hashQrToken(token), hashQrToken(token));
  assert.notEqual(hashQrToken(token), hashQrToken("site-qr-token-xyz"));
});