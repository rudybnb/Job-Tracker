-- Phase 2M / F1: procurement requirements and supplier quote evidence only.
-- HBXL baseline facts remain immutable; purchase orders, deliveries, invoices, and actual costs are deferred.

CREATE TABLE procurement_requirement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  hbxl_resource_baseline_id UUID REFERENCES hbxl_resource_baseline(id) ON DELETE RESTRICT,
  measurable_work_item_id UUID REFERENCES measurable_work_item(id) ON DELETE RESTRICT,
  work_area_id UUID REFERENCES work_area(id) ON DELETE RESTRICT,
  requirement_code TEXT,
  description TEXT NOT NULL,
  resource_code TEXT,
  resource_type TEXT NOT NULL,
  required_quantity NUMERIC(18,6) NOT NULL,
  unit_code TEXT NOT NULL,
  original_unit_text TEXT,
  quantity_source TEXT NOT NULL DEFAULT 'UNKNOWN',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  required_date DATE,
  preferred_supplier TEXT,
  notes TEXT,
  review_metadata JSONB,
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT procurement_requirement_code_unique UNIQUE (job_id, requirement_code),
  CONSTRAINT procurement_requirement_resource_type_check
    CHECK (resource_type IN ('MATERIAL', 'LABOUR', 'PLANT', 'OTHER')),
  CONSTRAINT procurement_requirement_quantity_nonnegative CHECK (required_quantity >= 0),
  CONSTRAINT procurement_requirement_quantity_source_check
    CHECK (quantity_source IN ('HBXL_BASELINE', 'DRAWING', 'USER_CONFIRMED', 'DERIVED', 'REVISION', 'UNKNOWN')),
  CONSTRAINT procurement_requirement_status_check
    CHECK (status IN ('DRAFT', 'REVIEW_REQUIRED', 'APPROVED_TO_BUY', 'PART_ORDERED', 'FULLY_ORDERED', 'CANCELLED')),
  CONSTRAINT procurement_requirement_hbxl_source_guard
    CHECK (quantity_source <> 'HBXL_BASELINE' OR hbxl_resource_baseline_id IS NOT NULL),
  CONSTRAINT procurement_requirement_nonmaterial_approval_guard
    CHECK (status <> 'APPROVED_TO_BUY' OR resource_type = 'MATERIAL' OR COALESCE((review_metadata ->> 'non_material_approved')::boolean, false))
);
--> statement-breakpoint
CREATE INDEX procurement_requirement_job_status_idx
  ON procurement_requirement (job_id, status, required_date);
--> statement-breakpoint
CREATE INDEX procurement_requirement_hbxl_idx
  ON procurement_requirement (hbxl_resource_baseline_id);
--> statement-breakpoint
CREATE INDEX procurement_requirement_work_item_idx
  ON procurement_requirement (measurable_work_item_id);
--> statement-breakpoint
CREATE INDEX procurement_requirement_work_area_idx
  ON procurement_requirement (work_area_id);
