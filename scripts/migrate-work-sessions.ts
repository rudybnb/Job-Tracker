import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function migrateWorkSessions() {
  try {
    console.log('🔍 Checking work_sessions table schema...');
    
    // Check if work_sessions table exists
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'work_sessions'
    `;
    
    if (tables.length === 0) {
      console.log('📋 Creating work_sessions table...');
      await sql`
        CREATE TABLE work_sessions (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
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
      `;
      console.log('✅ work_sessions table created successfully');
    } else {
      console.log('✅ work_sessions table exists');
      
      // Get existing columns
      const columns = await sql`
        SELECT column_name 
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'work_sessions'
      `;
      
      const columnNames = columns.map(c => c.column_name);
      console.log('📊 Existing columns:', columnNames.join(', '));
      
      // Check and add missing columns
      const requiredColumns = [
        { name: 'id', type: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
        { name: 'contractor_name', type: 'TEXT NOT NULL' },
        { name: 'job_site_location', type: 'TEXT NOT NULL' },
        { name: 'start_time', type: 'TIMESTAMP NOT NULL' },
        { name: 'end_time', type: 'TIMESTAMP' },
        { name: 'total_hours', type: 'TEXT' },
        { name: 'start_latitude', type: 'TEXT' },
        { name: 'start_longitude', type: 'TEXT' },
        { name: 'end_latitude', type: 'TEXT' },
        { name: 'end_longitude', type: 'TEXT' },
        { name: 'status', type: 'TEXT DEFAULT \'active\'' },
        { name: 'created_at', type: 'TIMESTAMP DEFAULT NOW()' }
      ];
      
      for (const col of requiredColumns) {
        if (!columnNames.includes(col.name)) {
          console.log(`➕ Adding missing column: ${col.name}`);
          try {
            await sql.unsafe(`ALTER TABLE work_sessions ADD COLUMN ${col.name} ${col.type}`);
            console.log(`✅ Added column: ${col.name}`);
          } catch (error: any) {
            console.error(`❌ Error adding column ${col.name}:`, error.message);
          }
        }
      }
    }
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrateWorkSessions();
