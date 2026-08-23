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
