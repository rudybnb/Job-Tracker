// Strict UK/international phone normalization to E.164 for WhatsApp destinations.
// Rules:
// - "+<digits>"            -> kept as the caller supplied it (international, never re-guessed).
// - "00<country><number>"  -> international dialing prefix, converted to "+<country><number>".
// - "0<national>"          -> UK trunk prefix, converted to "+44<national without leading 0>".
// - any other bare digits  -> country is ambiguous, REJECTED (never guess a country).
// Returns undefined for missing, malformed, or unnormalizable input.

const E164_MIN_DIGITS = 8;
const E164_MAX_DIGITS = 15;
const E164_PATTERN = /^\+[0-9]{8,15}$/;
// UK national significant numbers (after the country code) are 9-10 digits.
const UK_NSN_PATTERN = /^[0-9]{9,10}$/;

export function normalizePhoneToE164(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;

  const trimmed = input.trim();
  if (trimmed.length === 0) return undefined;

  const plusCount = (trimmed.match(/\+/g) ?? []).length;
  if (plusCount > 1) return undefined;

  // Keep only digits and a leading plus.
  const digitsOnly = trimmed.replace(/[^0-9+]/g, "");

  let e164: string;
  if (digitsOnly.startsWith("+")) {
    e164 = digitsOnly;
  } else if (digitsOnly.startsWith("00")) {
    e164 = "+" + digitsOnly.slice(2);
  } else if (digitsOnly.startsWith("0")) {
    // Leading 0 is the UK trunk prefix; treat as a UK national number.
    e164 = "+44" + digitsOnly.slice(1);
  } else {
    // Bare digits without +, 00, or a leading 0. Never guess a country.
    return undefined;
  }

  if (!E164_PATTERN.test(e164)) return undefined;

  if (e164.startsWith("+44")) {
    const ukNationalSignificant = e164.slice(3);
    if (!UK_NSN_PATTERN.test(ukNationalSignificant)) return undefined;
  }

  return e164;
}
