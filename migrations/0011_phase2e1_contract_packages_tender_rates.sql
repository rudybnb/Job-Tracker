-- Phase 2E1: measurable-work contract packages and locked contractor tender rates.
-- Legacy assignments remain untouched and HBXL baseline pricing remains separate.

CREATE TABLE contract_package (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  contractor_id VARCHAR NOT NULL REFERENCES contractors(id) ON DELETE RESTRICT,
  package_code TEXT,
  package_name TEXT NOT NULL,
  trade_code TEXT,
  trade_name TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'TENDERING', 'ACCEPTED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
  tendered_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  start_date DATE,
  end_date DATE,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'GBP'
    CHECK (currency_code ~ '^[A-Z]{3}$'),
  package_notes TEXT,
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contract_package_date_order_guard
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
  CONSTRAINT contract_package_tendered_guard
    CHECK (status NOT IN ('TENDERING', 'ACCEPTED', 'ACTIVE', 'COMPLETED') OR tendered_at IS NOT NULL),
  CONSTRAINT contract_package_accepted_guard
    CHECK (status NOT IN ('ACCEPTED', 'ACTIVE', 'COMPLETED') OR accepted_at IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX contract_package_job_status_idx
  ON contract_package (job_id, status);
--> statement-breakpoint
CREATE INDEX contract_package_contractor_status_idx
  ON contract_package (contractor_id, status);
--> statement-breakpoint
CREATE INDEX contract_package_job_trade_idx
  ON contract_package (job_id, trade_code, trade_name);
--> statement-breakpoint
CREATE INDEX contract_package_job_code_idx
  ON contract_package (job_id, package_code);
--> statement-breakpoint
CREATE TABLE contractor_tender_rate (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_package_id UUID NOT NULL REFERENCES contract_package(id) ON DELETE RESTRICT,
  tender_item_code TEXT NOT NULL,
  description TEXT NOT NULL,
  agreed_quantity NUMERIC(18,6) NOT NULL CHECK (agreed_quantity >= 0),
  unit_code TEXT NOT NULL,
  original_unit_text TEXT,
  locked_unit_rate NUMERIC(18,6) NOT NULL CHECK (locked_unit_rate >= 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'GBP'
    CHECK (currency_code ~ '^[A-Z]{3}$'),
  locked_contract_value NUMERIC(18,2) NOT NULL CHECK (locked_contract_value >= 0),
  tender_revision_number INTEGER NOT NULL CHECK (tender_revision_number > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'LOCKED', 'SUPERSEDED', 'REJECTED', 'WITHDRAWN')),
  accepted_at TIMESTAMPTZ,
  accepted_by TEXT,
  source TEXT,
  notes TEXT,
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contractor_tender_rate_revision_unique
    UNIQUE (contract_package_id, tender_item_code, tender_revision_number),
  CONSTRAINT contractor_tender_rate_value_reconciles
    CHECK (locked_contract_value = round(agreed_quantity * locked_unit_rate, 2)),
  CONSTRAINT contractor_tender_rate_acceptance_guard
    CHECK (status NOT IN ('ACCEPTED', 'LOCKED', 'SUPERSEDED') OR (accepted_at IS NOT NULL AND accepted_by IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX contractor_tender_rate_current_accepted_unique
  ON contractor_tender_rate (contract_package_id, tender_item_code)
  WHERE status IN ('ACCEPTED', 'LOCKED');
--> statement-breakpoint
CREATE INDEX contractor_tender_rate_package_status_idx
  ON contractor_tender_rate (contract_package_id, status);
--> statement-breakpoint
CREATE INDEX contractor_tender_rate_package_item_idx
  ON contractor_tender_rate (contract_package_id, tender_item_code);
--> statement-breakpoint
CREATE INDEX contractor_tender_rate_review_idx
  ON contractor_tender_rate (status, accepted_at);
--> statement-breakpoint
CREATE FUNCTION protect_accepted_contractor_tender_rate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('ACCEPTED', 'LOCKED', 'SUPERSEDED') THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'accepted contractor tender rates cannot be deleted';
    END IF;

    IF NEW.contract_package_id IS DISTINCT FROM OLD.contract_package_id
      OR NEW.tender_item_code IS DISTINCT FROM OLD.tender_item_code
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.agreed_quantity IS DISTINCT FROM OLD.agreed_quantity
      OR NEW.unit_code IS DISTINCT FROM OLD.unit_code
      OR NEW.original_unit_text IS DISTINCT FROM OLD.original_unit_text
      OR NEW.locked_unit_rate IS DISTINCT FROM OLD.locked_unit_rate
      OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
      OR NEW.locked_contract_value IS DISTINCT FROM OLD.locked_contract_value
      OR NEW.tender_revision_number IS DISTINCT FROM OLD.tender_revision_number
      OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
      OR NEW.accepted_by IS DISTINCT FROM OLD.accepted_by
      OR NEW.source IS DISTINCT FROM OLD.source
      OR NEW.source_metadata IS DISTINCT FROM OLD.source_metadata
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'accepted contractor tender rate fields are immutable';
    END IF;

    IF OLD.status = 'ACCEPTED' AND NEW.status NOT IN ('ACCEPTED', 'LOCKED', 'SUPERSEDED')
      OR OLD.status = 'LOCKED' AND NEW.status NOT IN ('LOCKED', 'SUPERSEDED')
      OR OLD.status = 'SUPERSEDED' AND NEW.status <> 'SUPERSEDED'
    THEN
      RAISE EXCEPTION 'accepted contractor tender rate cannot be unlocked';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER contractor_tender_rate_locked_values_immutable
BEFORE UPDATE OR DELETE ON contractor_tender_rate
FOR EACH ROW
EXECUTE FUNCTION protect_accepted_contractor_tender_rate();
--> statement-breakpoint
CREATE TABLE contractor_tender_rate_work_item_link (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_tender_rate_id UUID NOT NULL REFERENCES contractor_tender_rate(id) ON DELETE RESTRICT,
  measurable_work_item_id UUID NOT NULL REFERENCES measurable_work_item(id) ON DELETE RESTRICT,
  allocated_quantity NUMERIC(18,6)
    CHECK (allocated_quantity IS NULL OR allocated_quantity >= 0),
  allocation_status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED'
    CHECK (allocation_status IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')),
  confidence TEXT,
  confidence_metadata JSONB,
  reason_code TEXT,
  review_reason TEXT,
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  source TEXT,
  notes TEXT,
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contractor_tender_rate_work_item_link_unique
    UNIQUE (contractor_tender_rate_id, measurable_work_item_id),
  CONSTRAINT contractor_tender_rate_work_item_link_confirmation_guard
    CHECK (allocation_status <> 'USER_CONFIRMED' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX contractor_tender_rate_work_item_link_rate_idx
  ON contractor_tender_rate_work_item_link (contractor_tender_rate_id);
--> statement-breakpoint
CREATE INDEX contractor_tender_rate_work_item_link_item_idx
  ON contractor_tender_rate_work_item_link (measurable_work_item_id);
--> statement-breakpoint
CREATE INDEX contractor_tender_rate_work_item_link_review_idx
  ON contractor_tender_rate_work_item_link (allocation_status);
