/**
 * Phase QR-4 — Admin live-monitor presentation tests.
 *
 * Focused on the QR-4 helpers that map site-checkin work-session data into the
 * admin Live Monitor view (ON SITE / CHECKED OUT). Pure logic, no database.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdminSiteSessionView,
  buildAdminSiteSessionViews,
  isSessionActive,
  type SiteCheckinSessionUser,
} from "../server/site-checkin.ts";

function makeSession(
  overrides: Partial<SiteCheckinSessionUser> = {},
): SiteCheckinSessionUser {
  return {
    id: "ws-1",
    contractorName: "Worker 1",
    jobSiteLocation: "Spencer House",
    startTime: new Date("2026-01-01T10:00:00Z"),
    endTime: null,
    status: "active",
    ...overrides,
  };
}

test("active session maps to ON SITE with no check-out time", () => {
  const view = buildAdminSiteSessionView(makeSession());
  assert.equal(view.status, "ON SITE");
  assert.equal(view.isActive, true);
  assert.equal(view.workerName, "Worker 1");
  assert.equal(view.checkedInAt, "2026-01-01T10:00:00.000Z");
  assert.equal(view.checkedOutAt, null);
});

test("completed session maps to CHECKED OUT and preserves check-out time", () => {
  const view = buildAdminSiteSessionView(
    makeSession({
      status: "completed",
      endTime: new Date("2026-01-01T17:00:00Z"),
    }),
  );
  assert.equal(view.status, "CHECKED OUT");
  assert.equal(view.isActive, false);
  assert.equal(view.checkedOutAt, "2026-01-01T17:00:00.000Z");
});

test("isSessionActive is true only for status 'active'", () => {
  assert.equal(isSessionActive("active"), true);
  assert.equal(isSessionActive("completed"), false);
  assert.equal(isSessionActive(null), false);
  assert.equal(isSessionActive(undefined), false);
});

test("string start/end times are normalised to ISO", () => {
  const view = buildAdminSiteSessionView(
    makeSession({
      startTime: "2026-01-01T10:00:00Z",
      status: "completed",
      endTime: "2026-01-01T17:00:00Z",
    }),
  );
  assert.equal(view.checkedInAt, "2026-01-01T10:00:00.000Z");
  assert.equal(view.checkedOutAt, "2026-01-01T17:00:00.000Z");
});

test("buildAdminSiteSessionViews maps a collection of sessions", () => {
  const views = buildAdminSiteSessionViews([
    makeSession({ id: "ws-1", status: "active" }),
    makeSession({ id: "ws-2", status: "completed", endTime: new Date("2026-01-01T15:00:00Z") }),
  ]);
  assert.equal(views.length, 2);
  assert.equal(views[0].status, "ON SITE");
  assert.equal(views[1].status, "CHECKED OUT");
  assert.equal(views[1].checkedOutAt, "2026-01-01T15:00:00.000Z");
});