import { db } from "./db";
import { sql } from "drizzle-orm";
import { simpleInitCore, type SqlExecutor } from "./simple-init-core";

/**
 * Simple database initialization for immediate login functionality.
 * Creates the essential tables only if they do not exist and seeds
 * default accounts idempotently. Never drops or deletes existing data.
 */
export async function simpleInitDatabase(executor?: SqlExecutor): Promise<void> {
  console.log('🔧 Simple database initialization (creating missing tables and seed data if absent)...');

  try {
    await simpleInitCore(executor ?? ((query) => db.execute(sql.raw(query))));
    console.log('✅ Simple database initialization complete');
    console.log('📝 Login accounts (only created if missing):');
    console.log('   Admin: username=admin, password=admin123');
    console.log('   Contractor: username=rudy, password=rudy123');

  } catch (error) {
    console.error('❌ Simple database initialization error:', error);
    // Don't throw - allow server to continue
  }
}
