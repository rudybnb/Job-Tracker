DO $migration$
BEGIN
  IF to_regclass('public.jobs') IS NOT NULL AND to_regclass('public.job_location_tasks') IS NOT NULL THEN
    EXECUTE $ddl$
      CREATE TABLE IF NOT EXISTS "job_location_task_material_confirmations" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "job_id" varchar NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE,
        "location_task_id" varchar NOT NULL REFERENCES "job_location_tasks"("id") ON DELETE CASCADE,
        "material_key" text NOT NULL,
        "material_description" text NOT NULL,
        "confirmed_quantity" numeric(14,4) NOT NULL,
        "unit" text NOT NULL,
        "confirmed_by" text,
        "confirmed_at" timestamptz NOT NULL DEFAULT now(),
        "notes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "job_loc_task_mat_conf_qty_check"
          CHECK ("confirmed_quantity" > 0)
      )
    $ddl$;
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS "job_loc_task_mat_conf_task_mat_unique" ON "job_location_task_material_confirmations" ("location_task_id", "material_key")';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "job_loc_task_mat_conf_job_idx" ON "job_location_task_material_confirmations" ("job_id")';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "job_loc_task_mat_conf_job_mat_idx" ON "job_location_task_material_confirmations" ("job_id", "material_key")';
  END IF;
END
$migration$;
