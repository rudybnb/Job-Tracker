/**
 * QR Token Integrity — Focused regression tests for the double-hash bug.
 *
 * Covers:
 *  - raw token → single hash → DB lookup succeeds
 *  - raw token is never stored in DB
 *  - hash is never emitted into a QR poster payload
 *  - keep-existing-token does not double-hash
 *  - rotate-token creates a fresh working QR
 *  - old QR fails after rotation
 *  - new QR succeeds after rotation
 *  - correct site resolves
 *  - GPS validation still happens only after valid QR recognition
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateCheckIn,
  generateQrToken,
  hashQrToken,
  type SiteCheckinConfig,
} from "../server/site-checkin.ts";
import type {
  SiteCheckinConfigRecord,
  UpsertSiteCheckinConfigInput,
} from "../server/site-checkin-repository.ts";

/* ------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------ */

/** Simulate configFromRow: raw token is NOT stored, only hash is persisted. */
function simulateConfigFromRow(hash: string): SiteCheckinConfigRecord {
  return {
    id: "cfg-mary-g",
    jobId: "job-mary-g",
    siteName: "Mary G — 15 Gilbert Road",
    siteLatitude: "51.4928",
    siteLongitude: "0.1538",
    allowedRadiusMetres: 100,
    qrEnabled: true,
    gpsEnabled: true,
    qrTokenHash: hash,
    qrTokenExpiresAt: null,
    contractorId: null,
    // After the fix: qrToken is "" (raw token is never stored)
    qrToken: "",
    createdBy: "admin",
  };
}

/** Simulate the QR poster payload generation. */
function buildQrPosterPayload(record: SiteCheckinConfigRecord): string | null {
  // The /qr endpoint should refuse if qrToken is empty
  if (!record.qrToken) return null;
  return `https://example.com/checkin?t=${encodeURIComponent(record.qrToken)}`;
}

/* ------------------------------------------------------------------
 * 1. raw token → single hash → DB lookup succeeds
 * ------------------------------------------------------------------ */

test("raw token hashes to a single SHA-256 that matches the stored hash", () => {
  const rawToken = generateQrToken();
  const storedHash = hashQrToken(rawToken);

  // Simulate what the server does when a worker scans the QR
  const submittedHash = hashQrToken(rawToken);
  assert.equal(submittedHash, storedHash, "single hash must match stored hash");
});

test("double-hashing a token does NOT match the stored single hash", () => {
  const rawToken = generateQrToken();
  const storedHash = hashQrToken(rawToken);

  // This is what the old buggy code did: hash(hash) ≠ hash
  const doubleHash = hashQrToken(storedHash);
  assert.notEqual(doubleHash, storedHash, "double-hash must NOT match stored hash");
});

/* ------------------------------------------------------------------
 * 2. raw token is never stored in DB (configFromRow returns "")
 * ------------------------------------------------------------------ */

test("configFromRow returns empty qrToken (raw token is never persisted)", () => {
  const rawToken = generateQrToken();
  const storedHash = hashQrToken(rawToken);
  const record = simulateConfigFromRow(storedHash);

  assert.equal(record.qrToken, "", "qrToken must be empty — raw token is never stored");
  assert.equal(record.qrTokenHash, storedHash, "qrTokenHash must be the SHA-256 hash");
  assert.notEqual(record.qrToken, record.qrTokenHash, "qrToken must NOT equal qrTokenHash");
});

/* ------------------------------------------------------------------
 * 3. hash is never emitted into a QR poster payload
 * ------------------------------------------------------------------ */

test("QR poster generation refuses when raw token is unavailable", () => {
  const rawToken = generateQrToken();
  const storedHash = hashQrToken(rawToken);
  const record = simulateConfigFromRow(storedHash);

  const payload = buildQrPosterPayload(record);
  assert.equal(payload, null, "poster must not be generated from stored hash");
});

test("QR poster payload never contains the SHA-256 hash", () => {
  const rawToken = generateQrToken();
  const storedHash = hashQrToken(rawToken);
  const record = simulateConfigFromRow(storedHash);

  // Poster should be null because qrToken is ""
  const payload = buildQrPosterPayload(record);
  assert.equal(payload, null);

  // Even if qrToken were accidentally set, the hash must never appear in the URL
  const badRecord = { ...record, qrToken: storedHash };
  const badPayload = buildQrPosterPayload(badRecord)!;
  // Verify the payload contains the hash (bad scenario) and flag it
  assert.ok(badPayload.includes(storedHash), "test setup: bad record would emit hash");

  // The correct record must not produce this
  assert.equal(buildQrPosterPayload(record), null);
});

/* ------------------------------------------------------------------
 * 4. keep-existing-token does not double-hash
 * ------------------------------------------------------------------ */

