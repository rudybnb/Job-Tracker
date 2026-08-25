DO $migration$
BEGIN
  IF to_regclass('public.jobs') IS NOT NULL AND to_regclass('public.job_material_cost_resources') IS NOT NULL THEN
    EXECUTE $ddl$
      CREATE TABLE IF NOT EXISTS "job_material_cost_actuals" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "job_id" varchar NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE,
        "budget_resource_id" varchar REFERENCES "job_material_cost_resources"("id") ON DELETE SET NULL,
        "material_key" text NOT NULL,
        "material_description" text NOT NULL,
        "supplier_name" text,
        "supplier_unit_price" numeric(12,2) NOT NULL,
        "actual_quantity" numeric(14,4) NOT NULL,
        "actual_total" numeric(14,2) NOT NULL,
        "purchase_date" date,
        "payment_status" text NOT NULL DEFAULT 'UNPAID',
        "notes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "job_material_cost_actuals_unit_price_check"
          CHECK ("supplier_unit_price" >= 0),
        CONSTRAINT "job_material_cost_actuals_quantity_check"
          CHECK ("actual_quantity" > 0),
        CONSTRAINT "job_material_cost_actuals_total_check"
          CHECK ("actual_total" >= 0),
        CONSTRAINT "job_material_cost_actuals_payment_status_check"
          CHECK ("payment_status" IN ('UNPAID', 'PAID', 'PARTIALLY_PAID', 'CANCELLED'))
      )
    $ddl$;
    EXECUTE 'CREATE INDEX IF NOT EXISTS "job_material_cost_actuals_job_idx" ON "job_material_cost_actuals" ("job_id")';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "job_material_cost_actuals_job_material_key_idx" ON "job_material_cost_actuals" ("job_id", "material_key")';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "job_material_cost_actuals_budget_resource_idx" ON "job_material_cost_actuals" ("budget_resource_id")';
  END IF;
END
$migration$;
