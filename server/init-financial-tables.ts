import { db } from "./db";
import { sql } from "drizzle-orm";

/**
 * Initialize financial tracking tables for Job-Tracker
 * Creates all tables needed for comprehensive budget tracking and financial management
 */
export async function initFinancialTables() {
  console.log('💰 Initializing financial tracking tables...');
  
  try {
    // Create clients table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        total_spent DECIMAL(12,2) DEFAULT 0,
        active_jobs INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ clients table created');
    
    // Drop and recreate jobs table to ensure correct schema
    await db.execute(sql`DROP TABLE IF EXISTS jobs CASCADE;`);
    console.log('🗑️  Dropped existing jobs table');
    
    // Create jobs table
    await db.execute(sql`
      CREATE TABLE jobs (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        job_name VARCHAR(255) NOT NULL,
        job_description TEXT,
        job_address TEXT,
        total_budget DECIMAL(12,2) NOT NULL,
        labour_budget DECIMAL(12,2) DEFAULT 0,
        material_budget DECIMAL(12,2) DEFAULT 0,
        plant_budget DECIMAL(12,2) DEFAULT 0,
        actual_labour_cost DECIMAL(12,2) DEFAULT 0,
        actual_material_cost DECIMAL(12,2) DEFAULT 0,
        actual_plant_cost DECIMAL(12,2) DEFAULT 0,
        total_actual_cost DECIMAL(12,2) DEFAULT 0,
        profit_loss DECIMAL(12,2) DEFAULT 0,
        profit_loss_percentage DECIMAL(5,2) DEFAULT 0,
        start_date DATE,
        estimated_end_date DATE,
        actual_end_date DATE,
        status VARCHAR(50) DEFAULT 'planned',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ jobs table created');
    
    // Create job_phases table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS job_phases (
        id SERIAL PRIMARY KEY,
        job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
        phase_name VARCHAR(255) NOT NULL,
        phase_order INTEGER NOT NULL,
        phase_budget DECIMAL(12,2) DEFAULT 0,
        labour_budget DECIMAL(12,2) DEFAULT 0,
        material_budget DECIMAL(12,2) DEFAULT 0,
        plant_budget DECIMAL(12,2) DEFAULT 0,
        actual_labour_cost DECIMAL(12,2) DEFAULT 0,
        actual_material_cost DECIMAL(12,2) DEFAULT 0,
        actual_plant_cost DECIMAL(12,2) DEFAULT 0,
        total_actual_cost DECIMAL(12,2) DEFAULT 0,
        start_date DATE,
        end_date DATE,
        status VARCHAR(50) DEFAULT 'not_started',
        completion_percentage INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ job_phases table created');
    
    // Create sub_phases table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sub_phases (
        id SERIAL PRIMARY KEY,
        phase_id INTEGER REFERENCES job_phases(id) ON DELETE CASCADE,
        sub_phase_name VARCHAR(255) NOT NULL,
        sub_phase_order INTEGER NOT NULL,
        sub_phase_budget DECIMAL(12,2) DEFAULT 0,
        labour_budget DECIMAL(12,2) DEFAULT 0,
        material_budget DECIMAL(12,2) DEFAULT 0,
        plant_budget DECIMAL(12,2) DEFAULT 0,
        actual_labour_cost DECIMAL(12,2) DEFAULT 0,
        actual_material_cost DECIMAL(12,2) DEFAULT 0,
        actual_plant_cost DECIMAL(12,2) DEFAULT 0,
        total_actual_cost DECIMAL(12,2) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'not_started',
        completion_percentage INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ sub_phases table created');
    
    // Create contractor_types table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contractor_types (
        id SERIAL PRIMARY KEY,
        type_name VARCHAR(50) UNIQUE NOT NULL,
        description TEXT
      );
    `);
    console.log('✅ contractor_types table created');
    
    // Insert default contractor types
    await db.execute(sql`
      INSERT INTO contractor_types (type_name, description) VALUES
        ('daily_rate', 'Contractors paid by hour/day worked'),
        ('price_job', 'Contractors paid per milestone/job completion')
      ON CONFLICT (type_name) DO NOTHING;
    `);
    console.log('✅ Default contractor types inserted');
    
    // Create contractors table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contractors (
        id SERIAL PRIMARY KEY,
        contractor_name VARCHAR(255) NOT NULL,
        contractor_type_id INTEGER REFERENCES contractor_types(id),
        email VARCHAR(255),
        phone VARCHAR(50),
        trade VARCHAR(100),
        hourly_rate DECIMAL(10,2),
        daily_rate DECIMAL(10,2),
        bank_details TEXT,
        is_active BOOLEAN DEFAULT true,
        total_earned DECIMAL(12,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ contractors table created');
    
    // Create phase_assignments table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS phase_assignments (
        id SERIAL PRIMARY KEY,
        phase_id INTEGER REFERENCES job_phases(id) ON DELETE CASCADE,
        sub_phase_id INTEGER REFERENCES sub_phases(id) ON DELETE CASCADE,
        contractor_id INTEGER REFERENCES contractors(id) ON DELETE CASCADE,
        agreed_price DECIMAL(12,2),
        payment_terms TEXT,
        materials_allocated TEXT,
        materials_cost DECIMAL(12,2) DEFAULT 0,
        assignment_status VARCHAR(50) DEFAULT 'assigned',
        assigned_date DATE DEFAULT CURRENT_DATE,
        completion_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ phase_assignments table created');
    
    // Create milestones table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS milestones (
        id SERIAL PRIMARY KEY,
        assignment_id INTEGER REFERENCES phase_assignments(id) ON DELETE CASCADE,
        milestone_name VARCHAR(255) NOT NULL,
        milestone_description TEXT,
        milestone_amount DECIMAL(12,2) NOT NULL,
        payment_status VARCHAR(50) DEFAULT 'pending',
        payment_date DATE,
        is_completed BOOLEAN DEFAULT false,
        completion_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ milestones table created');
    
    // Create expenses table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
        phase_id INTEGER REFERENCES job_phases(id) ON DELETE CASCADE,
        sub_phase_id INTEGER REFERENCES sub_phases(id) ON DELETE CASCADE,
        expense_type VARCHAR(50) NOT NULL,
        expense_category VARCHAR(100),
        description TEXT NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        quantity DECIMAL(10,2),
        unit_price DECIMAL(10,2),
        receipt_number VARCHAR(100),
        receipt_image_url TEXT,
        supplier_name VARCHAR(255),
        expense_date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ expenses table created');
    
    // Create contractor_payments table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contractor_payments (
        id SERIAL PRIMARY KEY,
        contractor_id INTEGER REFERENCES contractors(id) ON DELETE CASCADE,
        assignment_id INTEGER REFERENCES phase_assignments(id) ON DELETE CASCADE,
        milestone_id INTEGER REFERENCES milestones(id) ON DELETE SET NULL,
        payment_amount DECIMAL(12,2) NOT NULL,
        payment_method VARCHAR(50),
        payment_reference VARCHAR(100),
        period_start_date DATE,
        period_end_date DATE,
        hours_worked DECIMAL(10,2),
        days_worked DECIMAL(10,2),
        payment_status VARCHAR(50) DEFAULT 'pending',
        payment_date DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ contractor_payments table created');
    
    // Create work_hours table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS work_hours (
        id SERIAL PRIMARY KEY,
        contractor_id INTEGER REFERENCES contractors(id) ON DELETE CASCADE,
        assignment_id INTEGER REFERENCES phase_assignments(id) ON DELETE CASCADE,
        work_date DATE NOT NULL,
        clock_in_time TIME,
        clock_out_time TIME,
        total_hours DECIMAL(5,2),
        break_duration_minutes INTEGER DEFAULT 0,
        is_approved BOOLEAN DEFAULT false,
        approved_by VARCHAR(100),
        approved_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ work_hours table created');
    
    // Create materials_catalog table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS materials_catalog (
        id SERIAL PRIMARY KEY,
        material_name VARCHAR(255) NOT NULL,
        material_category VARCHAR(100),
        unit VARCHAR(50),
        standard_unit_price DECIMAL(10,2),
        supplier_name VARCHAR(255),
        supplier_contact TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ materials_catalog table created');
    
    // Create budget_alerts table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS budget_alerts (
        id SERIAL PRIMARY KEY,
        job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
        phase_id INTEGER REFERENCES job_phases(id) ON DELETE CASCADE,
        alert_type VARCHAR(50) NOT NULL,
        alert_message TEXT NOT NULL,
        severity VARCHAR(20) DEFAULT 'medium',
        is_resolved BOOLEAN DEFAULT false,
        resolved_at TIMESTAMP,
        resolved_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ budget_alerts table created');
    
    // Create indexes
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON jobs(client_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_job_phases_job_id ON job_phases(job_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_sub_phases_phase_id ON sub_phases(phase_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_expenses_job_id ON expenses(job_id);`);
    console.log('✅ Indexes created');
    
    console.log('💰 Financial tracking tables initialization complete!');
    
  } catch (error) {
    console.error('❌ Financial tables initialization error:', error);
    // Don't throw - allow server to continue
  }
}
