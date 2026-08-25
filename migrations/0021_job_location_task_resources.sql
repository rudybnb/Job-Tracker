DO $migration$
BEGIN
  IF to_regclass('public.job_location_tasks') IS NOT NULL THEN
    EXECUTE $ddl$
      CREATE TABLE IF NOT EXISTS "job_location_task_resources" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "location_task_id" varchar NOT NULL REFERENCES "job_location_tasks"("id") ON DELETE CASCADE,
        "usage_description" text NOT NULL,
        "product_description" text NOT NULL,
        "quantity" text,
        "unit" text,
        "source_value_raw" text,
        "source_value_kind" text NOT NULL,
        "source_order" integer NOT NULL,
        "source_reference" text NOT NULL DEFAULT 'HBXL_WORD',
        CONSTRAINT "job_location_task_resources_value_kind_check"
          CHECK ("source_value_kind" IN ('quantity', 'currency_unclassified', 'blank')),
        CONSTRAINT "job_location_task_resources_source_order_check"
          CHECK ("source_order" > 0),
        CONSTRAINT "job_location_task_resources_quantity_check"
          CHECK (
            ("source_value_kind" = 'quantity' AND "quantity" IS NOT NULL AND "unit" IS NOT NULL)
            OR
            ("source_value_kind" <> 'quantity' AND "quantity" IS NULL AND "unit" IS NULL)
          ),
        CONSTRAINT "job_location_task_resources_source_reference_check"
          CHECK ("source_reference" = 'HBXL_WORD')
      )
    $ddl$;
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS "job_location_task_resources_task_order_unique" ON "job_location_task_resources" ("location_task_id", "source_order")';
  END IF;
END
$migration$;
