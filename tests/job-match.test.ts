import assert from "node:assert/strict";
import test from "node:test";

import {
  SMART_SCHEDULE_ATTACH_FIELDS,
  buildSmartScheduleAttachPatch,
  decideSmartScheduleMatch,
  formatWordJobCandidateLabel,
  normalizeProjectName,
  resolveSmartScheduleImportAction,
  type SourceImportRecordSummary,
  type WordJobCandidate,
} from "../shared/job-match.ts";

const spencer: WordJobCandidate = {
  jobId: "spencer-word-job-id",
  title: "Spencer House",
  clientName: "Promise Igbinedion",
  address: "1 Spencer Way",
  postcode: "CT7 9EZ",
};

const maureenSecondFloor: WordJobCandidate = {
  jobId: "maureen-2nd-floor-id",
  title: "2nd Floor",
  clientName: "Maureen Orubebe",
  postcode: "NW9 5YZ",
};

const maureenDuplicate: WordJobCandidate = {
  jobId: "maureen-2nd-floor-duplicate-id",
  title: "2nd Floor",
  clientName: "Maureen Orubebe",
  postcode: "NW9 5YZ",
};

test("unique CSV project name suggests the exact structured Word job", () => {
  const result = decideSmartScheduleMatch(
    { csvProjectName: "Spencer House", filenameProjectHint: null },
    [spencer, maureenSecondFloor],
  );

  assert.equal(result.decision, "SUGGEST_MATCH");
  assert.equal(result.suggestedJobId, "spencer-word-job-id");
});

test("filename-derived hint is a hint but can suggest when unique", () => {
  const result = decideSmartScheduleMatch(
    { csvProjectName: null, filenameProjectHint: "Spencer House" },
    [spencer],
  );

  assert.equal(result.decision, "SUGGEST_MATCH");
  assert.equal(result.suggestedJobId, "spencer-word-job-id");
  assert.match(result.reason, /filename/i);
});

test("matching is insensitive to case, punctuation and extra whitespace", () => {
  const result = decideSmartScheduleMatch(
    { csvProjectName: "  spencer---HOUSE ", filenameProjectHint: null },
    [spencer],
  );

  assert.equal(result.decision, "SUGGEST_MATCH");
  assert.equal(normalizeProjectName("2nd-Floor  Annex"), "2nd floor annex");
});

test("ambiguous candidate set blocks import until admin picks one exact job", () => {
  const result = decideSmartScheduleMatch(
    { csvProjectName: "2nd Floor", filenameProjectHint: "2nd Floor" },
    [maureenSecondFloor, maureenDuplicate],
  );

  assert.equal(result.decision, "REVIEW_REQUIRED");
  assert.equal(result.suggestedJobId, null);
  assert.deepEqual(result.matchedCandidateIds.sort(), ["maureen-2nd-floor-duplicate-id", "maureen-2nd-floor-id"]);
});

test("no name match still offers manual selection instead of fuzzy linking", () => {
  const result = decideSmartScheduleMatch(
    { csvProjectName: "Unrelated Site", filenameProjectHint: "Unrelated Site" },
    [spencer, maureenSecondFloor],
  );

  assert.equal(result.decision, "REVIEW_REQUIRED");
  assert.equal(result.suggestedJobId, null);
  assert.deepEqual(result.matchedCandidateIds, []);
});

test("no structured Word candidate at all falls back to legacy CSV workflow", () => {
  const withSignal = decideSmartScheduleMatch({ csvProjectName: "Spencer House" }, []);
  const withoutSignal = decideSmartScheduleMatch({}, []);

  assert.equal(withSignal.decision, "CREATE_NEW_LEGACY");
  assert.equal(withoutSignal.decision, "CREATE_NEW_LEGACY");
});

test("same job + same source hash is rejected as duplicate no-op", () => {
  const priorImports: SourceImportRecordSummary[] = [
    { id: "import-1", sourceHash: "a".repeat(64), revisionNumber: 3, status: "IMPORTED" },
    { id: "import-0", sourceHash: "b".repeat(64), revisionNumber: 2, status: "SUPERSEDED" },
  ];

  const action = resolveSmartScheduleImportAction(priorImports, "a".repeat(64));

  assert.equal(action.action, "DUPLICATE_NOOP");
  assert.equal(action.duplicateOfRevisionNumber, 3);
});

test("new revision supersedes prior imported revisions without deleting history", () => {
  const priorImports: SourceImportRecordSummary[] = [
    { id: "import-old", sourceHash: "b".repeat(64), revisionNumber: 1, status: "SUPERSEDED" },
    { id: "import-current", sourceHash: "a".repeat(64), revisionNumber: 2, status: "IMPORTED" },
  ];

  const action = resolveSmartScheduleImportAction(priorImports, "c".repeat(64));

  assert.equal(action.action, "NEW_REVISION");
  if (action.action === "NEW_REVISION") {
    assert.equal(action.revisionNumber, 3);
    assert.deepEqual(action.supersedeImportIds, ["import-current"]);
    assert.equal(action.supersedesImportId, "import-current");
  }
});

test("first import for a job starts at revision 1 with nothing to supersede", () => {
  const action = resolveSmartScheduleImportAction([], "d".repeat(64));

  assert.ok(action.action === "NEW_REVISION");
  if (action.action === "NEW_REVISION") {
    assert.equal(action.revisionNumber, 1);
    assert.deepEqual(action.supersedeImportIds, []);
    assert.equal(action.supersedesImportId, null);
  }
});

test("attach patch contains ONLY operational CSV fields", () => {
  const patch = buildSmartScheduleAttachPatch(["Electrical", "Plastering"], '{"phases":{"Electrical":[]},"financials":{}}');

  assert.deepEqual(Object.keys(patch).sort(), [...SMART_SCHEDULE_ATTACH_FIELDS].sort());
  assert.equal(patch.phases, "Electrical, Plastering");
  // Guard against ever touching title/client/address/postcode/quote values.
  assert.equal("title" in patch, false);
  assert.equal("clientName" in patch, false);
  assert.equal("quotedAmount" in patch, false);
  assert.equal("uploadId" in patch, false);
});

test("candidate labels follow the Word-job identity format from the picker", () => {
  assert.equal(
    formatWordJobCandidateLabel(spencer),
    "Spencer House — Promise Igbinedion — CT7 9EZ — Structured Word",
  );
  assert.equal(
    formatWordJobCandidateLabel(maureenSecondFloor),
    "2nd Floor — Maureen Orubebe — NW9 5YZ — Structured Word",
  );
  // Duplicate titles are disambiguated by short job id, never by title alone.
  const duplicateLabel = formatWordJobCandidateLabel(maureenDuplicate, [maureenSecondFloor, maureenDuplicate]);
  assert.notEqual(
    formatWordJobCandidateLabel(maureenSecondFloor, [maureenSecondFloor, maureenDuplicate]),
    duplicateLabel,
  );
  assert.match(duplicateLabel, /— maureen-2nd-floor-du$/);
});
