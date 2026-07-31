import { db } from "./db";
import { sql } from "drizzle-orm";
import { financialTablesCore, type SqlExecutor } from "./financial-tables-core";

/**
 * Initialize financial tracking tables.
 * Creates financial tables only if they do not exist and seeds default
 * contractor types idempotently. Never touches the canonical jobs or
 * contractors tables defined in shared/schema.ts, and never drops data.
 */
export async function initFinancialTables(executor?: SqlExecutor): Promise<void> {
  console.log('💰 Initializing financial tracking tables (creating missing tables if absent)...');

  try {
    await financialTablesCore(executor ?? ((query) => db.execute(sql.raw(query))));
    console.log('✅ Financial tracking tables initialization complete');

  } catch (error) {
    console.error('❌ Financial tables initialization error:', error);
    // Don't throw - allow server to continue
  }
}
