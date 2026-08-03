import { sanitizeLogMessage } from "./db-safety.ts";
import { extractStaffRow, type StaffLookupResult } from "./staff-types.ts";

export type StaffRowQuery = (normalizedUsername: string) => Promise<unknown>;

export async function getStaffByUsername(
  queryStaffRow: StaffRowQuery,
  rawUsername: string,
): Promise<StaffLookupResult> {
  if (!rawUsername || typeof rawUsername !== "string") {
    return { status: "NOT_FOUND" };
  }

  const username = rawUsername.trim().toLowerCase();
  if (username.length === 0) {
    return { status: "NOT_FOUND" };
  }

  try {
    const staff = extractStaffRow(await queryStaffRow(username));
    return staff ? { status: "FOUND", staff } : { status: "NOT_FOUND" };
  } catch (error) {
    const rawErrorMsg = error instanceof Error ? error.message : String(error);
    const sanitizedMessage = sanitizeLogMessage(rawErrorMsg);
    console.error(`[STAFF_LOOKUP_FAILED] Database lookup failed: ${sanitizedMessage}`);
    return {
      status: "DB_ERROR",
      code: "STAFF_LOOKUP_FAILED",
      sanitizedMessage,
    };
  }
}
