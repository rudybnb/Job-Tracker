import assert from "node:assert/strict";
import test from "node:test";
import {
  decideSmartScheduleMatch,
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

// ---------------------------------------------------------------------------
// Client-name fallback matching (Maureen scenario).
//
// Schedule CSVs carry no client name; a person-name filename hint
// ("Maureen Orubebe") can never match job titles like "2nd Floor". When no
// title matched, the hint is compared against candidate CLIENT NAMES so that
// client's structured Word jobs surface as candidates instead of falling
// through to legacy CSV creation. Multiple client matches ALWAYS require
// admin review � lineage/provenance must never silently pick the project.
// ---------------------------------------------------------------------------

function maureenCandidates(): RankedWordJobCandidate[] {
  const mk = (
    id: string,
    title: string,
    overrides: Partial<RankedWordJobCandidate> = {},
  ): RankedWordJobCandidate => ({
    jobId: id,
    title,
    clientName: "Maureen Orubebe",
    address: "2nd Floor Flat, London",
    postcode: "NW9 5YZ",
    hasCurrentSourceImport: false,
    latestImportAt: null,
    ...overrides,
  });

  return [
    mk("022d4fbe-1111-1111-1111-111111111111", "Refurbishment"),
    mk("3884004c-2222-2222-2222-222222222222", "Refurbishment"),
    mk("4b572375-3333-3333-3333-333333333333", "2nd Floor"),
    mk("a0633cbb-4444-4444-4444-444444444444", "2nd Floor"),
    mk("b97191df-5555-5555-5555-555555555555", "2nd Floor", {
      hasCurrentSourceImport: true,
      latestImportAt: "2026-08-24T06:47:10Z",
    }),
    mk("dd9728a5-6666-6666-6666-666666666666", "Refurbishment"),
    // One test-junk job for the same client � demoted by clean gates.
    mk("eeeeeeee-7777-7777-7777-777777777777", "2nd Floor", {
      address: "999 Nonexistent St",
    }),
    // A Spencer job must never appear for a Maureen hint.
    mk("ffffffff-8888-8888-8888-888888888888", "Spencer House", {
      clientName: "Promise Igbinedion",
      postcode: "CT7 9EZ",
    }),
  ];
}

test("maureen scenario: filename person-hint surfaces that client's Word jobs for review", () => {
  const result = rankSmartScheduleCandidates(
    { csvProjectName: null, filenameProjectHint: "Maureen Orubebe" },
    maureenCandidates(),
  );

  assert.equal(result.decision, "REVIEW_REQUIRED_MULTIPLE");
  if (result.decision !== "REVIEW_REQUIRED_MULTIPLE") return;
  // Detailed reason renders beneath the UI's fixed "Multiple matching Word
  // jobs found — review required" headline.
  assert.ok(result.reason.includes('client "Maureen Orubebe"'));
  assert.ok(result.reason.includes("review required"));
  // All clean Maureen candidates are shown; junk and other clients excluded.
  assert.equal(result.tiedCandidateIds.length, 6);
  assert.ok(result.tiedCandidateIds.includes("b97191df-5555-5555-5555-555555555555"));
  assert.ok(!result.tiedCandidateIds.includes("eeeeeeee-7777-7777-7777-777777777777"));
  assert.ok(!result.tiedCandidateIds.includes("ffffffff-8888-8888-8888-888888888888"));
});

test("CRITICAL: multiple client-only matches never auto-recommend even with lineage", () => {
  const result = rankSmartScheduleCandidates(
    { filenameProjectHint: "maureen orubebe" },
    maureenCandidates(),
  );
  // b97191df has confirmed lineage � ranking must still NOT pick it silently.
  assert.equal(result.decision, "REVIEW_REQUIRED_MULTIPLE");
});

test("single clean client-only match is recommended with honest reason", () => {
  const single = maureenCandidates().filter(
    (candidate) =>
      candidate.jobId === "b97191df-5555-5555-5555-555555555555" ||
      candidate.jobId === "ffffffff-8888-8888-8888-888888888888",
  );
  const result = rankSmartScheduleCandidates({ filenameProjectHint: "Maureen Orubebe" }, single);
  assert.equal(result.decision, "RECOMMENDED");
  if (result.decision !== "RECOMMENDED") return;
  assert.equal(result.recommendedJobId, "b97191df-5555-5555-5555-555555555555");
  assert.ok(result.reason.includes('client "Maureen Orubebe"'));
  assert.ok(result.reason.includes("(matched from the schedule filename)"));
  // Non-matching jobs (e.g. the Spencer job) appear nowhere at all.
  assert.deepEqual(result.otherCandidateIds, []);
  assert.equal(result.recommendedJobId, "b97191df-5555-5555-5555-555555555555");
});

test("title match takes precedence over client-name fallback", () => {
  // With a csvProjectName of a specific title, only that title matches.
  const byTitle = rankSmartScheduleCandidates(
    { csvProjectName: "Refurbishment", filenameProjectHint: null },
    maureenCandidates(),
  );
  // Refurbishment titles have no lineage/dates -> equivalent -> review required.
  assert.equal(byTitle.decision, "REVIEW_REQUIRED_MULTIPLE");
  if (byTitle.decision !== "REVIEW_REQUIRED_MULTIPLE") return;
  assert.ok(byTitle.tiedCandidateIds.every((id) => !id.startsWith("4b572375") && !id.startsWith("a0633cbb")));
});

test("no title or client match still yields NO_CONFIDENT_MATCH (legacy fallback preserved)", () => {
  const result = rankSmartScheduleCandidates(
    { filenameProjectHint: "Totally Unknown Person" },
    maureenCandidates(),
  );
  assert.equal(result.decision, "NO_CONFIDENT_MATCH");
});

test("decideSmartScheduleMatch client fallback: multiple -> REVIEW_REQUIRED with ids", () => {
  const result = decideSmartScheduleMatch(
    { filenameProjectHint: "Maureen Orubebe" },
    maureenCandidates().map((candidate) => ({
      jobId: candidate.jobId,
      title: candidate.title,
      clientName: candidate.clientName,
      address: candidate.address,
      postcode: candidate.postcode,
    })),
  );
  assert.equal(result.decision, "REVIEW_REQUIRED");
  assert.equal(result.matchedCandidateIds.length, 7);
});

test("decideSmartScheduleMatch client fallback: single -> SUGGEST_MATCH", () => {
  const single = [
    {
      jobId: "b97191df-5555-5555-5555-555555555555",
      title: "2nd Floor",
      clientName: "Maureen Orubebe",
    },
  ];
  const result = decideSmartScheduleMatch({ filenameProjectHint: "Maureen Orubebe" }, single);
  assert.equal(result.decision, "SUGGEST_MATCH");
  assert.equal(result.suggestedJobId, "b97191df-5555-5555-5555-555555555555");
});

test("decideSmartScheduleMatch: title match wins over weaker client fallback", () => {
  const result = decideSmartScheduleMatch(
    { filenameProjectHint: "Maureen Orubebe" },
    [
      { jobId: "aaaa0000-0000-0000-0000-000000000000", title: "Maureen Orubebe", clientName: "Someone Else" },
      { jobId: "bbbb0000-0000-0000-0000-000000000000", title: "2nd Floor", clientName: "Maureen Orubebe" },
    ],
  );
  assert.equal(result.decision, "SUGGEST_MATCH");
  assert.equal(result.suggestedJobId, "aaaa0000-0000-0000-0000-000000000000");
});
