export type SqlExecutor = (query: string, params?: unknown[]) => Promise<unknown>;

export function jobLocationTableStatements(): ReadonlyArray<string> {
  return [
    `CREATE TABLE IF NOT EXISTS job_locations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT,
  source TEXT NOT NULL DEFAULT 'HBXL_WORD',
  review_status TEXT NOT NULL DEFAULT 'CONFIRMED',
  review_reason TEXT,
  suggested_mapping TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);`,
    `CREATE INDEX IF NOT EXISTS idx_job_locations_job_id ON job_locations (job_id);`,
    `CREATE INDEX IF NOT EXISTS idx_job_locations_review_status ON job_locations (review_status);`,

    `CREATE TABLE IF NOT EXISTS job_location_tasks (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  location_id VARCHAR NOT NULL REFERENCES job_locations(id) ON DELETE CASCADE,
  work_category TEXT NOT NULL,
  task_name TEXT NOT NULL,
  task_description TEXT,
  source_reference TEXT DEFAULT 'HBXL_WORD',
  hbxl_build_phase TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_contractor_id VARCHAR REFERENCES contractors(id),
  assigned_contractor_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);`,
    `CREATE INDEX IF NOT EXISTS idx_job_location_tasks_job_id ON job_location_tasks (job_id);`,
    `CREATE INDEX IF NOT EXISTS idx_job_location_tasks_location_id ON job_location_tasks (location_id);`,
    `CREATE INDEX IF NOT EXISTS idx_job_location_tasks_status ON job_location_tasks (status);`,

    `CREATE TABLE IF NOT EXISTS job_location_task_resources (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  location_task_id VARCHAR NOT NULL REFERENCES job_location_tasks(id) ON DELETE CASCADE,
  usage_description TEXT NOT NULL,
  product_description TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  source_value_raw TEXT,
  source_value_kind TEXT NOT NULL,
  source_order INTEGER NOT NULL,
  source_reference TEXT NOT NULL DEFAULT 'HBXL_WORD',
  CONSTRAINT job_location_task_resources_value_kind_check
    CHECK (source_value_kind IN ('quantity', 'currency_unclassified', 'blank')),
  CONSTRAINT job_location_task_resources_source_order_check CHECK (source_order > 0),
  CONSTRAINT job_location_task_resources_quantity_check
    CHECK (
      (source_value_kind = 'quantity' AND quantity IS NOT NULL AND unit IS NOT NULL)
      OR
      (source_value_kind <> 'quantity' AND quantity IS NULL AND unit IS NULL)
    ),
  CONSTRAINT job_location_task_resources_source_reference_check CHECK (source_reference = 'HBXL_WORD')
);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS job_location_task_resources_task_order_unique ON job_location_task_resources (location_task_id, source_order);`,

    // Additive columns for job_assignments if not already present
    `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS location_id TEXT;`,
    `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS location_name TEXT;`,
    `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS location_task_id TEXT;`,
    `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS work_category TEXT;`,
    `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS task_name TEXT;`,
  ];
}

export async function ensureJobLocationTables(executor: SqlExecutor): Promise<void> {
  for (const statement of jobLocationTableStatements()) {
    try {
      await executor(statement);
    } catch (error) {
      console.warn(`[DDL] Table setup note: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
