import assert from "node:assert/strict";
import test from "node:test";
import {
  describeCandidateFlags,
  rankSmartScheduleCandidates,
  type RankedWordJobCandidate,
} from "../shared/job-match";

/**
 * Unit tests for the Smart Schedule job-picker ranking (Word-first attach).
 *
 * The Spencer scenario mirrors the verified live production data:
 * one canonical structured Word job, an identical twin duplicate, two test
 * junk jobs and one quote-polluted import. Ranking must recommend ONLY the
 * canonical job without exposing UUID-based choice as the primary UX.
 *
 * CRITICAL INVARIANT: row/task/resource counts are NEVER ranking signals.
 * An older incorrect parser can produce more rows than the correct final
 * parser, so "more tasks" never means "better candidate."
 */

const CANONICAL = "d774b05c-89e5-43d1-9c3d-3379dbb2ba8d";
const TWIN = "5cd7dfd3-4c9e-49e0-abc6-c6e611641ae2";
const JUNK_A = "06bbfb63-510d-4982-96f7-a31e656a2d56";
const JUNK_B = "5070ca6a-ca5d-4954-a9ff-21e3a3d698c2";
const POLLUTED = "9cf5e387-6c67-446c-b7c9-db46dee8309c";

function spencerCandidates(): RankedWordJobCandidate[] {
  return [
    {
      jobId: JUNK_A,
      title: "Spencer House",
      clientName: "Promise Igbinedion",
      address: "Different Address 999 Nonexistent St",
      postcode: "SW1A 1AA",
      hasCurrentSourceImport: false,
      latestImportAt: null,
    },
    {
      jobId: JUNK_B,
      title: "Spencer House",
      clientName: "Promise Igbinedion",
      address: "Different Address 999 Nonexistent St",
      postcode: "SW1A 1AA",
      hasCurrentSourceImport: false,
      latestImportAt: null,
    },
    {
      jobId: TWIN,
      title: "Spencer House",
      clientName: "Promise Igbinedion",
      address: "Spencer House\nSpencer Road\nBirchington\nCT7 9EZ",
      postcode: "CT7 9EZ",
      hasCurrentSourceImport: false,
      latestImportAt: null,
    },
    {
      jobId: POLLUTED,
      title: "Spencer House",
      clientName: "Promise Igbinedion",
      address:
        "Spencer House\nSpencer Road\nBirchington\nCT7 9EZ\nTotal (excl. VAT): £17,350.46\nSummary of Estimate",
      postcode: "CT7 9EZ",
      hasCurrentSourceImport: false,
      latestImportAt: null,
    },
    {
      jobId: CANONICAL,
      title: "Spencer House",
      clientName: "Promise Igbinedion",
      address: "Spencer House\nSpencer Road\nBirchington\nCT7 9EZ",
      postcode: "CT7 9EZ",
      hasCurrentSourceImport: true,
      latestImportAt: "2026-08-24T06:28:59Z",
    },
  ];
}

test("spencer scenario recommends exactly the canonical job via confirmed lineage", () => {
  const result = rankSmartScheduleCandidates(
    { csvProjectName: "Spencer House" },
    spencerCandidates(),
  );

  assert.equal(result.decision, "RECOMMENDED");
  if (result.decision !== "RECOMMENDED") return;
  assert.equal(result.recommendedJobId, CANONICAL);
  assert.deepEqual(result.otherCandidateIds, [JUNK_A, JUNK_B, TWIN, POLLUTED]);
});

test("polluted 31-row job never outranks clean candidates — demoted by address artifacts", () => {
  const result = rankSmartScheduleCandidates(
    { csvProjectName: "Spencer House" },
    spencerCandidates(),
  );
  if (result.decision !== "RECOMMENDED") return;
  assert.deepEqual(result.otherCandidateIds, [JUNK_A, JUNK_B, TWIN, POLLUTED]);
});

test("junk/test candidates never win even without better alternatives", () => {
  const candidates = spencerCandidates().filter((candidate) => candidate.jobId !== TWIN && candidate.jobId !== CANONICAL);
  const result = rankSmartScheduleCandidates({ csvProjectName: "Spencer House" }, candidates);
  assert.equal(result.decision, "NO_CONFIDENT_MATCH");
});

test("genuinely equivalent clean twins require admin review", () => {
  const twins: RankedWordJobCandidate[] = [
    {
      jobId: CANONICAL,
      title: "Spencer House",
      clientName: "Promise Igbinedion",
      address: "Spencer Road, Birchington",
      postcode: "CT7 9EZ",
      hasCurrentSourceImport: false,
      latestImportAt: null,
    },
    {
      jobId: TWIN,
      title: "Spencer House",
      clientName: "Promise Igbinedion",
      address: "Spencer Road, Birchington",
      postcode: "CT7 9EZ",
      hasCurrentSourceImport: false,
      latestImportAt: null,
    },
  ];

  const result = rankSmartScheduleCandidates({ csvProjectName: "Spencer House" }, twins);
  assert.equal(result.decision, "REVIEW_REQUIRED_MULTIPLE");
  if (result.decision !== "REVIEW_REQUIRED_MULTIPLE") return;
  assert.equal(result.reason, "Multiple matching Word jobs found — review required");
  assert.equal(result.tiedCandidateIds.length, 2);
});

