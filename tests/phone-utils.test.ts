import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePhoneToE164 } from "../server/phone-utils.ts";

test("normalizes common UK mobile formats to E.164", () => {
  assert.equal(normalizePhoneToE164("07912 345678"), "+447912345678");
  assert.equal(normalizePhoneToE164("07912345678"), "+447912345678");
  assert.equal(normalizePhoneToE164("07123456789"), "+447123456789");
  assert.equal(normalizePhoneToE164("+44 7912 345678"), "+447912345678");
  assert.equal(normalizePhoneToE164("+447911123456"), "+447911123456");
  assert.equal(normalizePhoneToE164("0044791123456"), "+44791123456");
  assert.equal(normalizePhoneToE164("020 7946 0958"), "+442079460958");
});

test("preserves clearly international numbers without guessing a country", () => {
  assert.equal(normalizePhoneToE164("+49 170 1234567"), "+491701234567");
  assert.equal(normalizePhoneToE164("+353871234567"), "+353871234567");
  assert.equal(normalizePhoneToE164("+1 415 555 2671"), "+14155552671");
});

test("rejects ambiguous bare numbers (never guesses a country)", () => {
  assert.equal(normalizePhoneToE164("447912345678"), undefined);
  assert.equal(normalizePhoneToE164("491701234567"), undefined);
  assert.equal(normalizePhoneToE164("7912345678"), undefined);
});

test("rejects missing and invalid input", () => {
  assert.equal(normalizePhoneToE164(undefined), undefined);
  assert.equal(normalizePhoneToE164(null), undefined);
  assert.equal(normalizePhoneToE164(""), undefined);
  assert.equal(normalizePhoneToE164("   "), undefined);
  assert.equal(normalizePhoneToE164(12345), undefined);
  assert.equal(normalizePhoneToE164("abc"), undefined);
  assert.equal(normalizePhoneToE164("0"), undefined);
  assert.equal(normalizePhoneToE164("+"), undefined);
  assert.equal(normalizePhoneToE164("++447911123456"), undefined);
  assert.equal(normalizePhoneToE164("+44791"), undefined);
  assert.equal(normalizePhoneToE164("0791"), undefined);
  assert.equal(normalizePhoneToE164("+447911123456789012345678901"), undefined);
});
