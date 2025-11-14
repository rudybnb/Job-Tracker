import { db } from "./db";
import { sql } from "drizzle-orm";

/**
 * Simple database initialization for immediate login functionality
 * Creates only the essential tables needed for basic authentication
 * Drops and recreates tables to ensure clean schema
 */
export async function simpleInitDatabase() {
  console.log('🔧 Simple database initialization (dropping and recreating tables)...');
  
  try {
    // Drop and recreate simple_users table
    await db.execute(sql`DROP TABLE IF EXISTS simple_users CASCADE;`);
    await db.execute(sql`
      CREATE TABLE simple_users (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'contractor',
        full_name TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ simple_users table created');
    
    // Drop and recreate staff table
    await db.execute(sql`DROP TABLE IF EXISTS staff CASCADE;`);
    await db.execute(sql`
      CREATE TABLE staff (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        full_name TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ staff table created');
    
    // Create default admin user (password: admin123)
    await db.execute(sql`
      INSERT INTO staff (username, password, role, full_name)
      VALUES ('admin', 'admin123', 'admin', 'System Administrator');
    `);
    console.log('✅ Default admin user created (username: admin, password: admin123)');
    
    // Create test contractor (password: rudy123)
    await db.execute(sql`
      INSERT INTO simple_users (username, password, role, full_name)
      VALUES ('rudy', 'rudy123', 'contractor', 'Rudy Test');
    `);
    console.log('✅ Test contractor created (username: rudy, password: rudy123)');
    
    console.log('✅ Simple database initialization complete');
    console.log('📝 You can now login with:');
    console.log('   Admin: username=admin, password=admin123');
    console.log('   Contractor: username=rudy, password=rudy123');
    
  } catch (error) {
    console.error('❌ Simple database initialization error:', error);
    // Don't throw - allow server to continue
  }
}
