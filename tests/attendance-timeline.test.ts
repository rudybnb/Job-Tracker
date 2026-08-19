import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAttendanceTimeline,
  getLondonDateString,
  isSessionInLondonDate,
  type RawWorkSession,
} from "../server/attendance-timeline.ts";

test("getLondonDateString: formats correctly in Europe/London timezone", () => {
  // 2026-08-18 01:00 UTC is 2026-08-18 02:00 BST
  const d = new Date("2026-08-18T01:00:00.000Z");
  assert.equal(getLondonDateString(d), "2026-08-18");

  // Late night test: 2026-08-17 23:30 UTC is 2026-08-18 00:30 BST (London day 2026-08-18)
  const lateNight = new Date("2026-08-17T23:30:00.000Z");
  assert.equal(getLondonDateString(lateNight), "2026-08-18");
});

test("isSessionInLondonDate: filters correctly on Europe/London boundaries", () => {
  assert.ok(isSessionInLondonDate("2026-08-18T06:38:58.803Z", "2026-08-18"));
  assert.ok(isSessionInLondonDate("2026-08-17T23:30:00.000Z", "2026-08-18")); // BST
  assert.ok(!isSessionInLondonDate("2026-08-17T22:30:00.000Z", "2026-08-18")); // 23:30 BST Aug 17
});

test("buildAttendanceTimeline: multi-session day with lunch break gap", () => {
  // Morning: 07:30 to 12:00 (4.5h = 16,200s)
  // Lunch Break: 12:00 to 12:45 (45m = 2,700s break)
  // Afternoon: 12:45 to 16:45 (4h = 14,400s)
  const sessions: RawWorkSession[] = [
    {
      id: "sess-2",
      contractorName: "Mohamed Shawky",
      jobSiteLocation: "Mary G",
      startTime: "2026-08-18T11:45:00.000Z", // 12:45 BST
      endTime: "2026-08-18T15:45:00.000Z", // 16:45 BST
      status: "completed",
    },
    {
      id: "sess-1",
      contractorName: "Mohamed Shawky",
      jobSiteLocation: "Mary G",
      startTime: "2026-08-18T06:30:00.000Z", // 07:30 BST
      endTime: "2026-08-18T11:00:00.000Z", // 12:00 BST
      status: "completed",
    },
  ];

  const timeline = buildAttendanceTimeline(sessions, "Mohamed Shawky", new Date("2026-08-18T16:45:00.000Z"), "2026-08-18");

  assert.equal(timeline.sessions.length, 2);
  // Chronological ordering check
  assert.equal(timeline.sessions[0].id, "sess-1");
  assert.equal(timeline.sessions[1].id, "sess-2");

  // Session 1 checks
  assert.equal(timeline.sessions[0].durationSeconds, 16200);
  assert.equal(timeline.sessions[0].breakBeforeSeconds, null);

  // Session 2 checks (lunch break: 12:00 to 12:45 = 45m = 2700s)
  assert.equal(timeline.sessions[1].durationSeconds, 14400);
  assert.equal(timeline.sessions[1].breakBeforeSeconds, 2700);

  // Total checks
  assert.equal(timeline.totalWorkedSeconds, 30600); // 16200 + 14400 = 8.5h
  assert.equal(timeline.totalWorkedHours, 8.5);
  assert.equal(timeline.totalBreakSeconds, 2700);
  assert.equal(timeline.isCurrentlyClockedIn, false);
});

test("buildAttendanceTimeline: active in-progress afternoon session", () => {
  // Morning: 07:39 to 12:15 (4h 36m = 16,560s)
  // Lunch: 12:15 to 13:00 (45m break)
  // Afternoon: 13:00 to Now (14:30) (1h 30m = 5,400s active)
  const now = new Date("2026-08-18T13:30:00.000Z"); // 14:30 BST
  const sessions: RawWorkSession[] = [
    {
      id: "sess-1",
      contractorName: "Ahmed Gouda",
      jobSiteLocation: "Mary G",
      startTime: "2026-08-18T06:39:00.000Z", // 07:39 BST
      endTime: "2026-08-18T11:15:00.000Z", // 12:15 BST
      status: "completed",
    },
    {
      id: "sess-2",
      contractorName: "Ahmed Gouda",
      jobSiteLocation: "Mary G",
      startTime: "2026-08-18T12:00:00.000Z", // 13:00 BST
      endTime: null,
      status: "active",
    },
  ];

  const timeline = buildAttendanceTimeline(sessions, "Ahmed Gouda", now, "2026-08-18");

  assert.equal(timeline.sessions.length, 2);
  assert.equal(timeline.sessions[0].status, "completed");
  assert.equal(timeline.sessions[0].durationSeconds, 16560);

  assert.equal(timeline.sessions[1].status, "active");
  assert.equal(timeline.sessions[1].breakBeforeSeconds, 2700); // 45m break
  assert.equal(timeline.sessions[1].durationSeconds, 5400); // 1.5h live elapsed

  assert.equal(timeline.totalWorkedSeconds, 16560 + 5400);
  assert.equal(timeline.activeSessionId, "sess-2");
  assert.equal(timeline.isCurrentlyClockedIn, true);
});

