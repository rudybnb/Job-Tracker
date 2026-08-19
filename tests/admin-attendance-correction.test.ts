import assert from "node:assert/strict";
import test from "node:test";
import { buildAttendanceTimeline, type RawWorkSession } from "../server/attendance-timeline.ts";

test("Attendance Timeline: Unverified auto-closed session flags ATTENDANCE REVIEW REQUIRED", () => {
  const session: RawWorkSession = {
    id: "sess-auto-closed-1",
    contractorName: "Ahmed Gouda",
    jobSiteLocation: "Mary G",
    startTime: "2026-08-19T06:06:58.000Z", // 07:06 BST
    endTime: "2026-08-19T16:00:00.000Z",   // 17:00 UTC / 18:00 BST legacy auto-logout
    status: "completed",
    events: [
      {
        id: "evt-in",
        workSessionId: "sess-auto-closed-1",
        eventType: "CLOCK_IN",
        timestamp: "2026-08-19T06:06:58.000Z",
        source: "worker",
      },
      {
        id: "evt-break-start",
        workSessionId: "sess-auto-closed-1",
        eventType: "BREAK_START",
        timestamp: "2026-08-19T11:12:00.000Z",
        source: "worker",
      },
      {
        id: "evt-break-end",
        workSessionId: "sess-auto-closed-1",
        eventType: "BREAK_END",
        timestamp: "2026-08-19T12:16:00.000Z",
        source: "worker",
      },
      // Missing CLOCK_OUT event
    ],
  };

  const timeline = buildAttendanceTimeline([session], "Ahmed Gouda", new Date("2026-08-19T17:00:00.000Z"), "2026-08-19");
  assert.equal(timeline.attendanceFlag, "ATTENDANCE REVIEW REQUIRED");
  assert.ok(timeline.sessions[0].attendanceFlag?.includes("ATTENDANCE REVIEW REQUIRED"));
});

test("Attendance Timeline: Admin correction clears ATTENDANCE REVIEW REQUIRED flag and marks source as admin", () => {
  const session: RawWorkSession = {
    id: "sess-corrected-1",
    contractorName: "Ahmed Gouda",
    jobSiteLocation: "Mary G",
    startTime: "2026-08-19T06:06:58.000Z",
    endTime: "2026-08-19T15:30:00.000Z", // Admin verified real finish time 16:30 BST
    status: "completed",
    attendanceFlag: "ADMIN_CORRECTED",
    events: [
      {
        id: "evt-in",
        workSessionId: "sess-corrected-1",
        eventType: "CLOCK_IN",
        timestamp: "2026-08-19T06:06:58.000Z",
        source: "admin",
      },
      {
        id: "evt-break-start",
        workSessionId: "sess-corrected-1",
        eventType: "BREAK_START",
        timestamp: "2026-08-19T11:12:00.000Z",
        source: "admin",
      },
      {
        id: "evt-break-end",
        workSessionId: "sess-corrected-1",
        eventType: "BREAK_END",
        timestamp: "2026-08-19T12:16:00.000Z",
        source: "admin",
      },
      {
        id: "evt-out",
        workSessionId: "sess-corrected-1",
        eventType: "CLOCK_OUT",
        timestamp: "2026-08-19T15:30:00.000Z",
        source: "admin", // Admin source, NOT worker!
      },
    ],
  };

  const timeline = buildAttendanceTimeline([session], "Ahmed Gouda", new Date("2026-08-19T17:00:00.000Z"), "2026-08-19");
  // Review flag is cleared
  assert.equal(timeline.attendanceFlag, null);
  assert.ok(!timeline.sessions[0].attendanceFlag?.includes("ATTENDANCE REVIEW REQUIRED"));
  assert.equal(timeline.sessions[0].status, "completed");
  // Worked duration calculation (06:06:58 to 15:30:00 minus 1h 4m break = 29,942s)
  assert.equal(timeline.totalWorkedSeconds, 29942);
});

test("Attendance Timeline: Original worker events are preserved permanently alongside ADMIN_CORRECTION event", () => {
  const session: RawWorkSession = {
    id: "sess-preserved-1",
    contractorName: "Ahmed Gouda",
    jobSiteLocation: "Mary G",
    startTime: "2026-08-19T06:06:58.000Z", // Corrected effective start
    endTime: "2026-08-19T15:30:00.000Z",   // Corrected effective end
    breakStartTime: "2026-08-19T11:12:00.000Z", // Corrected effective break start
    breakEndTime: "2026-08-19T12:16:00.000Z",   // Corrected effective break end
    status: "completed",
    attendanceFlag: "ADMIN_CORRECTED",
    events: [
      // Original worker events preserved intact
      {
        id: "evt-worker-in",
        workSessionId: "sess-preserved-1",
        eventType: "CLOCK_IN",
        timestamp: "2026-08-19T06:06:58.000Z",
        source: "worker",
      },
      {
        id: "evt-worker-break-start",
        workSessionId: "sess-preserved-1",
        eventType: "BREAK_START",
        timestamp: "2026-08-19T11:12:00.000Z",
        source: "worker",
      },
      {
        id: "evt-worker-break-end",
        workSessionId: "sess-preserved-1",
        eventType: "BREAK_END",
        timestamp: "2026-08-19T12:16:00.000Z",
        source: "worker",
      },
      // Appended admin correction audit events
      {
        id: "evt-admin-corr",
        workSessionId: "sess-preserved-1",
        eventType: "ADMIN_CORRECTION",
        timestamp: "2026-08-19T17:00:00.000Z",
        source: "admin",
      },
      {
        id: "evt-admin-out",
        workSessionId: "sess-preserved-1",
        eventType: "CLOCK_OUT",
        timestamp: "2026-08-19T15:30:00.000Z",
        source: "admin",
      },
    ],
  };

  // Original events still present
  assert.equal(session.events!.filter((e) => e.source === "worker").length, 3);
  assert.equal(session.events!.filter((e) => e.source === "admin").length, 2);

  const timeline = buildAttendanceTimeline([session], "Ahmed Gouda", new Date("2026-08-19T17:00:00.000Z"), "2026-08-19");
  assert.equal(timeline.attendanceFlag, null);
  assert.ok(!timeline.sessions[0].attendanceFlag?.includes("ATTENDANCE REVIEW REQUIRED"));
  assert.equal(timeline.totalWorkedSeconds, 29942);
});