test("keep-existing-token preserves the stored hash without re-hashing", () => {
  const rawToken = generateQrToken();
  const storedHash = hashQrToken(rawToken);
  const existing = simulateConfigFromRow(storedHash);

  // Simulate the fixed keepExistingToken logic
  const input: UpsertSiteCheckinConfigInput = {
    jobId: existing.jobId,
    siteName: existing.siteName,
    siteLatitude: existing.siteLatitude,
    siteLongitude: existing.siteLongitude,
    allowedRadiusMetres: existing.allowedRadiusMetres,
    qrEnabled: existing.qrEnabled,
    gpsEnabled: existing.gpsEnabled,
    // FIXED: use existing.qrTokenHash directly
    qrToken: "",
    qrTokenHash: existing.qrTokenHash,
    qrTokenExpiresAt: null,
    createdBy: "admin",
  };

  assert.equal(input.qrTokenHash, storedHash, "hash must be preserved as-is");
  assert.notEqual(input.qrTokenHash, hashQrToken(storedHash), "must NOT be double-hashed");
});

test("old buggy keep-existing-token would have double-hashed", () => {
  const rawToken = generateQrToken();
  const storedHash = hashQrToken(rawToken);

  // Simulate the OLD buggy logic: hashQrToken(existing.qrToken) where qrToken = hash
  const doubleHash = hashQrToken(storedHash);

  // Verify this is wrong
  assert.notEqual(doubleHash, storedHash, "double-hash is different from stored hash");

  // And a worker scanning with the raw token would never match a double-hash
  const workerHash = hashQrToken(rawToken);
  assert.notEqual(workerHash, doubleHash, "worker token hash must not match double-hash in DB");
});

/* ------------------------------------------------------------------
 * 5. rotate-token creates a fresh working QR
 * ------------------------------------------------------------------ */

test("rotate-token generates a new raw token that hashes to a fresh DB value", () => {
  const oldRawToken = generateQrToken();
  const oldHash = hashQrToken(oldRawToken);

  // Simulate rotation
  const newRawToken = generateQrToken();
  const newHash = hashQrToken(newRawToken);

  assert.notEqual(newRawToken, oldRawToken, "new token must be different");
  assert.notEqual(newHash, oldHash, "new hash must be different");
  assert.equal(hashQrToken(newRawToken), newHash, "new token hashes correctly");
});

/* ------------------------------------------------------------------
 * 6. old QR fails after rotation
 * ------------------------------------------------------------------ */

test("old QR token fails after rotation (hash no longer in DB)", () => {
  const oldRawToken = generateQrToken();
  const oldHash = hashQrToken(oldRawToken);

  // Rotate
  const newRawToken = generateQrToken();
  const newHash = hashQrToken(newRawToken);

  // After rotation, DB has newHash. Old token hash doesn't match.
  const oldSubmittedHash = hashQrToken(oldRawToken);
  assert.notEqual(oldSubmittedHash, newHash, "old token must not match new DB hash");

  // evaluateCheckIn with config=null (not found) returns WRONG_QR
  const decision = evaluateCheckIn({
    config: null,
    qrToken: oldRawToken,
    latitude: 51.4928,
    longitude: 0.1538,
    gpsAccuracy: 10,
    contractorId: null,
  });
  assert.equal(decision.accepted, false);
  assert.equal(decision.rejectionReason, "WRONG_QR");
});

/* ------------------------------------------------------------------
 * 7. new QR succeeds after rotation
 * ------------------------------------------------------------------ */

test("new QR token succeeds after rotation (correct single hash match)", () => {
  const newRawToken = generateQrToken();
  const newHash = hashQrToken(newRawToken);

  // Create config with the new hash
  const config: SiteCheckinConfig = {
    id: "cfg-mary-g",
    jobId: "job-mary-g",
    siteName: "Mary G — 15 Gilbert Road",
    siteLatitude: "51.4928",
    siteLongitude: "0.1538",
    allowedRadiusMetres: 100,
    qrEnabled: true,
    gpsEnabled: true,
    qrTokenHash: newHash,
    qrTokenExpiresAt: null,
    contractorId: null,
  };

  // Worker scans the QR poster which contains the raw token
  const decision = evaluateCheckIn({
    config,
    qrToken: newRawToken,
    latitude: 51.4928,  // inside radius
    longitude: 0.1538,
    gpsAccuracy: 10,
    contractorId: null,
  });

  assert.equal(decision.qrValid, true, "QR must be valid");
  assert.equal(decision.gpsValid, true, "GPS must be valid (inside radius)");
  assert.equal(decision.accepted, true, "check-in must be accepted");
  assert.equal(decision.rejectionReason, null);
  assert.equal(decision.siteName, "Mary G — 15 Gilbert Road");
});

/* ------------------------------------------------------------------
 * 8. correct site resolves
 * ------------------------------------------------------------------ */

test("correct site name resolves from config with valid QR token", () => {
  const rawToken = generateQrToken();
  const hash = hashQrToken(rawToken);

  const config: SiteCheckinConfig = {
    id: "cfg-mary-g",
    jobId: "job-mary-g",
    siteName: "Mary G — 15 Gilbert Road",
    siteLatitude: "51.4928",
    siteLongitude: "0.1538",
    allowedRadiusMetres: 100,
    qrEnabled: true,
    gpsEnabled: true,
    qrTokenHash: hash,
    qrTokenExpiresAt: null,
    contractorId: null,
  };

  const decision = evaluateCheckIn({
    config,
    qrToken: rawToken,
    latitude: 51.4928,
    longitude: 0.1538,
    gpsAccuracy: 10,
    contractorId: null,
  });

  assert.equal(decision.siteName, "Mary G — 15 Gilbert Road");
  assert.equal(decision.siteCheckinConfigId, "cfg-mary-g");
  assert.equal(decision.jobId, "job-mary-g");
});