--> statement-breakpoint
CREATE TABLE supplier_quote (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  supersedes_supplier_quote_id UUID REFERENCES supplier_quote(id) ON DELETE RESTRICT,
  supplier_name TEXT NOT NULL,
  supplier_identity TEXT,
  quote_reference TEXT,
  revision_number INTEGER NOT NULL DEFAULT 1,
  quote_date DATE NOT NULL,
  valid_until DATE,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'GBP',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  notes TEXT,
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT supplier_quote_revision_positive CHECK (revision_number > 0),
  CONSTRAINT supplier_quote_validity_guard CHECK (valid_until IS NULL OR valid_until >= quote_date),
  CONSTRAINT supplier_quote_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT supplier_quote_status_check
    CHECK (status IN ('DRAFT', 'RECEIVED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'EXPIRED')),
  CONSTRAINT supplier_quote_supersedes_other CHECK (supersedes_supplier_quote_id IS NULL OR supersedes_supplier_quote_id <> id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX supplier_quote_reference_revision_unique
  ON supplier_quote (job_id, supplier_name, quote_reference, revision_number)
  WHERE quote_reference IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX supplier_quote_supersedes_unique
  ON supplier_quote (supersedes_supplier_quote_id)
  WHERE supersedes_supplier_quote_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX supplier_quote_job_supplier_idx
  ON supplier_quote (job_id, supplier_name, quote_date);
--> statement-breakpoint
CREATE INDEX supplier_quote_status_validity_idx
  ON supplier_quote (status, valid_until);
--> statement-breakpoint
CREATE FUNCTION validate_supplier_quote_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  prior supplier_quote%ROWTYPE;
BEGIN
  IF NEW.supersedes_supplier_quote_id IS NOT NULL THEN
    SELECT * INTO prior FROM supplier_quote WHERE id = NEW.supersedes_supplier_quote_id;
    IF NOT FOUND
      OR prior.job_id <> NEW.job_id
      OR prior.supplier_name <> NEW.supplier_name
      OR prior.supplier_identity IS DISTINCT FROM NEW.supplier_identity
      OR NEW.revision_number <= prior.revision_number
    THEN
      RAISE EXCEPTION 'supplier quote revision must supersede an earlier quote for the same job and supplier';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER supplier_quote_revision_validate
BEFORE INSERT ON supplier_quote
FOR EACH ROW
EXECUTE FUNCTION validate_supplier_quote_revision();
--> statement-breakpoint
CREATE TABLE supplier_quote_line (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_quote_id UUID NOT NULL REFERENCES supplier_quote(id) ON DELETE RESTRICT,
  procurement_requirement_id UUID REFERENCES procurement_requirement(id) ON DELETE RESTRICT,
  line_number INTEGER NOT NULL,
  supplier_product_code TEXT,
  supplier_description TEXT NOT NULL,
  quoted_quantity NUMERIC(18,6) NOT NULL,
  unit_code TEXT NOT NULL,
  unit_price NUMERIC(18,6) NOT NULL,
  line_value NUMERIC(18,2) NOT NULL,
  currency_code VARCHAR(3) NOT NULL,
  lead_time_days INTEGER,
  availability_status TEXT,
  notes TEXT,
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT supplier_quote_line_number_unique UNIQUE (supplier_quote_id, line_number),
  CONSTRAINT supplier_quote_line_number_positive CHECK (line_number > 0),
  CONSTRAINT supplier_quote_line_quantity_nonnegative CHECK (quoted_quantity >= 0),
  CONSTRAINT supplier_quote_line_unit_price_nonnegative CHECK (unit_price >= 0),
  CONSTRAINT supplier_quote_line_value_reconciles CHECK (line_value = round(quoted_quantity * unit_price, 2)),
  CONSTRAINT supplier_quote_line_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT supplier_quote_line_lead_time_nonnegative CHECK (lead_time_days IS NULL OR lead_time_days >= 0)
);
--> statement-breakpoint
CREATE INDEX supplier_quote_line_quote_idx
  ON supplier_quote_line (supplier_quote_id);
--> statement-breakpoint
CREATE INDEX supplier_quote_line_requirement_idx
  ON supplier_quote_line (procurement_requirement_id);
--> statement-breakpoint
CREATE FUNCTION validate_supplier_quote_line()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  quote supplier_quote%ROWTYPE;
  requirement_job_id VARCHAR;
BEGIN
  SELECT * INTO quote FROM supplier_quote WHERE id = NEW.supplier_quote_id;
  IF NOT FOUND OR quote.currency_code <> NEW.currency_code THEN
    RAISE EXCEPTION 'supplier quote line must match its quote currency';
  END IF;
  IF quote.status = 'ACCEPTED' THEN
    RAISE EXCEPTION 'lines cannot be added to an accepted supplier quote';
  END IF;
  IF NEW.procurement_requirement_id IS NOT NULL THEN
    SELECT job_id INTO requirement_job_id
      FROM procurement_requirement
      WHERE id = NEW.procurement_requirement_id;
    IF NOT FOUND OR requirement_job_id <> quote.job_id THEN
      RAISE EXCEPTION 'supplier quote line requirement must belong to the quote job';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER supplier_quote_line_validate_insert
BEFORE INSERT ON supplier_quote_line
FOR EACH ROW
EXECUTE FUNCTION validate_supplier_quote_line();
--> statement-breakpoint
CREATE FUNCTION protect_supplier_quote_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'supplier_quote_line' THEN
    RAISE EXCEPTION 'supplier quote lines are immutable evidence; record a new quote revision';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'supplier quote history cannot be deleted';
  END IF;
  IF OLD.status = 'ACCEPTED' THEN
    RAISE EXCEPTION 'accepted supplier quote evidence is immutable';
  END IF;
  IF NEW.job_id IS DISTINCT FROM OLD.job_id
    OR NEW.supersedes_supplier_quote_id IS DISTINCT FROM OLD.supersedes_supplier_quote_id
    OR NEW.supplier_name IS DISTINCT FROM OLD.supplier_name
    OR NEW.supplier_identity IS DISTINCT FROM OLD.supplier_identity
    OR NEW.quote_reference IS DISTINCT FROM OLD.quote_reference
    OR NEW.revision_number IS DISTINCT FROM OLD.revision_number
    OR NEW.quote_date IS DISTINCT FROM OLD.quote_date
    OR NEW.valid_until IS DISTINCT FROM OLD.valid_until
    OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
    OR NEW.source_metadata IS DISTINCT FROM OLD.source_metadata
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'supplier quote commercial evidence is immutable; record a new quote revision';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER supplier_quote_history_guard
BEFORE UPDATE OR DELETE ON supplier_quote
FOR EACH ROW
EXECUTE FUNCTION protect_supplier_quote_evidence();
--> statement-breakpoint
CREATE TRIGGER supplier_quote_line_immutable
BEFORE UPDATE OR DELETE ON supplier_quote_line
FOR EACH ROW
EXECUTE FUNCTION protect_supplier_quote_evidence();
