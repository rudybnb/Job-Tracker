-- Phase 2E2B: approved measurable-work valuation only.
-- Existing contractor_payments remains untouched pending legacy schema/API reconciliation.

CREATE TABLE contractor_valuation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  contract_package_id UUID NOT NULL REFERENCES contract_package(id) ON DELETE RESTRICT,
  contractor_id VARCHAR NOT NULL REFERENCES contractors(id) ON DELETE RESTRICT,
  valuation_number TEXT NOT NULL,
  valuation_sequence INTEGER NOT NULL CHECK (valuation_sequence > 0),
  valuation_period_start DATE,
  valuation_period_end DATE,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'CALCULATED', 'APPROVED', 'SUPERSEDED', 'CANCELLED')),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'GBP'
    CHECK (currency_code ~ '^[A-Z]{3}$'),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  supersedes_valuation_id UUID REFERENCES contractor_valuation(id) ON DELETE RESTRICT,
  notes TEXT,
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contractor_valuation_number_unique UNIQUE (contract_package_id, valuation_number),
  CONSTRAINT contractor_valuation_sequence_unique UNIQUE (contract_package_id, valuation_sequence),
  CONSTRAINT contractor_valuation_period_guard
    CHECK (valuation_period_start IS NULL OR valuation_period_end IS NULL OR valuation_period_end >= valuation_period_start),
  CONSTRAINT contractor_valuation_approval_guard
    CHECK (status NOT IN ('APPROVED', 'SUPERSEDED') OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)),
  CONSTRAINT contractor_valuation_supersedes_other
    CHECK (supersedes_valuation_id IS NULL OR supersedes_valuation_id <> id)
);
--> statement-breakpoint
CREATE INDEX contractor_valuation_job_status_idx
  ON contractor_valuation (job_id, status);
--> statement-breakpoint
CREATE INDEX contractor_valuation_package_status_idx
  ON contractor_valuation (contract_package_id, status);
--> statement-breakpoint
CREATE INDEX contractor_valuation_contractor_idx
  ON contractor_valuation (contractor_id, approved_at);
