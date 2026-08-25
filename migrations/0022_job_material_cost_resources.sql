DO $migration$
BEGIN
  IF to_regclass('public.jobs') IS NOT NULL THEN
    EXECUTE $ddl$
      CREATE TABLE IF NOT EXISTS "job_material_cost_resources" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "job_id" varchar NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE,
        "source_import_id" uuid REFERENCES "project_source_import"("id") ON DELETE SET NULL,
        "build_phase" text NOT NULL,
        "description" text NOT NULL,
        "unit_rate" text NOT NULL,
        "unit" text NOT NULL,
        "qty_excluding_wastage" text NOT NULL,
        "wastage_qty" text NOT NULL,
        "order_qty_including_wastage" text NOT NULL,
        "cost_excluding_wastage" text NOT NULL,
        "wastage_cost" text NOT NULL,
        "total_cost_including_wastage" text NOT NULL,
        "source_row_order" integer NOT NULL,
        "material_row_kind" text NOT NULL DEFAULT 'PHYSICAL_PRODUCT',
        CONSTRAINT "job_material_cost_resources_kind_check"
          CHECK ("material_row_kind" IN ('PHYSICAL_PRODUCT', 'BROAD_ALLOWANCE')),
        CONSTRAINT "job_material_cost_resources_row_order_check"
          CHECK ("source_row_order" > 0)
      )
    $ddl$;
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS "job_material_cost_resources_job_order_unique" ON "job_material_cost_resources" ("job_id", "source_row_order")';
  END IF;
END
$migration$;
