import { db } from "./db";
import { sql } from "drizzle-orm";

/**
 * Initialize database schema on startup
 * Creates missing tables if they don't exist
 */
export async function initializeDatabase() {
  console.log('🔧 Initializing database schema...');
  
  try {
    // Check if work_sessions table exists
    const tableCheck = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'work_sessions'
    `);
    
    const tableExists = Array.isArray(tableCheck) && tableCheck.length > 0;
    
    if (!tableExists) {
      console.log('📋 Creating work_sessions table...');
      
      // Create work_sessions table
      await db.execute(sql`
        CREATE TABLE work_sessions (
          id VARCHAR PRIMARY KEY,
          contractor_name TEXT NOT NULL,
          job_site_location TEXT NOT NULL,
          start_time TIMESTAMP NOT NULL,
          end_time TIMESTAMP,
          total_hours TEXT,
          start_latitude TEXT,
          start_longitude TEXT,
          end_latitude TEXT,
          end_longitude TEXT,
          status TEXT DEFAULT 'active',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      console.log('✅ work_sessions table created successfully');
    } else {
      console.log('✅ work_sessions table already exists');
      
      // Check if all required columns exist
      const columns = await db.execute(sql`
        SELECT column_name 
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'work_sessions'
      `);
      
      const columnNames = Array.isArray(columns) ? columns.map((row: any) => row.column_name) : [];
      const requiredColumns = [
        'id', 'contractor_name', 'job_site_location', 'start_time', 
        'end_time', 'total_hours', 'start_latitude', 'start_longitude',
        'end_latitude', 'end_longitude', 'status', 'created_at'
      ];
      
      // Add missing columns
      for (const col of requiredColumns) {
        if (!columnNames.includes(col)) {
          console.log(`➕ Adding missing column: ${col}`);
          
          let columnDef = '';
          switch (col) {
            case 'id':
              columnDef = 'VARCHAR PRIMARY KEY';
              break;
            case 'contractor_name':
            case 'job_site_location':
              columnDef = 'TEXT NOT NULL';
              break;
            case 'start_time':
              columnDef = 'TIMESTAMP NOT NULL';
              break;
            case 'end_time':
              columnDef = 'TIMESTAMP';
              break;
            case 'status':
              columnDef = "TEXT DEFAULT 'active'";
              break;
            case 'created_at':
              columnDef = 'TIMESTAMP DEFAULT NOW()';
              break;
            default:
              columnDef = 'TEXT';
          }
          
          try {
            await db.execute(sql.raw(`ALTER TABLE work_sessions ADD COLUMN ${col} ${columnDef}`));
            console.log(`✅ Added column: ${col}`);
          } catch (error: any) {
            // Ignore if column already exists
            if (!error.message.includes('already exists')) {
              console.error(`❌ Error adding column ${col}:`, error.message);
            }
          }
        }
      }
    }
    
    // Check if attendance_events table exists
    const eventsTableCheck = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'attendance_events'
    `);
    
    const eventsTableExists = Array.isArray(eventsTableCheck) && eventsTableCheck.length > 0;
    
    if (!eventsTableExists) {
      console.log('📋 Creating attendance_events table...');
      
      await db.execute(sql`
        CREATE TABLE attendance_events (
          id VARCHAR PRIMARY KEY,
          work_session_id VARCHAR NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
          event_type TEXT NOT NULL,
          timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          latitude TEXT,
          longitude TEXT,
          gps_accuracy INTEGER,
          job_id VARCHAR REFERENCES jobs(id),
          site_name TEXT,
          source TEXT NOT NULL DEFAULT 'worker',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      
      console.log('✅ attendance_events table created successfully');
    }
    
    // Ensure workers table has is_deleted column
    try {
      await db.execute(sql`
        ALTER TABLE workers ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false
      `);
    } catch (e: any) {
      if (!e?.message?.includes('already exists')) {
        console.warn('Note on workers.is_deleted column migration:', e?.message);
      }
    }

    // Fix live coordinates for Tester — 15 Gilbert Road, Belvedere, DA17 5DB
    try {
      await db.execute(sql`
        UPDATE site_checkin_config
           SET site_latitude = '51.491306',
               site_longitude = '0.148139',
               updated_at = NOW()
         WHERE (
           site_name ILIKE '%Gilbert Road%'
           OR site_name ILIKE '%DA17 5DB%'
           OR (site_latitude = '51.4851' AND site_longitude = '0.1540')
         )
      `);
      console.log('✅ Corrected live Gilbert Road coordinates in site_checkin_config to 51.491306, 0.148139');
    } catch (e: any) {
      console.warn('Note on Gilbert Road coordinate update:', e?.message);
    }
    
    console.log('✅ Database schema initialization complete');
    return true;
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    return false;
  }
}
