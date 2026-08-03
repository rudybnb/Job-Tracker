import { db } from "./db.ts";
import { sql } from "drizzle-orm";
import { verifySchemaHealthWithQuery, type SchemaHealthResult } from "./schema-health-core.ts";
export { sanitizeErrorMessage, type SchemaHealthResult } from "./schema-health-core.ts";

/**
 * Read-only health check to verify database schema integrity on server start.
 * Performs strictly SELECT queries — ZERO CREATE, ALTER, DROP, or TRUNCATE statements.
 * Never prints raw database credentials or full connection URLs.
 */
export async function verifySchemaHealth(): Promise<SchemaHealthResult> {
  return verifySchemaHealthWithQuery((kind) => kind === "tables"
    ? db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)
    : db.execute(sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`));
}
