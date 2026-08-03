import { verifyPassword } from "./password-security.ts";
import type { SqlExecutor } from "./schema-bootstrap-core.ts";

const REQUIRED_STAFF_COLUMNS = ["id", "username", "password", "role", "full_name", "created_at"] as const;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

function rowsFrom(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  if (result && typeof result === "object" && "rows" in result && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: Array<Record<string, unknown>> }).rows;
  }
  return [];
}

export async function verifyFinalStaffSchema(executor: SqlExecutor): Promise<void> {
  const columnRows = rowsFrom(await executor(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'staff';`,
  ));
  const columns = new Set(columnRows.map((row) => String(row.column_name ?? "")));
  const missingColumns = REQUIRED_STAFF_COLUMNS.filter((column) => !columns.has(column));
  if (missingColumns.length > 0) {
    throw new Error(`Final staff schema verification failed: missing columns [${missingColumns.join(", ")}].`);
  }

  const indexRows = rowsFrom(await executor(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'staff' AND indexname = 'idx_staff_username_lower';`,
  ));
  const usernameIndex = indexRows.find((row) => row.indexname === "idx_staff_username_lower");
  const indexDefinition = String(usernameIndex?.indexdef ?? "");
  if (!/CREATE\s+UNIQUE\s+INDEX/i.test(indexDefinition) || !/lower\s*\(\s*username\s*\)/i.test(indexDefinition)) {
    throw new Error("Final staff schema verification failed: case-insensitive username uniqueness index is missing.");
  }
}

export async function verifyFinalAdminSeed(
  executor: SqlExecutor,
  expectedPassword: string,
): Promise<void> {
  const adminRows = rowsFrom(await executor(
    `SELECT username, password
     FROM staff
     WHERE LOWER(username) = $1
     LIMIT 2;`,
    ["admin"],
  ));
  if (adminRows.length !== 1) {
    throw new Error("Final admin seed verification failed: expected exactly one admin account.");
  }

  const storedHash = String(adminRows[0].password ?? "");
  if (!BCRYPT_HASH_PATTERN.test(storedHash) || !(await verifyPassword(expectedPassword, storedHash))) {
    throw new Error("Final admin seed verification failed: stored password is not the expected bcrypt hash.");
  }
}
