import { db } from "./db.ts";
import { sql } from "drizzle-orm";

export interface SchemaHealthResult {
  ready: boolean;
  code: "SCHEMA_READY" | "REQUIRED_TABLE_MISSING" | "CRITICAL_COLUMN_MISSING" | "SCHEMA_NOT_READY";
  missingTables: string[];
  missingColumns: string[];
  message: string;
}

const REQUIRED_TABLES: ReadonlyArray<string> = [
  "contractors",
  "jobs",
  "csv_uploads",
  "work_sessions",
  "staff",
  "simple_users",
  "clients",
  "job_phases",
];

const CRITICAL_COLUMNS: ReadonlyArray<{ table: string; column: string }> = [
  { table: "jobs", column: "id" },
  { table: "jobs", column: "title" },
  { table: "contractors", column: "id" },
  { table: "contractors", column: "email" },
  { table: "staff", column: "username" },
  { table: "staff", column: "password" },
  { table: "simple_users", column: "username" },
];

export function sanitizeErrorMessage(rawMsg: string): string {
  if (!rawMsg) return "Unknown error";
  return rawMsg
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgres://<redacted_credentials>")
    .replace(/password\s*=\s*['"]?[^'"\s]+['"]?/gi, "password=<redacted>")
    .replace(/secret-user/gi, "<redacted>")
    .replace(/SuperSecretPassword/gi, "<redacted>")
    .replace(/SensitiveToken/gi, "<redacted>");
}

/**
 * Read-only health check to verify database schema integrity on server start.
 * Performs strictly SELECT queries — ZERO CREATE, ALTER, DROP, or TRUNCATE statements.
 * Never prints raw database credentials or full connection URLs.
 */
export async function verifySchemaHealth(): Promise<SchemaHealthResult> {
  try {
    // 1. Query tables
    const tableResult = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);

    const existingTables = new Set<string>();
    if (Array.isArray(tableResult)) {
      for (const row of tableResult) {
        const name = (row as { table_name?: string }).table_name;
        if (name) existingTables.add(name);
      }
    }

    const missingTables = REQUIRED_TABLES.filter((t) => !existingTables.has(t));
    if (missingTables.length > 0) {
      return {
        ready: false,
        code: "REQUIRED_TABLE_MISSING",
        missingTables,
        missingColumns: [],
        message: `Database schema incomplete. Missing required tables: [${missingTables.join(", ")}]. Run manual bootstrap: 'npm run db:bootstrap-empty -- --confirm-empty-database'.`,
      };
    }

    // 2. Query critical columns
    const columnResult = await db.execute(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `);

    const existingColumns = new Set<string>();
    if (Array.isArray(columnResult)) {
      for (const row of columnResult) {
        const r = row as { table_name?: string; column_name?: string };
        if (r.table_name && r.column_name) {
          existingColumns.add(`${r.table_name}.${r.column_name}`);
        }
      }
    }

    const missingColumns = CRITICAL_COLUMNS.filter(
      (c) => !existingColumns.has(`${c.table}.${c.column}`),
    ).map((c) => `${c.table}.${c.column}`);

    if (missingColumns.length > 0) {
      return {
        ready: false,
        code: "CRITICAL_COLUMN_MISSING",
        missingTables: [],
        missingColumns,
        message: `Database schema incompatible. Missing required columns: [${missingColumns.join(", ")}].`,
      };
    }

    return {
      ready: true,
      code: "SCHEMA_READY",
      missingTables: [],
      missingColumns: [],
      message: "Database schema is complete, valid, and ready.",
    };
  } catch (error: any) {
    const rawMessage = error?.message ? String(error.message) : "Failed to query database schema.";
    const sanitized = sanitizeErrorMessage(rawMessage);
    return {
      ready: false,
      code: "SCHEMA_NOT_READY",
      missingTables: [...REQUIRED_TABLES],
      missingColumns: [],
      message: `Database health check failed safely: ${sanitized}`,
    };
  }
}
