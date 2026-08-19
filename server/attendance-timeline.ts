/**
 * Attendance Timeline Engine
 * 
 * Provides unified, single-source-of-truth attendance timeline calculations
 * based on the work_sessions table and attendance_events table.
 * 
 * Rules:
 * - Uses Europe/London calendar boundaries for "today".
 * - Chronologically orders sessions (ascending by start_time).
 * - Accurately calculates session durations and all completed/active break periods.
 * - Supports multiple break/return cycles during one working day.
 * - Worked time strictly excludes recorded break time.
 * - GPS signal loss is informational only and does not trigger clock-out or break.
 * - Filters out invalid/corrupt sessions (e.g. negative duration, start > end) from worked totals.
 * - Returns raw timestamps, break history, and numeric durations so clients format identically.
 */

export type RawAttendanceEventType =
  | "CLOCK_IN"
  | "BREAK_START"
  | "BREAK_END"
  | "CLOCK_OUT"
  | "LOCATION_SIGNAL_LOST"
  | "LOCATION_SIGNAL_RESTORED";

export interface RawAttendanceEvent {
  id: string;
  workSessionId: string;
  eventType: RawAttendanceEventType;
  timestamp: Date | string;
  latitude?: string | null;
  longitude?: string | null;
  gpsAccuracy?: number | null;
  jobId?: string | null;
  siteName?: string | null;
  source?: string | null;
}

export interface RawWorkSession {
  id: string;
  contractorName?: string | null;
  jobId?: string | null;
  jobSiteLocation?: string | null;
  startTime: Date | string | null;
  endTime?: Date | string | null;
  status?: string | null;
  totalHours?: string | number | null;
  breakStartTime?: Date | string | null;
  breakEndTime?: Date | string | null;
  attendanceFlag?: string | null;
  events?: RawAttendanceEvent[];
}

export interface TimelineBreak {
  start: string; // ISO string
  end: string | null; // ISO string or null if currently on break
  durationSeconds: number;
}

export interface TimelineSession {
  id: string;
  jobId: string | null;
  siteName: string;
  startTime: string; // ISO-8601 string
  clockInTime: string; // ISO-8601 string
  breakStartTime: string | null; // ISO-8601 string or null
  breakEndTime: string | null; // ISO-8601 string or null
  clockOutTime: string | null; // ISO-8601 string or null
  endTime: string | null; // ISO-8601 string or null
  status: "active" | "on_break" | "completed" | "invalid";
  displayStatus: "ON SITE" | "ON BREAK" | "CLOCKED OUT";
  breaks: TimelineBreak[];
  workedDurationSeconds: number;
  breakDurationSeconds: number;
  durationSeconds: number; // worked duration
  durationHours: number;
  isValid: boolean;
  invalidReason?: string;
  breakBeforeSeconds: number | null;
  attendanceFlag: string | null;
  locationSignalLost: boolean;
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
  currentStatus: "ON SITE" | "ON BREAK" | "CLOCKED OUT";
  sessionCount: number;
  attendanceFlag: string | null;
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
  let activeStatus: "ON SITE" | "ON BREAK" | "CLOCKED OUT" = "CLOCKED OUT";
  let lastCompletedEndTimeMs: number | null = null;
  let dayAttendanceFlag: string | null = null;

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
    let status: "active" | "on_break" | "completed" | "invalid" = "completed";
    let displayStatus: "ON SITE" | "ON BREAK" | "CLOCKED OUT" = "CLOCKED OUT";
    let locationSignalLost = false;
    let sessionAttendanceFlag: string | null = session.attendanceFlag ?? null;

    const breaks: TimelineBreak[] = [];
    let sessionBreakSeconds = 0;
    let firstBreakStart: string | null = null;
    let lastBreakEnd: string | null = null;

