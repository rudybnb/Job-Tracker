/**
 * Pure matching helpers for Word-first / Smart-Schedule-second linking.
 *
 * Principle: the Smart Schedule CSV/XLSX usually lacks client name, address and
 * postcode. Those fields live on the existing structured Word job, so matching
 * relies only on safe hints (project name genuinely present in the CSV, or a
 * normalized project name derived from the filename). Filename matching is a
 * HINT, never an authoritative commercial source. No fuzzy auto-linking.
 */

export interface WordJobCandidate {
  jobId: string;
  title: string;
  clientName?: string | null;
  address?: string | null;
  postcode?: string | null;
}

export type SmartScheduleMatchDecision = "SUGGEST_MATCH" | "REVIEW_REQUIRED" | "CREATE_NEW_LEGACY";

export interface SmartScheduleMatchSignals {
  /** Project/job name genuinely found inside the CSV content (may be absent). */
  csvProjectName?: string | null;
  /** Normalized project name derived from the uploaded filename (hint only). */
  filenameProjectHint?: string | null;
  /** Exact client name genuinely present in the schedule file (may be absent). */
  csvClientName?: string | null;
  /** Exact postcode genuinely present in the schedule file (may be absent). */
  csvPostcode?: string | null;
}

export interface SmartScheduleMatchResult {
  decision: SmartScheduleMatchDecision;
  suggestedJobId: string | null;
  matchedCandidateIds: string[];
  reason: string;
}

export const SMART_SCHEDULE_SOURCE_TYPE = "SMART_SCHEDULE_CSV";
export const SMART_SCHEDULE_STREAM_KEY = "SMART_SCHEDULE_CSV";
export const SMART_SCHEDULE_PARSER_VERSION = "smart-schedule-csv-v1";

