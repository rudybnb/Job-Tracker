DO $migration$
BEGIN
  IF to_regclass('public.jobs') IS NOT NULL AND to_regclass('public.job_material_cost_resources') IS NOT NULL THEN
    EXECUTE $ddl$
      CREATE TABLE IF NOT EXISTS "job_material_cost_actuals" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "job_id" varchar NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE,
        "resource_id" varchar NOT NULL REFERENCES "job_material_cost_resources"("id") ON DELETE CASCADE,
        "supplier_name" text,
        "supplier_unit_price" text,
        "actual_quantity" text,
        "actual_total" text,
        "notes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    $ddl$;
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS "job_material_cost_actuals_job_resource_unique" ON "job_material_cost_actuals" ("job_id", "resource_id")';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "job_material_cost_actuals_job_idx" ON "job_material_cost_actuals" ("job_id")';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "job_material_cost_actuals_resource_idx" ON "job_material_cost_actuals" ("resource_id")';
  END IF;
END
$migration$;