--> statement-breakpoint
CREATE UNIQUE INDEX contractor_valuation_supersedes_unique
  ON contractor_valuation (supersedes_valuation_id)
  WHERE supersedes_valuation_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE contractor_valuation_line (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_valuation_id UUID NOT NULL REFERENCES contractor_valuation(id) ON DELETE RESTRICT,
  measurable_work_item_id UUID NOT NULL REFERENCES measurable_work_item(id) ON DELETE RESTRICT,
  contractor_tender_rate_id UUID NOT NULL REFERENCES contractor_tender_rate(id) ON DELETE RESTRICT,
  tender_rate_work_item_link_id UUID NOT NULL REFERENCES contractor_tender_rate_work_item_link(id) ON DELETE RESTRICT,
  approved_quantity NUMERIC(18,6) NOT NULL CHECK (approved_quantity >= 0),
  previously_valued_quantity NUMERIC(18,6) NOT NULL CHECK (previously_valued_quantity >= 0),
  current_valuation_quantity NUMERIC(18,6) NOT NULL CHECK (current_valuation_quantity > 0),
  current_value NUMERIC(18,2) NOT NULL CHECK (current_value >= 0),
  currency_code VARCHAR(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  approval_snapshot JSONB NOT NULL,
  calculation_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contractor_valuation_line_allocation_unique
    UNIQUE (contractor_valuation_id, tender_rate_work_item_link_id),
  CONSTRAINT contractor_valuation_line_quantity_reconciles
    CHECK (current_valuation_quantity = approved_quantity - previously_valued_quantity)
);
--> statement-breakpoint
CREATE INDEX contractor_valuation_line_valuation_idx
  ON contractor_valuation_line (contractor_valuation_id);
--> statement-breakpoint
CREATE INDEX contractor_valuation_line_work_item_idx
  ON contractor_valuation_line (measurable_work_item_id);
--> statement-breakpoint
CREATE INDEX contractor_valuation_line_tender_rate_idx
  ON contractor_valuation_line (contractor_tender_rate_id);
--> statement-breakpoint
CREATE INDEX contractor_valuation_line_allocation_idx
  ON contractor_valuation_line (tender_rate_work_item_link_id);
--> statement-breakpoint
CREATE FUNCTION calculate_contractor_valuation_line()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  valuation contractor_valuation%ROWTYPE;
  allocation contractor_tender_rate_work_item_link%ROWTYPE;
  tender contractor_tender_rate%ROWTYPE;
  package contract_package%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'valuation lines require a SERIALIZABLE transaction with retry on serialization failure';
  END IF;

  SELECT * INTO valuation FROM contractor_valuation WHERE id = NEW.contractor_valuation_id FOR UPDATE;
  IF NOT FOUND OR valuation.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'valuation lines can only be added to a draft valuation';
  END IF;
  SELECT * INTO allocation FROM contractor_tender_rate_work_item_link WHERE id = NEW.tender_rate_work_item_link_id FOR UPDATE;
  IF NOT FOUND OR allocation.allocated_quantity IS NULL THEN
    RAISE EXCEPTION 'valuation requires a known tender work-item allocation';
  END IF;
  SELECT * INTO tender FROM contractor_tender_rate WHERE id = NEW.contractor_tender_rate_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'valuation tender rate does not exist';
  END IF;
  SELECT * INTO package FROM contract_package WHERE id = valuation.contract_package_id;
  IF NOT FOUND
    OR allocation.contractor_tender_rate_id <> tender.id
    OR allocation.measurable_work_item_id <> NEW.measurable_work_item_id
    OR tender.contract_package_id <> package.id
    OR tender.status NOT IN ('ACCEPTED', 'LOCKED')
    OR tender.currency_code <> valuation.currency_code
    OR package.job_id <> valuation.job_id
    OR package.contractor_id <> valuation.contractor_id
  THEN
    RAISE EXCEPTION 'valuation line does not match locked tender allocation, package, contractor, job, or currency';
  END IF;

  SELECT
    COALESCE(SUM(decision.approved_quantity), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'inspection_decision_id', decision.id,
      'approved_quantity', decision.approved_quantity,
      'inspected_at', decision.inspected_at
    ) ORDER BY decision.inspected_at, decision.id) FILTER (WHERE decision.id IS NOT NULL), '[]'::jsonb)
    INTO NEW.approved_quantity, NEW.approval_snapshot
    FROM inspection_decision decision
    JOIN contractor_claim_line line ON line.id = decision.contractor_claim_line_id
    WHERE line.tender_rate_work_item_link_id = NEW.tender_rate_work_item_link_id
      AND NOT EXISTS (
        SELECT 1 FROM inspection_decision replacement
        WHERE replacement.supersedes_decision_id = decision.id
      );

  SELECT COALESCE(SUM(line.current_valuation_quantity), 0)
    INTO NEW.previously_valued_quantity
    FROM contractor_valuation_line line
    JOIN contractor_valuation header ON header.id = line.contractor_valuation_id
    WHERE line.tender_rate_work_item_link_id = NEW.tender_rate_work_item_link_id
      AND header.status IN ('APPROVED', 'SUPERSEDED');

  NEW.current_valuation_quantity := NEW.approved_quantity - NEW.previously_valued_quantity;
  IF NEW.current_valuation_quantity <= 0
    OR NEW.approved_quantity > allocation.allocated_quantity
  THEN
    RAISE EXCEPTION 'no unvalued approved quantity or approval exceeds tender allocation';
  END IF;
  NEW.current_value := round(NEW.current_valuation_quantity * tender.locked_unit_rate, 2);
  NEW.currency_code := tender.currency_code;
  NEW.calculation_metadata := COALESCE(NEW.calculation_metadata, '{}'::jsonb) || jsonb_build_object(
    'formula', 'current approved quantity - previously valued quantity, multiplied by locked tender unit rate',
    'calculated_at', now()
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER contractor_valuation_line_calculate_insert
BEFORE INSERT ON contractor_valuation_line
FOR EACH ROW
EXECUTE FUNCTION calculate_contractor_valuation_line();
--> statement-breakpoint
CREATE FUNCTION protect_contractor_valuation_line()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'contractor valuation lines are append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER contractor_valuation_line_append_only
BEFORE UPDATE OR DELETE ON contractor_valuation_line
FOR EACH ROW
EXECUTE FUNCTION protect_contractor_valuation_line();
--> statement-breakpoint
CREATE FUNCTION approve_contractor_valuation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  valuation_line contractor_valuation_line%ROWTYPE;
  allocation contractor_tender_rate_work_item_link%ROWTYPE;
  tender contractor_tender_rate%ROWTYPE;
  current_approved NUMERIC(18,6);
  prior_valued NUMERIC(18,6);
  current_snapshot JSONB;
BEGIN
  IF OLD.status IN ('APPROVED', 'SUPERSEDED') THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'approved contractor valuations cannot be deleted';
    END IF;
    IF NEW.job_id IS DISTINCT FROM OLD.job_id
      OR NEW.contract_package_id IS DISTINCT FROM OLD.contract_package_id
      OR NEW.contractor_id IS DISTINCT FROM OLD.contractor_id
      OR NEW.valuation_number IS DISTINCT FROM OLD.valuation_number
      OR NEW.valuation_sequence IS DISTINCT FROM OLD.valuation_sequence
      OR NEW.valuation_period_start IS DISTINCT FROM OLD.valuation_period_start
      OR NEW.valuation_period_end IS DISTINCT FROM OLD.valuation_period_end
      OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
      OR NEW.calculated_at IS DISTINCT FROM OLD.calculated_at
      OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
      OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
      OR NEW.supersedes_valuation_id IS DISTINCT FROM OLD.supersedes_valuation_id
      OR NEW.source_metadata IS DISTINCT FROM OLD.source_metadata
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'approved contractor valuation fields are immutable';
    END IF;
    IF OLD.status = 'APPROVED' AND NEW.status NOT IN ('APPROVED', 'SUPERSEDED')
      OR OLD.status = 'SUPERSEDED' AND NEW.status <> 'SUPERSEDED'
    THEN
      RAISE EXCEPTION 'approved contractor valuation cannot be reopened';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NEW.status = 'APPROVED' AND OLD.status <> 'APPROVED' THEN
    IF current_setting('transaction_isolation') <> 'serializable' THEN
      RAISE EXCEPTION 'valuation approval requires a SERIALIZABLE transaction with retry on serialization failure';
    END IF;
    IF NEW.approved_at IS NULL OR NEW.approved_by IS NULL THEN
      RAISE EXCEPTION 'valuation approval requires approver and approval time';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM contractor_valuation_line WHERE contractor_valuation_id = NEW.id) THEN
      RAISE EXCEPTION 'valuation approval requires at least one line';
    END IF;
    IF NEW.supersedes_valuation_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM contractor_valuation prior
      WHERE prior.id = NEW.supersedes_valuation_id
        AND prior.contract_package_id = NEW.contract_package_id
        AND prior.status = 'SUPERSEDED'
    ) THEN
      RAISE EXCEPTION 'replacement valuation must reference a superseded valuation in the same package';
    END IF;

    FOR valuation_line IN SELECT * FROM contractor_valuation_line WHERE contractor_valuation_id = NEW.id ORDER BY id LOOP
      SELECT * INTO allocation FROM contractor_tender_rate_work_item_link WHERE id = valuation_line.tender_rate_work_item_link_id FOR UPDATE;
      IF NOT FOUND OR allocation.allocated_quantity IS NULL THEN
        RAISE EXCEPTION 'valuation allocation does not exist or has unresolved quantity';
      END IF;
      SELECT * INTO tender FROM contractor_tender_rate WHERE id = valuation_line.contractor_tender_rate_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'valuation tender rate does not exist';
      END IF;

      SELECT
        COALESCE(SUM(decision.approved_quantity), 0),
        COALESCE(jsonb_agg(jsonb_build_object(
          'inspection_decision_id', decision.id,
          'approved_quantity', decision.approved_quantity,
          'inspected_at', decision.inspected_at
        ) ORDER BY decision.inspected_at, decision.id) FILTER (WHERE decision.id IS NOT NULL), '[]'::jsonb)
        INTO current_approved, current_snapshot
        FROM inspection_decision decision
        JOIN contractor_claim_line claim_line ON claim_line.id = decision.contractor_claim_line_id
        WHERE claim_line.tender_rate_work_item_link_id = valuation_line.tender_rate_work_item_link_id
          AND NOT EXISTS (
            SELECT 1 FROM inspection_decision replacement
            WHERE replacement.supersedes_decision_id = decision.id
          );

      SELECT COALESCE(SUM(line.current_valuation_quantity), 0)
        INTO prior_valued
        FROM contractor_valuation_line line
        JOIN contractor_valuation header ON header.id = line.contractor_valuation_id
        WHERE line.tender_rate_work_item_link_id = valuation_line.tender_rate_work_item_link_id
          AND header.status IN ('APPROVED', 'SUPERSEDED')
          AND header.id <> NEW.id;

      IF tender.status NOT IN ('ACCEPTED', 'LOCKED')
        OR current_approved <> valuation_line.approved_quantity
        OR prior_valued <> valuation_line.previously_valued_quantity
        OR current_approved - prior_valued <> valuation_line.current_valuation_quantity
        OR current_approved > allocation.allocated_quantity
        OR round(valuation_line.current_valuation_quantity * tender.locked_unit_rate, 2) <> valuation_line.current_value
        OR tender.currency_code <> valuation_line.currency_code
        OR current_snapshot <> valuation_line.approval_snapshot
      THEN
        RAISE EXCEPTION 'valuation line is stale or does not reconcile to current approvals, prior valuations, allocation, or locked tender rate';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER contractor_valuation_approval_guard
BEFORE UPDATE OR DELETE ON contractor_valuation
FOR EACH ROW
EXECUTE FUNCTION approve_contractor_valuation();