test("Attendance Timeline Regression: Completed session ignores stray break events at or after clock out", () => {
  // Mohamed Shawky scenario:
  // Clock in: 08:19 BST (07:19 UTC)
  // Break start: 12:12:10 BST (11:12:10 UTC)
  // Break end: 13:29:42 BST (12:29:42 UTC) -> 1h 17m 32s (4,652s)
  // Clock out: 17:00:00 BST (16:00:00 UTC)
  // Stray break start: 17:03:17 BST (16:03:17 UTC)
  // Evaluated at 19:45 BST (18:45 UTC)
  const session: RawWorkSession = {
    id: "sess-mohamed-1",
    contractorName: "Mohamed Shawky",
    jobSiteLocation: "Mary G",
    startTime: "2026-08-19T07:19:00.000Z",
    endTime: "2026-08-19T16:00:00.000Z",
    status: "completed",
    attendanceFlag: "ADMIN_CORRECTED",
    events: [
      {
        id: "evt-1",
        workSessionId: "sess-mohamed-1",
        eventType: "CLOCK_IN",
        timestamp: "2026-08-19T07:19:21.000Z",
        source: "worker",
      },
      {
        id: "evt-2",
        workSessionId: "sess-mohamed-1",
        eventType: "BREAK_START",
        timestamp: "2026-08-19T11:12:10.000Z",
        source: "worker",
      },
      {
        id: "evt-3",
        workSessionId: "sess-mohamed-1",
        eventType: "BREAK_END",
        timestamp: "2026-08-19T12:29:42.000Z",
        source: "worker",
      },
      {
        id: "evt-4",
        workSessionId: "sess-mohamed-1",
        eventType: "CLOCK_OUT",
        timestamp: "2026-08-19T16:00:00.000Z",
        source: "admin",
      },
      {
        id: "evt-5",
        workSessionId: "sess-mohamed-1",
        eventType: "BREAK_START",
        timestamp: "2026-08-19T16:03:17.000Z", // Post clock-out break event!
        source: "worker",
      },
      {
        id: "evt-6",
        workSessionId: "sess-mohamed-1",
        eventType: "ADMIN_CORRECTION",
        timestamp: "2026-08-19T18:38:36.000Z",
        source: "admin",
      },
    ],
  };

  const evalTime = new Date("2026-08-19T18:45:00.000Z"); // 19:45 BST
  const timeline = buildAttendanceTimeline([session], "Mohamed Shawky", evalTime, "2026-08-19");

  // Total break must ONLY be the valid lunch break (1h 17m 32s = 4652s), NOT 3h 54m!
  assert.equal(timeline.totalBreakSeconds, 4652);
  assert.equal(timeline.sessions[0].breakDurationSeconds, 4652);

  // Gross: 07:19 to 16:00 = 8h 41m = 31260s. Net = 31260 - 4652 = 26608s (7.39h ~ 7h 24m)
  assert.equal(timeline.totalWorkedSeconds, 26608);
  assert.equal(timeline.totalWorkedHours, 7.39);
  assert.equal(timeline.attendanceFlag, null);
});

test("Attendance Timeline Regression: Completed session with unclosed break started before end_time is capped at end_time", () => {
  // Clock in: 08:00 (07:00 UTC)
  // Break start: 16:30 (15:30 UTC) - never ended
  // Clock out: 17:00 (16:00 UTC)
  // Evaluated at 20:00 (19:00 UTC)
  const session: RawWorkSession = {
    id: "sess-cap-test",
    contractorName: "Mohamed Shawky",
    jobSiteLocation: "Mary G",
    startTime: "2026-08-19T07:00:00.000Z",
    endTime: "2026-08-19T16:00:00.000Z",
    status: "completed",
    events: [
      {
        id: "evt-in",
        workSessionId: "sess-cap-test",
        eventType: "CLOCK_IN",
        timestamp: "2026-08-19T07:00:00.000Z",
        source: "worker",
      },
      {
        id: "evt-break",
        workSessionId: "sess-cap-test",
        eventType: "BREAK_START",
        timestamp: "2026-08-19T15:30:00.000Z",
        source: "worker",
      },
      {
        id: "evt-out",
        workSessionId: "sess-cap-test",
        eventType: "CLOCK_OUT",
        timestamp: "2026-08-19T16:00:00.000Z",
        source: "admin",
      },
    ],
  };

  const evalTime = new Date("2026-08-19T19:00:00.000Z"); // 20:00 BST (3 hours after clock out)
  const timeline = buildAttendanceTimeline([session], "Mohamed Shawky", evalTime, "2026-08-19");

  // Break must be capped at 17:00 (30 mins = 1800s), NOT calculated up to 20:00 (3.5 hours)!
  assert.equal(timeline.totalBreakSeconds, 1800);
  assert.equal(timeline.sessions[0].breakDurationSeconds, 1800);
  // Gross: 9 hours (32400s). Net = 32400 - 1800 = 30600s (8.5h)
  assert.equal(timeline.totalWorkedSeconds, 30600);
  assert.equal(timeline.totalWorkedHours, 8.5);
});


