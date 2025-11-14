import { db } from "./db";
import { sql } from "drizzle-orm";

/**
 * Simple database initialization for immediate login functionality
 * Creates only the essential tables needed for basic authentication
 */
export async function simpleInitDatabase() {
  console.log('🔧 Simple database initialization...');
  
  try {
    // Create a simple users table for authentication
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS simple_users (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'contractor',
        full_name TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ simple_users table ready');

    // Create staff table if it doesn't exist (for admin login)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS staff (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        full_name TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ staff table ready');

    // Check if admin user exists, if not create one
    const adminCheck = await db.execute(sql`
      SELECT * FROM staff WHERE username = 'admin' LIMIT 1;
    `);
    
    if (!Array.isArray(adminCheck) || adminCheck.length === 0) {
      // Create default admin user (password: admin123)
      // In production, this should be changed immediately
      await db.execute(sql`
        INSERT INTO staff (username, password, role, full_name)
        VALUES ('admin', 'admin123', 'admin', 'System Administrator');
      `);
      console.log('✅ Default admin user created (username: admin, password: admin123)');
    }

    // Check if test contractor exists
    const contractorCheck = await db.execute(sql`
      SELECT * FROM simple_users WHERE username = 'rudy' LIMIT 1;
    `);
    
    if (!Array.isArray(contractorCheck) || contractorCheck.length === 0) {
      // Create test contractor user
      await db.execute(sql`
        INSERT INTO simple_users (username, password, role, full_name)
        VALUES ('rudy', 'rudy123', 'contractor', 'Rudy Test User');
      `);
      console.log('✅ Test contractor user created (username: rudy, password: rudy123)');
    }

    console.log('✅ Simple database initialization complete');
    console.log('📝 You can now login with:');
    console.log('   Admin: username=admin, password=admin123');
    console.log('   Contractor: username=rudy, password=rudy123');
    
  } catch (error) {
    console.error('❌ Simple database initialization error:', error);
    // Don't throw - allow server to continue
  }
}