test("buildAttendanceTimeline: excludes invalid/corrupt sessions from worked totals", () => {
  const sessions: RawWorkSession[] = [
    {
      id: "sess-valid",
      contractorName: "Mohamed Shawky",
      jobSiteLocation: "Mary G",
      startTime: "2026-08-18T07:00:00.000Z",
      endTime: "2026-08-18T11:00:00.000Z",
      status: "completed",
    },
    {
      id: "sess-corrupt",
      contractorName: "Mohamed Shawky",
      jobSiteLocation: "Mary G",
      startTime: "2026-08-18T15:00:00.000Z",
      endTime: "2026-08-18T14:00:00.000Z", // End before start!
      status: "completed",
    },
  ];

  const timeline = buildAttendanceTimeline(sessions, "Mohamed Shawky", new Date("2026-08-18T16:00:00.000Z"), "2026-08-18");

  assert.equal(timeline.sessions.length, 2);
  assert.equal(timeline.sessions[0].isValid, true);
  assert.equal(timeline.sessions[1].isValid, false);
  assert.equal(timeline.sessions[1].status, "invalid");
  assert.equal(timeline.sessions[1].durationSeconds, 0);

  // Total worked time should only count the valid 4 hours (14,400s)
  assert.equal(timeline.totalWorkedSeconds, 14400);
  assert.equal(timeline.totalWorkedHours, 4.0);
});

test("buildAttendanceTimeline: safety check flags completed session missing CLOCK_OUT and admin correction", () => {
  const sessions: RawWorkSession[] = [
    {
      id: "sess-auto-closed",
      contractorName: "Ahmed Gouda",
      jobSiteLocation: "Mary G",
      startTime: "2026-08-19T06:06:58.000Z",
      endTime: "2026-08-19T16:00:00.000Z", // Completed
      status: "completed",
      events: [
        {
          id: "evt-in",
          workSessionId: "sess-auto-closed",
          eventType: "CLOCK_IN",
          timestamp: "2026-08-19T06:06:58.000Z",
          source: "worker",
        },
        {
          id: "evt-break-start",
          workSessionId: "sess-auto-closed",
          eventType: "BREAK_START",
          timestamp: "2026-08-19T11:12:00.000Z",
          source: "worker",
        },
        {
          id: "evt-break-end",
          workSessionId: "sess-auto-closed",
          eventType: "BREAK_END",
          timestamp: "2026-08-19T12:16:00.000Z",
          source: "worker",
        },
        // NO CLOCK_OUT EVENT!
      ],
    },
  ];

  const timeline = buildAttendanceTimeline(sessions, "Ahmed Gouda", new Date("2026-08-19T17:00:00.000Z"), "2026-08-19");
  assert.equal(timeline.sessions.length, 1);
  assert.equal(timeline.attendanceFlag, "ATTENDANCE REVIEW REQUIRED");
  assert.ok(timeline.sessions[0].attendanceFlag?.includes("ATTENDANCE REVIEW REQUIRED"));
});

test("buildAttendanceTimeline: completed session WITH CLOCK_OUT event has normal status", () => {
  const sessions: RawWorkSession[] = [
    {
      id: "sess-normal-clockout",
      contractorName: "Ahmed Gouda",
      jobSiteLocation: "Mary G",
      startTime: "2026-08-19T06:06:58.000Z",
      endTime: "2026-08-19T16:30:00.000Z",
      status: "completed",
      events: [
        {
          id: "evt-in",
          workSessionId: "sess-normal-clockout",
          eventType: "CLOCK_IN",
          timestamp: "2026-08-19T06:06:58.000Z",
          source: "worker",
        },
        {
          id: "evt-out",
          workSessionId: "sess-normal-clockout",
          eventType: "CLOCK_OUT",
          timestamp: "2026-08-19T16:30:00.000Z",
          source: "worker",
        },
      ],
    },
  ];

  const timeline = buildAttendanceTimeline(sessions, "Ahmed Gouda", new Date("2026-08-19T17:00:00.000Z"), "2026-08-19");
  assert.equal(timeline.sessions.length, 1);
  assert.equal(timeline.attendanceFlag, null);
  assert.equal(timeline.sessions[0].attendanceFlag, null);
});

test("buildAttendanceTimeline: admin corrected completed session does NOT flag review", () => {
  const sessions: RawWorkSession[] = [
    {
      id: "sess-admin-corrected",
      contractorName: "Ahmed Gouda",
      jobSiteLocation: "Mary G",
      startTime: "2026-08-19T06:06:58.000Z",
      endTime: "2026-08-19T16:30:00.000Z",
      status: "completed",
      attendanceFlag: "ADMIN_CORRECTED",
      events: [
        {
          id: "evt-in",
          workSessionId: "sess-admin-corrected",
          eventType: "CLOCK_IN",
          timestamp: "2026-08-19T06:06:58.000Z",
          source: "worker",
        },
        {
          id: "evt-admin-fix",
          workSessionId: "sess-admin-corrected",
          eventType: "CLOCK_OUT",
          timestamp: "2026-08-19T16:30:00.000Z",
          source: "admin",
        },
      ],
    },
  ];

  const timeline = buildAttendanceTimeline(sessions, "Ahmed Gouda", new Date("2026-08-19T17:00:00.000Z"), "2026-08-19");
  assert.equal(timeline.sessions.length, 1);
  assert.ok(!timeline.attendanceFlag?.includes("ATTENDANCE REVIEW REQUIRED"));
});

