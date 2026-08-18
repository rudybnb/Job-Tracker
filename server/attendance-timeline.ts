/**
 * Attendance Timeline Engine
 * 
 * Provides unified, single-source-of-truth attendance timeline calculations
 * based on the work_sessions table.
 * 
 * Rules:
 * - Uses Europe/London calendar boundaries for "today".
 * - Chronologically orders sessions (ascending by start_time).
 * - Accurately calculates session durations and lunch/break gaps between sessions.
 * - Filters out invalid/corrupt sessions (e.g. negative duration, start > end) from worked totals.
 * - Returns raw timestamps and numeric durations so clients can format consistently.
 */

export interface RawWorkSession {
  id: string;
  contractorName?: string | null;
  jobId?: string | null;
  jobSiteLocation?: string | null;
  startTime: Date | string | null;
  endTime?: Date | string | null;
  status?: string | null;
  totalHours?: string | number | null;
}

export interface TimelineSession {
  id: string;
  jobId: string | null;
  siteName: string;
  startTime: string; // ISO-8601 string
  endTime: string | null; // ISO-8601 string or null
  status: "active" | "completed" | "invalid";
  durationSeconds: number;
  durationHours: number;
  isValid: boolean;
  invalidReason?: string;
  breakBeforeSeconds: number | null;
}

export interface AttendanceTimeline {
  contractorName: string;
  date: string; // YYYY-MM-DD in Europe/London
  timezone: "Europe/London";
  sessions: TimelineSession[];
  totalWorkedSeconds: number;
  totalWorkedHours: number;
  totalBreakSeconds: number;
  activeSessionId: string | null;
  isCurrentlyClockedIn: boolean;
  sessionCount: number;
}

/** Returns YYYY-MM-DD in Europe/London timezone for the given date. */
export function getLondonDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

/** Check if a session start date falls on the target London calendar day. */
export function isSessionInLondonDate(
  sessionDate: Date | string | null | undefined,
  targetLondonDateStr: string,
): boolean {
  if (!sessionDate) return false;
  const d = typeof sessionDate === "string" ? new Date(sessionDate) : sessionDate;
  if (Number.isNaN(d.getTime())) return false;
  return getLondonDateString(d) === targetLondonDateStr;
}

/**
 * Builds the authoritative attendance timeline for a contractor for a specific London calendar date.
 */
export function buildAttendanceTimeline(
  sessions: RawWorkSession[],
  contractorName: string = "Contractor",
  now: Date = new Date(),
  targetLondonDateStr?: string,
): AttendanceTimeline {
  const londonDate = targetLondonDateStr || getLondonDateString(now);
  const nowMs = now.getTime();

  // 1. Filter sessions belonging to the London calendar day
  const daySessions = sessions.filter((s) => isSessionInLondonDate(s.startTime, londonDate));

  // 2. Sort chronologically ascending (earliest start_time first)
  daySessions.sort((a, b) => {
    const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
    const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
    return aTime - bTime;
  });

  const timelineSessions: TimelineSession[] = [];
  let totalWorkedSeconds = 0;
  let totalBreakSeconds = 0;
  let activeSessionId: string | null = null;
  let lastCompletedEndTimeMs: number | null = null;

  for (const session of daySessions) {
    if (!session.startTime) {
      continue;
    }

    const startDate = new Date(session.startTime);
    const startMs = startDate.getTime();
    if (Number.isNaN(startMs)) {
      continue;
    }

    const hasEndTime = session.endTime !== null && session.endTime !== undefined && session.endTime !== "";
    const endDate = hasEndTime ? new Date(session.endTime!) : null;
    const endMs = endDate ? endDate.getTime() : null;

    let isValid = true;
    let invalidReason: string | undefined;
    let durationSeconds = 0;
    let status: "active" | "completed" | "invalid" = "completed";

    if (endDate && (Number.isNaN(endMs) || endMs! < startMs)) {
      // Corrupt/invalid session: end time is before start time
      isValid = false;
      invalidReason = "END_TIME_BEFORE_START_TIME";
      status = "invalid";
      durationSeconds = 0;
    } else if (endDate) {
      // Completed session
      status = "completed";
      durationSeconds = Math.max(0, Math.round((endMs! - startMs) / 1000));
    } else {
      // Active session (in progress)
      status = "active";
      activeSessionId = session.id;
      // Duration from start until current time
      durationSeconds = Math.max(0, Math.round((nowMs - startMs) / 1000));
    }

    // Calculate break gap since previous completed session
    let breakBeforeSeconds: number | null = null;
    if (lastCompletedEndTimeMs !== null && startMs >= lastCompletedEndTimeMs) {
      breakBeforeSeconds = Math.max(0, Math.round((startMs - lastCompletedEndTimeMs) / 1000));
      totalBreakSeconds += breakBeforeSeconds;
    }

    if (isValid) {
      totalWorkedSeconds += durationSeconds;
      if (endDate && endMs) {
        lastCompletedEndTimeMs = endMs;
      }
    }

    timelineSessions.push({
      id: session.id,
      jobId: session.jobId ?? null,
      siteName: session.jobSiteLocation ?? "Active Site",
      startTime: startDate.toISOString(),
      endTime: endDate ? endDate.toISOString() : null,
      status,
      durationSeconds,
      durationHours: Number((durationSeconds / 3600).toFixed(2)),
      isValid,
      invalidReason,
      breakBeforeSeconds,
    });
  }

  return {
    contractorName,
    date: londonDate,
    timezone: "Europe/London",
    sessions: timelineSessions,
    totalWorkedSeconds,
    totalWorkedHours: Number((totalWorkedSeconds / 3600).toFixed(2)),
    totalBreakSeconds,
    activeSessionId,
    isCurrentlyClockedIn: activeSessionId !== null,
    sessionCount: timelineSessions.length,
  };
}
