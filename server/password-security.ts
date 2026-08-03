import bcrypt from "bcryptjs";
import { type StaffLookupResult, type ResponseStaffData, sanitizeStaffResponse } from "./staff-types.ts";

/**
 * Dedicated Password Security & Authentication Module (Phase 0C2)
 * Strictly uses repository's installed bcryptjs package.
 */

/**
 * Valid, pre-compiled bcrypt hash (work factor 10) for CPU timing equalization on missing usernames.
 * Hash of "job_tracker_dummy_timing_password_10".
 */
export const DUMMY_BCRYPT_HASH = "$2b$10$7jLppcxxcC8LgsKNw8Hnnu7lL4aID/g2oH8qFEChDxI3t2J4RwDWm";

/**
 * Hashes a password string using bcrypt with work factor 10.
 * Does NOT trim password string (preserves exact submitted password).
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || typeof password !== "string") {
    throw new Error("Cannot hash password: input must be a non-empty string");
  }
  if (password.trim().length === 0) {
    throw new Error("Cannot hash password: password cannot consist entirely of whitespace");
  }
  if (password.length < 8) {
    throw new Error("Cannot hash password: password must be at least 8 characters");
  }
  return bcrypt.hash(password, 10);
}

/**
 * Verifies a submitted password string against a stored bcrypt hash.
 * Does NOT trim password string.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash || typeof password !== "string" || typeof storedHash !== "string") {
    return false;
  }
  try {
    return await bcrypt.compare(password, storedHash);
  } catch {
    return false;
  }
}

/**
 * Performs real bcrypt hashing work against the fixed dummy hash when a username is not found.
 * Equalizes CPU work to prevent timing enumeration attacks.
 * Always returns false.
 */
export async function verifyDummyPassword(password: string): Promise<boolean> {
  if (!password || typeof password !== "string") {
    return false;
  }
  try {
    await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
  } catch {
    // Ignore comparison errors
  }
  return false;
}

export type AuthResult =
  | { readonly success: true; readonly user: ResponseStaffData }
  | { readonly success: false; readonly statusCode: 401; readonly error: "Invalid credentials" }
  | { readonly success: false; readonly statusCode: 500; readonly error: "Internal server error" };

/**
 * Shared staff authentication logic used consistently by server routes.
 */
export async function authenticateStaffUser(
  storage: { getStaffByUsername: (username: string) => Promise<StaffLookupResult> },
  rawUsername: string,
  rawPassword: string,
): Promise<AuthResult> {
  if (!rawUsername || typeof rawUsername !== "string" || !rawPassword || typeof rawPassword !== "string") {
    return { success: false, statusCode: 401, error: "Invalid credentials" };
  }

  const username = rawUsername.trim().toLowerCase();
  if (username.length === 0) {
    return { success: false, statusCode: 401, error: "Invalid credentials" };
  }

  // Exact password string supplied (NO trimming)
  const password = rawPassword;

  const lookup = await storage.getStaffByUsername(username);

  if (lookup.status === "DB_ERROR") {
    return { success: false, statusCode: 500, error: "Internal server error" };
  }

  if (lookup.status === "FOUND") {
    const isValid = await verifyPassword(password, lookup.staff.password);
    if (isValid) {
      return { success: true, user: sanitizeStaffResponse(lookup.staff) };
    }
  } else {
    // Equalize CPU timing work on missing user
    await verifyDummyPassword(password);
  }

  return { success: false, statusCode: 401, error: "Invalid credentials" };
}
