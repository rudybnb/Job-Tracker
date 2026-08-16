-- Phase 2C: immutable HBXL Smart Schedule project baseline resources.
-- Later source revisions create new imports and rows; they never replace prior baselines.

CREATE TABLE hbxl_resource_baseline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  source_import_id UUID NOT NULL REFERENCES project_source_import(id) ON DELETE RESTRICT,
  source_row_number INTEGER NOT NULL CHECK (source_row_number > 0),
  source_row_key TEXT,
  source_row_hash VARCHAR(64) NOT NULL CHECK (source_row_hash ~ '^[0-9a-f]{64}$'),
  hbxl_product_code TEXT,
  description TEXT NOT NULL,
  original_description TEXT,
  source_resource_type TEXT,
  resource_type TEXT NOT NULL
    CHECK (resource_type IN ('MATERIAL', 'LABOUR', 'PLANT', 'OTHER')),
  quantity NUMERIC(18,6) NOT NULL,
  canonical_unit_code TEXT,
  original_unit_text TEXT,
  baseline_unit_rate NUMERIC(18,6),
  baseline_value NUMERIC(18,2),
  currency_code VARCHAR(3) DEFAULT 'GBP'
    CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'),
  build_phase TEXT,
  supplier TEXT,
  order_date DATE,
  required_date DATE,
  source_metadata JSONB,
  review_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE'
    CHECK (review_status IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')),
  reason_code TEXT,
  review_reason TEXT,
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hbxl_resource_baseline_source_row_unique
    UNIQUE (source_import_id, source_row_number),
  CONSTRAINT hbxl_resource_baseline_confirmation_guard
    CHECK (review_status <> 'USER_CONFIRMED' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX hbxl_resource_baseline_job_import_idx
  ON hbxl_resource_baseline (job_id, source_import_id);
--> statement-breakpoint
CREATE INDEX hbxl_resource_baseline_phase_type_idx
  ON hbxl_resource_baseline (job_id, build_phase, resource_type);
--> statement-breakpoint
CREATE INDEX hbxl_resource_baseline_product_code_idx
  ON hbxl_resource_baseline (hbxl_product_code);
--> statement-breakpoint
CREATE INDEX hbxl_resource_baseline_required_date_idx
  ON hbxl_resource_baseline (required_date);
--> statement-breakpoint
CREATE INDEX hbxl_resource_baseline_order_date_idx
  ON hbxl_resource_baseline (order_date);
--> statement-breakpoint
CREATE FUNCTION prevent_hbxl_resource_baseline_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'hbxl_resource_baseline rows are immutable';
  END IF;

  IF NEW.job_id IS DISTINCT FROM OLD.job_id
    OR NEW.source_import_id IS DISTINCT FROM OLD.source_import_id
    OR NEW.source_row_number IS DISTINCT FROM OLD.source_row_number
    OR NEW.source_row_key IS DISTINCT FROM OLD.source_row_key
    OR NEW.source_row_hash IS DISTINCT FROM OLD.source_row_hash
    OR NEW.hbxl_product_code IS DISTINCT FROM OLD.hbxl_product_code
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.original_description IS DISTINCT FROM OLD.original_description
    OR NEW.source_resource_type IS DISTINCT FROM OLD.source_resource_type
    OR NEW.resource_type IS DISTINCT FROM OLD.resource_type
    OR NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.canonical_unit_code IS DISTINCT FROM OLD.canonical_unit_code
    OR NEW.original_unit_text IS DISTINCT FROM OLD.original_unit_text
    OR NEW.baseline_unit_rate IS DISTINCT FROM OLD.baseline_unit_rate
    OR NEW.baseline_value IS DISTINCT FROM OLD.baseline_value
    OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
    OR NEW.build_phase IS DISTINCT FROM OLD.build_phase
    OR NEW.supplier IS DISTINCT FROM OLD.supplier
    OR NEW.order_date IS DISTINCT FROM OLD.order_date
    OR NEW.required_date IS DISTINCT FROM OLD.required_date
    OR NEW.source_metadata IS DISTINCT FROM OLD.source_metadata
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'hbxl_resource_baseline source and commercial fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER hbxl_resource_baseline_values_immutable
BEFORE UPDATE OR DELETE ON hbxl_resource_baseline
FOR EACH ROW
EXECUTE FUNCTION prevent_hbxl_resource_baseline_mutation();
