/**
 * Staff Data Contracts & Response Sanitization (Phase 0C2)
 */

export interface InternalStaffRecord {
  readonly id: string;
  readonly username: string;
  readonly password: string; // bcrypt hash
  readonly role: string;
  readonly full_name: string | null;
  readonly name: string | null;
  readonly created_at: Date | string;
}

export interface SessionStaffIdentity {
  readonly userId: string;
  readonly username: string;
  readonly role: string;
}

export interface ResponseStaffData {
  readonly id: string;
  readonly username: string;
  readonly fullName: string;
  readonly name: string;
  readonly role: string;
  readonly isStaff: true;
}

/**
 * Dedicated sanitization function to strip password fields before returning staff JSON responses.
 * Fails closed if required fields (id, role) are missing or invalid.
 */
export function sanitizeStaffResponse(staff: InternalStaffRecord): ResponseStaffData {
  if (!staff || typeof staff !== "object") {
    throw new Error("Cannot sanitize staff response: invalid staff object");
  }
  if (!staff.id || typeof staff.id !== "string" || staff.id.trim().length === 0) {
    throw new Error("Cannot sanitize staff response: missing or invalid staff id");
  }
  if (!staff.role || typeof staff.role !== "string" || staff.role.trim().length === 0) {
    throw new Error("Cannot sanitize staff response: missing or invalid staff role");
  }

  const username = staff.username || "";
  const fullName = staff.full_name || staff.name || username;

  return {
    id: staff.id,
    username,
    fullName,
    name: fullName,
    role: staff.role,
    isStaff: true,
  };
}

/**
 * Result shape for database staff lookups.
 * Explicitly separates user-not-found from operational database/query errors.
 */
export type StaffLookupResult =
  | { readonly status: "FOUND"; readonly staff: InternalStaffRecord }
  | { readonly status: "NOT_FOUND" }
  | { readonly status: "DB_ERROR"; readonly code: "STAFF_LOOKUP_FAILED"; readonly sanitizedMessage: string };

/**
 * Safely extracts an InternalStaffRecord from driver execute result.
 * Supports array output (postgres.js) and { rows: [...] } output (node-postgres).
 * Fails closed if core fields (id, username, password, role) are missing.
 */
export function extractStaffRow(result: unknown): InternalStaffRecord | undefined {
  if (!result) return undefined;

  let rows: unknown[] | undefined;
  if (Array.isArray(result)) {
    rows = result;
  } else if (typeof result === "object" && "rows" in result && Array.isArray((result as any).rows)) {
    rows = (result as any).rows;
  }

  if (!rows || rows.length === 0) return undefined;

  const row = rows[0] as Record<string, unknown>;
  if (!row || typeof row !== "object") return undefined;

  const id = row.id != null ? String(row.id).trim() : "";
  const username = row.username != null ? String(row.username).trim() : "";
  const password = row.password != null ? String(row.password) : "";
  const role = row.role != null ? String(row.role).trim() : "";

  if (!id || !username || !password || !role) {
    return undefined;
  }

  const fullNameRaw = row.full_name ?? row.name ?? null;
  const fullName = fullNameRaw != null ? String(fullNameRaw) : null;
  const nameRaw = row.name ?? row.full_name ?? null;
  const name = nameRaw != null ? String(nameRaw) : null;
  const createdAt = (row.created_at as Date | string) || new Date();

  return {
    id,
    username,
    password,
    role,
    full_name: fullName,
    name,
    created_at: createdAt,
  };
}
