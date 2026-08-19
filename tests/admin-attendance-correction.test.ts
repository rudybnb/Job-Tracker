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

