import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateApprovedChangeOrder,
  validateIdempotencyKey,
} from "../server/integration-contracts.ts";

function validPayload(): Record<string, unknown> {
  return {
    schema_version: 1,
    event_id: "evt-2026-0001",
    event_type: "change_order.approved",
    producer: "jarvis",
    correlation_id: "corr-2026-0001",
    occurred_at: "2026-08-03T12:00:00.000Z",
    change_order_id: "co-0001",
    revision: 1,
    project_integration_id: "project-0001",
    title: "Add west wall blocking",
    scope: "Supply and install approved blocking.",
    approval_status: "approved",
    approved_at: "2026-08-03T11:58:00.000Z",
    approved_by_actor_id: "actor-0042",
    currency: "USD",
    approved_amount_minor: 125000,
    tasks: [{
      task_id: "task-0001",
      title: "Install blocking",
      instructions: "Install per approved detail A-4.",
      quantity: 12,
      unit: "linear_ft",
      approved_amount_minor: 125000,
    }],
  };
}

test("valid approved change-order payload passes", () => {
  const result = validateApprovedChangeOrder(validPayload());
  assert.equal(result.success, true);
});

test("draft and proposed payloads fail", () => {
  for (const approvalStatus of ["draft", "proposed"]) {
    const payload = { ...validPayload(), approval_status: approvalStatus };
    assert.equal(validateApprovedChangeOrder(payload).success, false);
  }
});

test("raw meeting-note and transcript fields fail", () => {
  for (const rawField of ["meeting_notes", "transcript"]) {
    const payload = { ...validPayload(), [rawField]: "Unapproved meeting discussion" };
    assert.equal(validateApprovedChangeOrder(payload).success, false);
  }
});

test("duplicate task IDs fail", () => {
  const payload = validPayload();
  payload.tasks = [
    ...(payload.tasks as Array<Record<string, unknown>>),
    {
      task_id: "task-0001",
      title: "Duplicate task",
      instructions: "Must not be accepted.",
      quantity: 1,
      unit: "each",
      approved_amount_minor: 0,
    },
  ];
  assert.equal(validateApprovedChangeOrder(payload).success, false);
});

test("missing IDs, negative money, unsupported versions, and empty task lists fail", () => {
  const missingEventId = validPayload();
  delete missingEventId.event_id;
  assert.equal(validateApprovedChangeOrder(missingEventId).success, false);

  assert.equal(validateApprovedChangeOrder({
    ...validPayload(),
    approved_amount_minor: -1,
  }).success, false);
  assert.equal(validateApprovedChangeOrder({
    ...validPayload(),
    schema_version: 2,
  }).success, false);
  assert.equal(validateApprovedChangeOrder({
    ...validPayload(),
    tasks: [],
  }).success, false);
});

test("project and contractor names are not accepted as matching identifiers", () => {
  const payload = validPayload();
  delete payload.project_integration_id;
  payload.project_name = "Westside Remodel";
  payload.contractor_name = "Example Contractor";
  assert.equal(validateApprovedChangeOrder(payload).success, false);
});

test("idempotency key is required and must exactly match event_id", () => {
  assert.equal(validateIdempotencyKey("evt-2026-0001", "evt-2026-0001"), true);
  assert.equal(validateIdempotencyKey(undefined, "evt-2026-0001"), false);
  assert.equal(validateIdempotencyKey("evt-2026-0002", "evt-2026-0001"), false);
  assert.equal(validateIdempotencyKey(" evt-2026-0001 ", "evt-2026-0001"), false);
});