    // Process breaks: if session is ADMIN_CORRECTED and has explicit break fields, use them as authoritative effective breaks
    if (session.attendanceFlag?.includes("ADMIN_CORRECTED") && session.breakStartTime) {
      const bStartMs = new Date(session.breakStartTime).getTime();
      const bStartIso = new Date(session.breakStartTime).toISOString();
      if (!endMs || bStartMs < endMs) {
        firstBreakStart = bStartIso;

        if (session.breakEndTime) {
          const bEndMs = new Date(session.breakEndTime).getTime();
          const effectiveEndMs = endMs ? Math.min(bEndMs, endMs) : bEndMs;
          const bDur = Math.max(0, Math.round((effectiveEndMs - bStartMs) / 1000));
          breaks.push({
            start: bStartIso,
            end: new Date(session.breakEndTime).toISOString(),
            durationSeconds: bDur,
          });
          sessionBreakSeconds += bDur;
          lastBreakEnd = new Date(session.breakEndTime).toISOString();
        } else if (!hasEndTime) {
          const bDur = Math.max(0, Math.round((nowMs - bStartMs) / 1000));
          breaks.push({
            start: bStartIso,
            end: null,
            durationSeconds: bDur,
          });
          sessionBreakSeconds += bDur;
        } else if (endMs && bStartMs < endMs) {
          const bDur = Math.max(0, Math.round((endMs - bStartMs) / 1000));
          breaks.push({
            start: bStartIso,
            end: endDate!.toISOString(),
            durationSeconds: bDur,
          });
          sessionBreakSeconds += bDur;
          lastBreakEnd = endDate!.toISOString();
        }
      }

      // Check if location signal lost from events
      if (session.events && session.events.length > 0) {
        for (const evt of session.events) {
          if (evt.eventType === "LOCATION_SIGNAL_LOST") {
            locationSignalLost = true;
          } else if (evt.eventType === "LOCATION_SIGNAL_RESTORED") {
            locationSignalLost = false;
          }
        }
      }
    } else if (session.events && session.events.length > 0) {
      const sortedEvents = [...session.events].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      let currentBreakStartMs: number | null = null;
      let currentBreakStartIso: string | null = null;

      for (const evt of sortedEvents) {
        const evtMs = new Date(evt.timestamp).getTime();
        const evtIso = new Date(evt.timestamp).toISOString();

        if (evt.eventType === "LOCATION_SIGNAL_LOST") {
          locationSignalLost = true;
        } else if (evt.eventType === "LOCATION_SIGNAL_RESTORED") {
          locationSignalLost = false;
        } else if (evt.eventType === "BREAK_START") {
          // If session is completed and this break start is at or after endMs, IGNORE IT
          if (endMs && evtMs >= endMs) {
            continue;
          }
          currentBreakStartMs = evtMs;
          currentBreakStartIso = evtIso;
          if (!firstBreakStart) firstBreakStart = evtIso;
        } else if (evt.eventType === "BREAK_END" && currentBreakStartMs !== null) {
          const effectiveEndMs = endMs ? Math.min(evtMs, endMs) : evtMs;
          const bDur = Math.max(0, Math.round((effectiveEndMs - currentBreakStartMs) / 1000));
          breaks.push({
            start: currentBreakStartIso!,
            end: endMs && evtMs > endMs ? endDate!.toISOString() : evtIso,
            durationSeconds: bDur,
          });
          sessionBreakSeconds += bDur;
          lastBreakEnd = endMs && evtMs > endMs ? endDate!.toISOString() : evtIso;
          currentBreakStartMs = null;
          currentBreakStartIso = null;
        }
      }

      // If currently on an open break
      if (currentBreakStartMs !== null) {
        if (endDate && endMs) {
          // For completed sessions: Cap open break at endMs, NEVER calculate against nowMs
          if (currentBreakStartMs < endMs) {
            const cappedBreakSecs = Math.max(0, Math.round((endMs - currentBreakStartMs) / 1000));
            breaks.push({
              start: currentBreakStartIso!,
              end: endDate.toISOString(),
              durationSeconds: cappedBreakSecs,
            });
            sessionBreakSeconds += cappedBreakSecs;
            lastBreakEnd = endDate.toISOString();
          }
        } else {
          // For active sessions: Live ongoing break up to nowMs
          const ongoingBreakSecs = Math.max(0, Math.round((nowMs - currentBreakStartMs) / 1000));
          breaks.push({
            start: currentBreakStartIso!,
            end: null,
            durationSeconds: ongoingBreakSecs,
          });
          sessionBreakSeconds += ongoingBreakSecs;
        }
      }
    } else {
      // Fallback to top-level breakStartTime/breakEndTime fields
      if (session.breakStartTime) {
        const bStartMs = new Date(session.breakStartTime).getTime();
        const bStartIso = new Date(session.breakStartTime).toISOString();
        if (!endMs || bStartMs < endMs) {
          firstBreakStart = bStartIso;

          if (session.breakEndTime) {
            const bEndMs = new Date(session.breakEndTime).getTime();
            const effectiveEndMs = endMs ? Math.min(bEndMs, endMs) : bEndMs;
            const bDur = Math.max(0, Math.round((effectiveEndMs - bStartMs) / 1000));
            breaks.push({
              start: bStartIso,
              end: new Date(session.breakEndTime).toISOString(),
              durationSeconds: bDur,
            });
            sessionBreakSeconds += bDur;
            lastBreakEnd = new Date(session.breakEndTime).toISOString();
          } else if (!hasEndTime) {
            const bDur = Math.max(0, Math.round((nowMs - bStartMs) / 1000));
            breaks.push({
              start: bStartIso,
              end: null,
              durationSeconds: bDur,
            });
            sessionBreakSeconds += bDur;
          } else if (endMs && bStartMs < endMs) {
            const bDur = Math.max(0, Math.round((endMs - bStartMs) / 1000));
            breaks.push({
              start: bStartIso,
              end: endDate!.toISOString(),
              durationSeconds: bDur,
            });
            sessionBreakSeconds += bDur;
            lastBreakEnd = endDate!.toISOString();
          }
        }
      }
    }