test("equal twins break ties on most recent proven import date", () => {
  const older = "2026-08-01T10:00:00Z";
  const newer = "2026-08-20T10:00:00Z";
  const twins: RankedWordJobCandidate[] = [
    {
      jobId: TWIN,
      title: "Spencer House",
      clientName: "Promise Igbinedion",
      address: "Spencer Road, Birchington",
      postcode: "CT7 9EZ",
      hasCurrentSourceImport: false,
      latestImportAt: older,
    },
    {
      jobId: CANONICAL,
      title: "Spencer House",
      clientName: "Promise Igbinedion",
      address: "Spencer Road, Birchington",
      postcode: "CT7 9EZ",
      hasCurrentSourceImport: false,
      latestImportAt: newer,
    },
  ];
  const result = rankSmartScheduleCandidates({ csvProjectName: "Spencer House" }, twins);
  assert.equal(result.decision, "RECOMMENDED");
  if (result.decision !== "RECOMMENDED") return;
  assert.equal(result.recommendedJobId, CANONICAL);
});

test("CRITICAL: row counts are never ranking signals — more rows ≠ better candidate", () => {
  const fewRows: RankedWordJobCandidate = {
    jobId: CANONICAL,
    title: "Spencer House",
    clientName: "Promise Igbinedion",
    address: "Spencer Road, Birchington",
    postcode: "CT7 9EZ",
    hasCurrentSourceImport: false,
    latestImportAt: null,
  };
  const manyRows: RankedWordJobCandidate = {
    jobId: TWIN,
    title: "Spencer House",
    clientName: "Promise Igbinedion",
    address: "Spencer Road, Birchington",
    postcode: "CT7 9EZ",
    hasCurrentSourceImport: false,
    latestImportAt: null,
  };
  const result = rankSmartScheduleCandidates(
    { csvProjectName: "Spencer House" },
    [fewRows, manyRows],
  );
  // Equivalent candidates — must NOT silently pick the one that happened to
  // be fed from the wrong parser that produced more rows.
  assert.equal(result.decision, "REVIEW_REQUIRED_MULTIPLE");
});

test("missing client name is excluded from the recommended slot", () => {
  const noClient: RankedWordJobCandidate = {
    jobId: TWIN,
    title: "Spencer House",
    clientName: null,
    address: "Spencer Road, Birchington",
    postcode: "CT7 9EZ",
  };
  const good: RankedWordJobCandidate = {
    jobId: CANONICAL,
    title: "Spencer House",
    clientName: "Promise Igbinedion",
    address: "Spencer Road, Birchington",
    postcode: "CT7 9EZ",
    hasCurrentSourceImport: false,
  };
  const result = rankSmartScheduleCandidates({ csvProjectName: "Spencer House" }, [noClient, good]);
  assert.equal(result.decision, "RECOMMENDED");
  if (result.decision !== "RECOMMENDED") return;
  assert.equal(result.recommendedJobId, good.jobId);
});

test("filename-derived hint drives matching when CSV carries no project name", () => {
  const result = rankSmartScheduleCandidates({ filenameProjectHint: "spencer house" }, spencerCandidates());
  assert.equal(result.decision, "RECOMMENDED");
  if (result.decision !== "RECOMMENDED") return;
  assert.equal(result.recommendedJobId, CANONICAL);
});

test("no usable signals yields NO_CONFIDENT_MATCH instead of a guess", () => {
  const result = rankSmartScheduleCandidates({}, spencerCandidates());
  assert.equal(result.decision, "NO_CONFIDENT_MATCH");
});

test("non-matching titles are ignored entirely", () => {
  const others: RankedWordJobCandidate[] = [
    { jobId: "aaaaaaaa-0000-0000-0000-000000000000", title: "Queens Way", clientName: "A Client", postcode: "RM8 1AA" },
    { jobId: "bbbbbbbb-0000-0000-0000-000000000000", title: "Gilbert Road", clientName: "B Client", postcode: "RM8 2BB" },
  ];
  const result = rankSmartScheduleCandidates({ csvProjectName: "Spencer House" }, others);
  assert.equal(result.decision, "NO_CONFIDENT_MATCH");
});

test("candidate flags describe why a job was demoted", () => {
  const all = spencerCandidates();
  const junk = all.find((c) => c.jobId === JUNK_A)!;
  const polluted = all.find((c) => c.jobId === POLLUTED)!;

  assert.ok(describeCandidateFlags(junk).includes("test address"));
  assert.ok(describeCandidateFlags(polluted).includes("malformed address"));
  assert.ok(
    describeCandidateFlags({ jobId: "x", title: "X" }).includes("missing client"),
  );
});

test("legitimate addresses containing 999 or Test place names are not flagged", () => {
  assert.deepEqual(describeCandidateFlags({
    jobId: "x",
    title: "X",
    clientName: "Real Client",
    address: "999 High Street",
    postcode: "TN23 1AA",
  }), []);
  assert.deepEqual(describeCandidateFlags({
    jobId: "y",
    title: "Y",
    clientName: "Real Client",
    address: "Test Valley Business Park",
    postcode: "SO40 3AA",
  }), []);
});
