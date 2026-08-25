DO $migration$
BEGIN
  IF to_regclass('public.jobs') IS NOT NULL THEN
    -- Extend project_source_import.source_type CHECK to accept HBXL_MATERIALS_USED.
    -- The constraint lives in the original CREATE TABLE (migration 0007). We must
    -- drop and recreate it here. This is additive-only: all previously valid values
    -- remain valid.
    IF to_regclass('public.project_source_import') IS NOT NULL THEN
      EXECUTE $ddl$
        ALTER TABLE "project_source_import"
          DROP CONSTRAINT IF EXISTS "project_source_import_source_type_check"
      $ddl$;
      EXECUTE $ddl$
        ALTER TABLE "project_source_import"
          ADD CONSTRAINT "project_source_import_source_type_check"
          CHECK (source_type IN (
            'DXF', 'PLANSEXPRESS_PXD', 'SMART_SCHEDULE_CSV',
            'PDF', 'IFC', 'OTHER', 'HBXL_MATERIALS_USED'
          ))
      $ddl$;
    END IF;

    -- Create job_material_cost_resources.
    -- source_import_id is NOT NULL: every row inserted by the import endpoint must
    -- have an auditable project_source_import lineage record. ON DELETE RESTRICT
    -- prevents orphaned lineage records from being silently removed.
    EXECUTE $ddl$
      CREATE TABLE IF NOT EXISTS "job_material_cost_resources" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "job_id" varchar NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE,
        "source_import_id" uuid NOT NULL REFERENCES "project_source_import"("id") ON DELETE RESTRICT,
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
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS "job_material_cost_resources_import_order_unique" ON "job_material_cost_resources" ("source_import_id", "source_row_order")';
  END IF;
END
$migration$;