export function normalizeProjectName(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function decideSmartScheduleMatch(
  signals: SmartScheduleMatchSignals,
  candidates: WordJobCandidate[],
): SmartScheduleMatchResult {
  const signalOrder = [signals.csvProjectName, signals.filenameProjectHint]
    .map((signal) => (signal ?? "").trim())
    .filter((signal) => signal.length > 0);

  for (const signal of signalOrder) {
    const normalizedSignal = normalizeProjectName(signal);
    if (!normalizedSignal) continue;

    const matches = candidates.filter((candidate) => normalizeProjectName(candidate.title) === normalizedSignal);

    if (matches.length === 1) {
      return {
        decision: "SUGGEST_MATCH",
        suggestedJobId: matches[0].jobId,
        matchedCandidateIds: [matches[0].jobId],
        reason:
          signal === (signals.csvProjectName ?? "").trim()
            ? `Exactly one structured Word job matches the project name found in the schedule file ("${signal}").`
            : `Exactly one structured Word job matches the project name derived from the filename ("${signal}"). Filename hints are advisory; confirm before attaching.`,
      };
    }

    if (matches.length > 1) {
      return {
        decision: "REVIEW_REQUIRED",
        suggestedJobId: null,
        matchedCandidateIds: matches.map((match) => match.jobId),
        reason: `Multiple structured Word jobs share the project name "${signal}". Choose the exact job before importing.`,
      };
    }
  }

  // Client-name fallback: schedule files usually carry no client name, so a
  // person-name filename hint ("Maureen Orubebe") can never match job titles
  // like "2nd Floor". When no title matched, compare the filename hint against
  // candidate CLIENT NAMES so that client's structured Word jobs surface as
  // candidates instead of falling through to legacy CSV creation. Title matches
  // always take precedence; this fallback never runs when a title match exists.
  const hint = (signals.filenameProjectHint ?? "").trim();
  if (hint) {
    const normalizedHint = normalizeProjectName(hint);
    if (normalizedHint) {
      const clientMatches = candidates.filter(
        (candidate) => normalizeProjectName(candidate.clientName) === normalizedHint,
      );

      if (clientMatches.length === 1) {
        return {
          decision: "SUGGEST_MATCH",
          suggestedJobId: clientMatches[0].jobId,
          matchedCandidateIds: [clientMatches[0].jobId],
          reason:
            `Exactly one structured Word job belongs to client "${clientMatches[0].clientName}" ` +
            "(matched from the schedule filename). Filename hints are advisory; confirm before attaching.",
        };
      }

      if (clientMatches.length > 1) {
        return {
          decision: "REVIEW_REQUIRED",
          suggestedJobId: null,
          matchedCandidateIds: clientMatches.map((match) => match.jobId),
          reason:
            `Multiple structured Word jobs belong to client "${clientMatches[0].clientName}" ` +
            "(matched from the schedule filename). Choose the exact job before importing.",
        };
      }
    }
  }

  if (candidates.length > 0) {
    return {
      decision: "REVIEW_REQUIRED",
      suggestedJobId: null,
      matchedCandidateIds: [],
      reason:
        signalOrder.length > 0
          ? "No structured Word job confidently matches this schedule file. Select the exact job to attach to, or create a legacy CSV job."
          : "The schedule file contains no usable project identifier. Select the exact job to attach to, or create a legacy CSV job.",
    };
  }

  return {
    decision: "CREATE_NEW_LEGACY",
    suggestedJobId: null,
    matchedCandidateIds: [],
    reason: "No existing structured Word jobs are available to attach to. Use the legacy CSV workflow.",
  };
}

export interface SourceImportRecordSummary {
  id: string;
  sourceHash: string;
  revisionNumber: number;
  status: string;
}

export type SmartScheduleImportAction =
  | { action: "DUPLICATE_NOOP"; duplicateOfRevisionNumber: number }
  | {
      action: "NEW_REVISION";
      revisionNumber: number;
      supersedeImportIds: string[];
      supersedesImportId: string | null;
    };

/**
 * Revision safety for re-imports against a single job + stream.
 * - Same job + same hash -> duplicate/no-op.
 * - New hash -> new revision that supersedes prior IMPORTED revisions.
 * Historical ledger records are never deleted here.
 */
export function resolveSmartScheduleImportAction(
  priorImports: SourceImportRecordSummary[],
  incomingSourceHash: string,
): SmartScheduleImportAction {
  const duplicate = priorImports.find((prior) => prior.sourceHash === incomingSourceHash);
  if (duplicate) {
    return { action: "DUPLICATE_NOOP", duplicateOfRevisionNumber: duplicate.revisionNumber };
  }

  const nextRevisionNumber = priorImports.reduce((max, prior) => Math.max(max, prior.revisionNumber), 0) + 1;
  const superseded = priorImports
    .filter((prior) => prior.status === "IMPORTED")
    .sort((a, b) => b.revisionNumber - a.revisionNumber);

  return {
    action: "NEW_REVISION",
    revisionNumber: nextRevisionNumber,
    supersedeImportIds: superseded.map((prior) => prior.id),
    supersedesImportId: superseded[0]?.id ?? null,
  };
}

/** The ONLY job columns an attach may ever update. */
export const SMART_SCHEDULE_ATTACH_FIELDS = ["phases", "phaseTaskData"] as const;

export interface SmartScheduleAttachPatch {
  phases: string;
  phaseTaskData: string;
}

export function buildSmartScheduleAttachPatch(phases: string[], phaseTaskDataJson: string): SmartScheduleAttachPatch {
  return { phases: phases.join(", "), phaseTaskData: phaseTaskDataJson };
}

export interface WordJobCandidateLabelInput {
  jobId: string;
  title: string;
  clientName?: string | null;
  address?: string | null;
  postcode?: string | null;
}

/** "Spencer House — Promise Igbinedion — CT7 9EZ — Structured Word" */
export function formatWordJobCandidateLabel(candidate: WordJobCandidateLabelInput, allCandidates?: WordJobCandidateLabelInput[]): string {
  const parts = [
    candidate.title || "Untitled job",
    candidate.clientName?.trim() || "",
    candidate.postcode?.trim() || candidate.address?.trim() || "",
    "Structured Word",
  ].filter((part) => part.length > 0);

  const label = parts.join(" — ");
  const sameTitleCandidates = (allCandidates ?? []).filter(
    (other) => other.jobId !== candidate.jobId && normalizeProjectName(other.title) === normalizeProjectName(candidate.title),
  );
  const duplicatedTitle = sameTitleCandidates.length > 0;

  if (!duplicatedTitle) return label;

  // Grow the short id until it uniquely disambiguates duplicate titles.
  let length = 8;
  while (
    sameTitleCandidates.some((other) => other.jobId.slice(0, length) === candidate.jobId.slice(0, length)) &&
    length < candidate.jobId.length
  ) {
    length = Math.min(candidate.jobId.length, length + 4);
  }

  return `${label} — ${candidate.jobId.slice(0, length)}`;
}

// ---------------------------------------------------------------------------
// Smart Schedule job-picker ranking (Word-first attachment).
//
// Admins must never have to choose between duplicate jobs using raw UUIDs.
// Candidates are ranked so ONE clean recommended job surfaces at the top;
// historical duplicates/test junk collapse into an explicit "other possible
// matches" group. Ranking is deterministic and uses no fabricated data.
// ---------------------------------------------------------------------------

/** Candidate enriched with server-provided facts (no guessed values). */
export interface RankedWordJobCandidate {
  jobId: string;
  title: string;
  clientName?: string | null;
  address?: string | null;
  postcode?: string | null;
  /** True when the job has a current IMPORTED revision in project_source_import. */
  hasCurrentSourceImport?: boolean;
  /** ISO timestamp of the most recent proven import for this job, if any. */
  latestImportAt?: string | null;
}

export type SmartScheduleSuggestionDecision =
  | {
      decision: "RECOMMENDED";
      recommendedJobId: string;
      /** Demoted candidates (junk/test/duplicates that lost ranking). */
      otherCandidateIds: string[];
      reason: string;
    }
  | {
      decision: "REVIEW_REQUIRED_MULTIPLE";
      /** Genuinely equivalent clean candidates the admin must choose between. */
      tiedCandidateIds: string[];
      reason: string;
    }
  | {
      decision: "NO_CONFIDENT_MATCH";
      reason: string;
    };

const TEST_ADDRESS_PATTERN = /\b(nonexistent|fake|dummy)\b|\btest\s+(address|street|road|st|rd|lane|ln|drive|dr|job|data)\b/i;
const QUOTE_ARTIFACT_PATTERN = /£|total\s*\(excl\.?\s*vat|summary of estimate/i;
const UK_POSTCODE_PATTERN = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

/** Human-readable reasons a candidate was demoted out of the recommended slot. */
export function describeCandidateFlags(candidate: RankedWordJobCandidate): string[] {
  const flags: string[] = [];
  if (!candidate.clientName?.trim()) flags.push("missing client");
  const postcode = candidate.postcode?.trim() ?? "";
  if (postcode && !UK_POSTCODE_PATTERN.test(postcode.toUpperCase())) flags.push("invalid postcode");
  const address = candidate.address ?? "";
  if (TEST_ADDRESS_PATTERN.test(address)) flags.push("test address");
  else if (QUOTE_ARTIFACT_PATTERN.test(address)) flags.push("malformed address");
  return flags;
}

function candidateIsClean(candidate: RankedWordJobCandidate): boolean {
  if (!candidate.clientName?.trim()) return false;
  const postcode = candidate.postcode?.trim() ?? "";
  if (postcode && !UK_POSTCODE_PATTERN.test(postcode.toUpperCase())) return false;
  const address = candidate.address ?? "";
  if (TEST_ADDRESS_PATTERN.test(address)) return false;
  if (QUOTE_ARTIFACT_PATTERN.test(address)) return false;
  return true;
}

interface RankKey {
  lineage: number;
  importAt: number;
  signalScore: number;
  jobId: string;
}

function rankKey(candidate: RankedWordJobCandidate, signals: SmartScheduleMatchSignals): RankKey {
  const importTime = candidate.latestImportAt ? Date.parse(candidate.latestImportAt) : NaN;
  return {
    lineage: candidate.hasCurrentSourceImport ? 1 : 0,
    importAt: Number.isNaN(importTime) ? -1 : importTime,
    signalScore: signalMatchScore(signals, candidate),
    jobId: candidate.jobId,
  };
}

/**
 * Exact identity-signal agreement between the schedule file and the candidate.
 * Project name carries the most weight; exact client/postcode agreement only
 * applies when those fields were genuinely present in the file. Absent file
 * fields contribute nothing for every candidate (no invented comparisons).
 */
function signalMatchScore(signals: SmartScheduleMatchSignals, candidate: RankedWordJobCandidate): number {
  let score = 0;
  const title = normalizeProjectName(candidate.title);
  const csvName = normalizeProjectName(signals.csvProjectName);
  const hintName = normalizeProjectName(signals.filenameProjectHint);
  if (csvName && title === csvName) score += 2;
  else if (hintName && title === hintName) score += 1;

  const csvClient = normalizeProjectName(signals.csvClientName);
  const clientName = normalizeProjectName(candidate.clientName);
  if (csvClient && clientName && csvClient === clientName) score += 1;

  const csvPostcode = (signals.csvPostcode ?? "").replace(/\s+/g, "").toUpperCase();
  const postcode = (candidate.postcode ?? "").replace(/\s+/g, "").toUpperCase();
  if (csvPostcode && postcode && csvPostcode === postcode) score += 1;

  return score;
}

function sameRank(a: RankKey, b: RankKey): boolean {
  return a.lineage === b.lineage && a.importAt === b.importAt && a.signalScore === b.signalScore;
}

/**
 * Deterministic ranking for the Smart Schedule attach picker.
 *
 * 1. Baseline signal match: normalized project/site name from the file (or the
 *    filename hint) must equal the candidate's normalized title.
 * 1b. Client-name fallback: when NO title matched, the filename hint is compared
 *     against candidate CLIENT NAMES so a person-name file ("Maureen Orubebe")
 *     surfaces that client's structured Word jobs instead of legacy CSV. Title
 *     matches always take precedence; multiple client-only matches force
 *     REVIEW_REQUIRED_MULTIPLE (never a silent lineage-based pick).
 * 2. Clean gates: missing client, invalid postcode, test addresses and quote
 *    artifacts demote a candidate out of the recommended slot (never deleted).
 * 3. Tie-break among clean candidates:
 *      A. confirmed/current source lineage
 *      B. latest proven valid import date
 *      C. exact project/client/postcode signals from the file
 *      D. deterministic job ID (stable fallback only)
 *
 *    Row/location/task/resource COUNTS are deliberately NOT ranking signals:
 *    an older incorrect parser can produce more rows than the correct final
 *    parser, so "richer structure" is not evidence of quality.
 * 4. Only if clean candidates remain fully equivalent after the whole chain
 *    does the caller get REVIEW_REQUIRED_MULTIPLE — never a silent pick based
 *    on row volume.
 */
export function rankSmartScheduleCandidates(
  signals: SmartScheduleMatchSignals,
  candidates: RankedWordJobCandidate[],
): SmartScheduleSuggestionDecision {
  const signalOrder = [signals.csvProjectName, signals.filenameProjectHint]
    .map((signal) => (signal ?? "").trim())
    .filter((signal) => signal.length > 0);

  // Title-based matching first: project/site name signals vs candidate titles.
  let matched =
    signalOrder.length === 0
      ? []
      : candidates.filter((candidate) =>
          signalOrder.some((signal) => normalizeProjectName(signal) === normalizeProjectName(candidate.title)),
        );

  // Client-name fallback: when no title matched, a person-name filename hint
  // ("Maureen Orubebe") is compared against candidate CLIENT NAMES so that
  // client's structured Word jobs surface instead of falling through to the
  // legacy CSV workflow. Title matches always take precedence.
  let matchedByClient = false;
  if (matched.length === 0) {
    const hint = normalizeProjectName(signals.filenameProjectHint);
    if (hint) {
      matched = candidates.filter((candidate) => normalizeProjectName(candidate.clientName) === hint);
      matchedByClient = matched.length > 0;
    }
  }

  if (matched.length === 0) {
    return {
      decision: "NO_CONFIDENT_MATCH",
      reason:
        signalOrder.length === 0
          ? "The schedule file contains no usable project identifier. Select the exact job manually or use the legacy CSV workflow."
          : "No structured Word job matches this schedule file's project name. Select the exact job manually or use the legacy CSV workflow.",
    };
  }

  const clean = matched.filter(candidateIsClean);

  if (clean.length === 0) {
    return {
      decision: "NO_CONFIDENT_MATCH",
      reason:
        "Matching Word jobs exist but none are clean enough to recommend automatically " +
        `(e.g. ${matched.slice(0, 3).map((c) => describeCandidateFlags(c).join(", ") || "unclear identity").join("; ")}). ` +
        "Review the possible matches below or use the legacy CSV workflow.",
    };
  }

  // A client-name-only match never silently picks one job when several of that
  // client's structured Word jobs exist: lineage/provenance ranking must not
  // decide WHICH project this schedule belongs to. The admin chooses explicitly.
  if (matchedByClient && clean.length > 1) {
    return {
      decision: "REVIEW_REQUIRED_MULTIPLE",
      tiedCandidateIds: [...clean]
        .sort((a, b) => a.jobId.localeCompare(b.jobId))
        .map((candidate) => candidate.jobId),
      reason:
        `Multiple structured Word jobs belong to client "${clean[0].clientName}" ` +
        "(matched from the schedule filename) — review required. Choose the exact job.",
    };
  }

  const ranked = [...clean].sort((a, b) => {
    const keyA = rankKey(a, signals);
    const keyB = rankKey(b, signals);
    if (keyB.lineage !== keyA.lineage) return keyB.lineage - keyA.lineage;
    if (keyB.importAt !== keyA.importAt) return keyB.importAt - keyA.importAt;
    if (keyB.signalScore !== keyA.signalScore) return keyB.signalScore - keyA.signalScore;
    return keyA.jobId.localeCompare(keyB.jobId);
  });

  const topKey = rankKey(ranked[0], signals);
  const tiedGroup = ranked.filter((candidate) => sameRank(rankKey(candidate, signals), topKey));

  if (tiedGroup.length > 1) {
    return {
      decision: "REVIEW_REQUIRED_MULTIPLE",
      tiedCandidateIds: tiedGroup.map((candidate) => candidate.jobId),
      reason: "Multiple matching Word jobs found — review required",
    };
  }

  const recommended = ranked[0];
  const lineageNote = recommended.hasCurrentSourceImport ? " It carries the latest confirmed source import." : "";
  return {
    decision: "RECOMMENDED",
    recommendedJobId: recommended.jobId,
    // Every other matched candidate collapses into "other possible matches":
    // both gate-demoted junk/test imports and clean duplicates that lost ranking.
    otherCandidateIds: matched
      .filter((candidate) => candidate.jobId !== recommended.jobId)
      .map((candidate) => candidate.jobId),
    reason: matchedByClient
      ? `Structured Word job for client "${recommended.clientName}" (matched from the schedule filename).${lineageNote}`
      : `Exactly one clean structured Word job matches "${recommended.title}".${lineageNote}`,
  };
}