    if (endDate && (Number.isNaN(endMs) || endMs! < startMs)) {
      // Corrupt/invalid session: end time is before start time
      isValid = false;
      invalidReason = "END_TIME_BEFORE_START_TIME";
      status = "invalid";
      displayStatus = "CLOCKED OUT";
    } else if (endDate) {
      // Completed session
      status = "completed";
      displayStatus = "CLOCKED OUT";
    } else if (session.status === "on_break" || (breaks.length > 0 && breaks[breaks.length - 1].end === null)) {
      // Active session currently on break
      status = "on_break";
      displayStatus = "ON BREAK";
      activeSessionId = session.id;
      activeStatus = "ON BREAK";
    } else {
      // Active session currently on site
      status = "active";
      displayStatus = "ON SITE";
      activeSessionId = session.id;
      activeStatus = "ON SITE";
    }

    // Calculate gross duration
    let grossDurationSeconds = 0;
    if (endDate && endMs) {
      grossDurationSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));
    } else {
      grossDurationSeconds = Math.max(0, Math.round((nowMs - startMs) / 1000));
    }

    // Net worked duration strictly excludes recorded breaks
    const workedDurationSeconds = isValid ? Math.max(0, grossDurationSeconds - sessionBreakSeconds) : 0;

    // Check for gap since previous completed session
    let breakBeforeSeconds: number | null = null;
    if (lastCompletedEndTimeMs !== null && startMs >= lastCompletedEndTimeMs) {
      breakBeforeSeconds = Math.max(0, Math.round((startMs - lastCompletedEndTimeMs) / 1000));
      totalBreakSeconds += breakBeforeSeconds;
    }

    if (locationSignalLost) {
      sessionAttendanceFlag = "LOCATION SIGNAL LOST";
      dayAttendanceFlag = "LOCATION SIGNAL LOST";
    }

    // Safety check: If a session is marked completed but has events with NO CLOCK_OUT event and NO admin correction
    if (endDate && session.events && session.events.length > 0) {
      const hasClockOut = session.events.some((e) => e.eventType === "CLOCK_OUT");
      const hasAdminSource = session.events.some((e) => e.source === "admin") || (session.attendanceFlag && session.attendanceFlag.includes("ADMIN_CORRECTED"));
      if (!hasClockOut && !hasAdminSource) {
        sessionAttendanceFlag = sessionAttendanceFlag
          ? `${sessionAttendanceFlag} | ATTENDANCE REVIEW REQUIRED`
          : "ATTENDANCE REVIEW REQUIRED";
        dayAttendanceFlag = "ATTENDANCE REVIEW REQUIRED";
      }
    }

    if (isValid) {
      totalWorkedSeconds += workedDurationSeconds;
      totalBreakSeconds += sessionBreakSeconds;
      if (endDate && endMs) {
        lastCompletedEndTimeMs = endMs;
      }
    }

    timelineSessions.push({
      id: session.id,
      jobId: session.jobId ?? null,
      siteName: session.jobSiteLocation ?? "Active Site",
      startTime: startDate.toISOString(),
      clockInTime: startDate.toISOString(),
      breakStartTime: firstBreakStart,
      breakEndTime: lastBreakEnd,
      clockOutTime: endDate ? endDate.toISOString() : null,
      endTime: endDate ? endDate.toISOString() : null,
      status,
      displayStatus,
      breaks,
      workedDurationSeconds,
      breakDurationSeconds: sessionBreakSeconds,
      durationSeconds: workedDurationSeconds,
      durationHours: Number((workedDurationSeconds / 3600).toFixed(2)),
      isValid,
      invalidReason,
      breakBeforeSeconds,
      attendanceFlag: sessionAttendanceFlag,
      locationSignalLost,
    });
  }

  // Check if any review flag needed for older uncompleted sessions
  const hasPriorUnclosed = sessions.some((s) => {
    if (!s.startTime) return false;
    const isToday = isSessionInLondonDate(s.startTime, londonDate);
    return !isToday && !s.endTime && (s.status === "active" || s.status === "on_break");
  });

  if (hasPriorUnclosed && !dayAttendanceFlag) {
    dayAttendanceFlag = "ATTENDANCE REVIEW REQUIRED";
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
    currentStatus: activeStatus,
    sessionCount: timelineSessions.length,
    attendanceFlag: dayAttendanceFlag,
  };
}
