import { db } from "./db";
import { sql } from "drizzle-orm";
import { simpleInitCore, type SimpleInitSeedOptions, type SqlExecutor } from "./simple-init-core";

/**
 * Simple database initialization for immediate login functionality.
 * Creates the essential tables only if they do not exist. Account seeding is
 * allowed only when an explicit hash and parameter-aware executor are supplied.
 * Never drops or deletes existing data.
 */
export async function simpleInitDatabase(
  executor?: SqlExecutor,
  options?: SimpleInitSeedOptions,
): Promise<void> {
  console.log('🔧 Simple database initialization (creating missing tables only)...');

  try {
    if (options?.adminPasswordHash && !executor) {
      throw new Error("An explicit parameter-aware executor is required when seeding staff.");
    }
    await simpleInitCore(executor ?? ((query) => db.execute(sql.raw(query))), options);
    console.log('✅ Simple database table initialization complete; no default accounts were created.');

  } catch (error) {
    console.error('❌ Simple database initialization error:', error);
    // Don't throw - allow server to continue
  }
}
