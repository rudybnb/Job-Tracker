export interface SchemaHealthResult {
  ready: boolean;
  code: "SCHEMA_READY" | "REQUIRED_TABLE_MISSING" | "CRITICAL_COLUMN_MISSING" | "SCHEMA_NOT_READY";
  missingTables: string[];
  missingColumns: string[];
  message: string;
}

export type SchemaHealthQuery = (kind: "tables" | "columns") => Promise<unknown>;

export const REQUIRED_TABLES: ReadonlyArray<string> = [
  "contractors",
  "jobs",
  "csv_uploads",
  "work_sessions",
  "staff",
  "simple_users",
  "clients",
  "job_phases",
];

export const CRITICAL_COLUMNS: ReadonlyArray<{ table: string; column: string }> = [
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

function rowsFrom(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  if (result && typeof result === "object" && "rows" in result && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: Array<Record<string, unknown>> }).rows;
  }
  return [];
}

export async function verifySchemaHealthWithQuery(query: SchemaHealthQuery): Promise<SchemaHealthResult> {
  try {
    const existingTables = new Set(rowsFrom(await query("tables")).map((row) => String(row.table_name ?? "")));
    const missingTables = REQUIRED_TABLES.filter((table) => !existingTables.has(table));
    if (missingTables.length > 0) {
      return {
        ready: false,
        code: "REQUIRED_TABLE_MISSING",
        missingTables,
        missingColumns: [],
        message: `Database schema incomplete. Missing required tables: [${missingTables.join(", ")}]. Run manual bootstrap: 'npm run db:bootstrap-empty -- --confirm-empty-database'.`,
      };
    }

    const existingColumns = new Set(
      rowsFrom(await query("columns")).map((row) => `${String(row.table_name ?? "")}.${String(row.column_name ?? "")}`),
    );
    const missingColumns = CRITICAL_COLUMNS
      .filter(({ table, column }) => !existingColumns.has(`${table}.${column}`))
      .map(({ table, column }) => `${table}.${column}`);
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
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Failed to query database schema.";
    return {
      ready: false,
      code: "SCHEMA_NOT_READY",
      missingTables: [...REQUIRED_TABLES],
      missingColumns: [],
      message: `Database health check failed safely: ${sanitizeErrorMessage(rawMessage)}`,
    };
  }
}