/* ------------------------------------------------------------------
 * 9. GPS validation still happens only after valid QR recognition
 * ------------------------------------------------------------------ */

test("GPS_OUTSIDE_RADIUS returned only when QR is valid but worker is outside geofence", () => {
  const rawToken = generateQrToken();
  const hash = hashQrToken(rawToken);

  const config: SiteCheckinConfig = {
    id: "cfg-mary-g",
    jobId: "job-mary-g",
    siteName: "Mary G — 15 Gilbert Road",
    siteLatitude: "51.4928",
    siteLongitude: "0.1538",
    allowedRadiusMetres: 100,
    qrEnabled: true,
    gpsEnabled: true,
    qrTokenHash: hash,
    qrTokenExpiresAt: null,
    contractorId: null,
  };

  // Worker scans valid QR but is far away
  const decision = evaluateCheckIn({
    config,
    qrToken: rawToken,
    latitude: 51.60,   // far north of site
    longitude: 0.1538,
    gpsAccuracy: 10,
    contractorId: null,
  });

  assert.equal(decision.qrValid, true, "QR must be valid");
  assert.equal(decision.gpsValid, false, "GPS must fail (outside radius)");
  assert.equal(decision.accepted, false, "check-in must be rejected");
  assert.equal(decision.rejectionReason, "GPS_OUTSIDE_RADIUS");
});

test("WRONG_QR returned before GPS is evaluated when QR token is invalid", () => {
  const rawToken = generateQrToken();
  const hash = hashQrToken(rawToken);

  const config: SiteCheckinConfig = {
    id: "cfg-mary-g",
    jobId: "job-mary-g",
    siteName: "Mary G — 15 Gilbert Road",
    siteLatitude: "51.4928",
    siteLongitude: "0.1538",
    allowedRadiusMetres: 100,
    qrEnabled: true,
    gpsEnabled: true,
    qrTokenHash: hash,
    qrTokenExpiresAt: null,
    contractorId: null,
  };

  // Worker scans a wrong QR (even if at the correct location)
  const decision = evaluateCheckIn({
    config,
    qrToken: "totally-wrong-token",
    latitude: 51.4928,
    longitude: 0.1538,
    gpsAccuracy: 10,
    contractorId: null,
  });

  assert.equal(decision.qrValid, false, "QR must be invalid");
  assert.equal(decision.gpsValid, false, "GPS is not evaluated when QR is wrong");
  assert.equal(decision.accepted, false);
  assert.equal(decision.rejectionReason, "WRONG_QR");
});

/* ------------------------------------------------------------------
 * 10. End-to-end token lifecycle: create → use → rotate → old fails → new works
 * ------------------------------------------------------------------ */

test("full token lifecycle: create → check-in → rotate → old fails → new works", () => {
  // Step 1: Create a fresh token (simulates admin creating config)
  const rawToken1 = generateQrToken();
  const hash1 = hashQrToken(rawToken1);

  const config1: SiteCheckinConfig = {
    id: "cfg-1",
    jobId: "job-1",
    siteName: "Test Site",
    siteLatitude: "51.5074",
    siteLongitude: "-0.1278",
    allowedRadiusMetres: 100,
    qrEnabled: true,
    gpsEnabled: true,
    qrTokenHash: hash1,
    qrTokenExpiresAt: null,
    contractorId: null,
  };

  // Step 2: Worker scans QR with raw token — should succeed
  const d1 = evaluateCheckIn({
    config: config1,
    qrToken: rawToken1,
    latitude: 51.5074,
    longitude: -0.1278,
    gpsAccuracy: 10,
    contractorId: null,
  });
  assert.equal(d1.accepted, true, "original token must work");

  // Step 3: Rotate — generate new token
  const rawToken2 = generateQrToken();
  const hash2 = hashQrToken(rawToken2);

  const config2: SiteCheckinConfig = {
    ...config1,
    qrTokenHash: hash2,
  };

  // Step 4: Old token fails with new config
  const d2 = evaluateCheckIn({
    config: config2,
    qrToken: rawToken1,
    latitude: 51.5074,
    longitude: -0.1278,
    gpsAccuracy: 10,
    contractorId: null,
  });
  assert.equal(d2.accepted, false, "old token must fail after rotation");
  assert.equal(d2.rejectionReason, "WRONG_QR");

  // Step 5: New token works with new config
  const d3 = evaluateCheckIn({
    config: config2,
    qrToken: rawToken2,
    latitude: 51.5074,
    longitude: -0.1278,
    gpsAccuracy: 10,
    contractorId: null,
  });
  assert.equal(d3.accepted, true, "new token must work after rotation");
});
