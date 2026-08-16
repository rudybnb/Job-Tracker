-- Phase 2E2A: append-only location progress, contractor claims, and inspection decisions.
-- Payment records and valuation are deliberately deferred.

CREATE TABLE work_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  measurable_work_item_id UUID NOT NULL REFERENCES measurable_work_item(id) ON DELETE RESTRICT,
  contractor_id VARCHAR NOT NULL REFERENCES contractors(id) ON DELETE RESTRICT,
  contract_package_id UUID REFERENCES contract_package(id) ON DELETE RESTRICT,
  tender_rate_id UUID REFERENCES contractor_tender_rate(id) ON DELETE RESTRICT,
  tender_rate_work_item_link_id UUID REFERENCES contractor_tender_rate_work_item_link(id) ON DELETE RESTRICT,
  progress_quantity NUMERIC(18,6) NOT NULL CHECK (progress_quantity > 0),
  unit_code TEXT NOT NULL,
  progress_date DATE NOT NULL,
  entry_type TEXT NOT NULL DEFAULT 'PROGRESS'
    CHECK (entry_type IN ('PROGRESS', 'REVERSAL')),
  reverses_progress_id UUID REFERENCES work_progress(id) ON DELETE RESTRICT,
  recorded_by TEXT NOT NULL,
  actor_metadata JSONB,
  notes TEXT,
  evidence_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_progress_reversal_guard
    CHECK (
      (entry_type = 'PROGRESS' AND reverses_progress_id IS NULL)
      OR (entry_type = 'REVERSAL' AND reverses_progress_id IS NOT NULL)
    ),
  CONSTRAINT work_progress_tender_link_guard
    CHECK (
      tender_rate_work_item_link_id IS NULL
      OR (contract_package_id IS NOT NULL AND tender_rate_id IS NOT NULL)
    )
);
--> statement-breakpoint
CREATE UNIQUE INDEX work_progress_reversal_unique
  ON work_progress (reverses_progress_id)
  WHERE reverses_progress_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX work_progress_job_item_date_idx
  ON work_progress (job_id, measurable_work_item_id, progress_date);
--> statement-breakpoint
CREATE INDEX work_progress_contractor_date_idx
  ON work_progress (contractor_id, progress_date);
--> statement-breakpoint
CREATE INDEX work_progress_package_idx
  ON work_progress (contract_package_id);
--> statement-breakpoint
CREATE INDEX work_progress_tender_link_idx
  ON work_progress (tender_rate_work_item_link_id);
--> statement-breakpoint
CREATE TABLE contractor_claim (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  contract_package_id UUID NOT NULL REFERENCES contract_package(id) ON DELETE RESTRICT,
  contractor_id VARCHAR NOT NULL REFERENCES contractors(id) ON DELETE RESTRICT,
  claim_number TEXT NOT NULL,
  claim_sequence INTEGER NOT NULL CHECK (claim_sequence > 0),
  claim_period_start DATE,
  claim_period_end DATE,
  submitted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'PART_APPROVED', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
  notes TEXT,
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contractor_claim_number_unique UNIQUE (contract_package_id, claim_number),
  CONSTRAINT contractor_claim_sequence_unique UNIQUE (contract_package_id, claim_sequence),
  CONSTRAINT contractor_claim_period_guard
    CHECK (claim_period_start IS NULL OR claim_period_end IS NULL OR claim_period_end >= claim_period_start),
  CONSTRAINT contractor_claim_submission_guard
    CHECK (status = 'DRAFT' OR submitted_at IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX contractor_claim_job_status_idx
  ON contractor_claim (job_id, status);
--> statement-breakpoint
CREATE INDEX contractor_claim_package_status_idx
  ON contractor_claim (contract_package_id, status);
--> statement-breakpoint
CREATE INDEX contractor_claim_contractor_idx
  ON contractor_claim (contractor_id, submitted_at);
--> statement-breakpoint
CREATE TABLE contractor_claim_line (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_claim_id UUID NOT NULL REFERENCES contractor_claim(id) ON DELETE RESTRICT,
  measurable_work_item_id UUID NOT NULL REFERENCES measurable_work_item(id) ON DELETE RESTRICT,
  contractor_tender_rate_id UUID NOT NULL REFERENCES contractor_tender_rate(id) ON DELETE RESTRICT,
  tender_rate_work_item_link_id UUID NOT NULL REFERENCES contractor_tender_rate_work_item_link(id) ON DELETE RESTRICT,
  claimed_quantity NUMERIC(18,6) NOT NULL CHECK (claimed_quantity > 0),
  unit_code TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT,
  notes TEXT,
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contractor_claim_line_item_unique
    UNIQUE (contractor_claim_id, tender_rate_work_item_link_id)
);
--> statement-breakpoint
CREATE INDEX contractor_claim_line_claim_idx
  ON contractor_claim_line (contractor_claim_id);
--> statement-breakpoint
CREATE INDEX contractor_claim_line_work_item_idx
  ON contractor_claim_line (measurable_work_item_id);
--> statement-breakpoint
CREATE INDEX contractor_claim_line_tender_rate_idx
  ON contractor_claim_line (contractor_tender_rate_id);
--> statement-breakpoint
CREATE INDEX contractor_claim_line_allocation_idx
  ON contractor_claim_line (tender_rate_work_item_link_id);
--> statement-breakpoint
CREATE TABLE inspection_decision (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_claim_line_id UUID NOT NULL REFERENCES contractor_claim_line(id) ON DELETE RESTRICT,
  inspector_id TEXT NOT NULL,
  inspector_metadata JSONB,
  inspected_at TIMESTAMPTZ NOT NULL,
  inspected_quantity NUMERIC(18,6) NOT NULL CHECK (inspected_quantity >= 0),
  approved_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (approved_quantity >= 0),
  rejected_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (rejected_quantity >= 0),
  held_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (held_quantity >= 0),
  decision_status TEXT NOT NULL
    CHECK (decision_status IN ('APPROVED', 'PART_APPROVED', 'REJECTED', 'HELD', 'REINSPECTION_REQUIRED')),
  defect_reason_code TEXT,
  notes TEXT,
  evidence_metadata JSONB,
  supersedes_decision_id UUID REFERENCES inspection_decision(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inspection_decision_quantity_allocation_guard
    CHECK (approved_quantity + rejected_quantity + held_quantity <= inspected_quantity),
  CONSTRAINT inspection_decision_approved_guard
    CHECK (decision_status <> 'APPROVED' OR (approved_quantity = inspected_quantity AND rejected_quantity = 0 AND held_quantity = 0)),
  CONSTRAINT inspection_decision_rejected_guard
    CHECK (decision_status <> 'REJECTED' OR (rejected_quantity > 0 AND approved_quantity = 0)),
  CONSTRAINT inspection_decision_held_guard
    CHECK (decision_status NOT IN ('HELD', 'REINSPECTION_REQUIRED') OR held_quantity > 0),
  CONSTRAINT inspection_decision_supersedes_other
    CHECK (supersedes_decision_id IS NULL OR supersedes_decision_id <> id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX inspection_decision_supersedes_unique
  ON inspection_decision (supersedes_decision_id)
  WHERE supersedes_decision_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX inspection_decision_claim_line_idx
  ON inspection_decision (contractor_claim_line_id, inspected_at);
--> statement-breakpoint
CREATE INDEX inspection_decision_status_idx
  ON inspection_decision (decision_status, inspected_at);
--> statement-breakpoint
CREATE FUNCTION protect_append_only_e2a_records()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% records are append-only', TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER work_progress_append_only
BEFORE UPDATE OR DELETE ON work_progress
FOR EACH ROW
EXECUTE FUNCTION protect_append_only_e2a_records();
--> statement-breakpoint
CREATE TRIGGER contractor_claim_line_append_only
BEFORE UPDATE OR DELETE ON contractor_claim_line
FOR EACH ROW
EXECUTE FUNCTION protect_append_only_e2a_records();
--> statement-breakpoint
CREATE TRIGGER inspection_decision_append_only
BEFORE UPDATE OR DELETE ON inspection_decision
FOR EACH ROW
EXECUTE FUNCTION protect_append_only_e2a_records();
--> statement-breakpoint
CREATE FUNCTION validate_work_progress_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  allocation contractor_tender_rate_work_item_link%ROWTYPE;
  tender contractor_tender_rate%ROWTYPE;
  package contract_package%ROWTYPE;
  original work_progress%ROWTYPE;
BEGIN
  IF NEW.entry_type = 'REVERSAL' THEN
    SELECT * INTO original FROM work_progress WHERE id = NEW.reverses_progress_id FOR UPDATE;
    IF NOT FOUND
      OR original.entry_type <> 'PROGRESS'
      OR original.measurable_work_item_id <> NEW.measurable_work_item_id
      OR original.contractor_id <> NEW.contractor_id
      OR original.unit_code <> NEW.unit_code
      OR original.progress_quantity <> NEW.progress_quantity
    THEN
      RAISE EXCEPTION 'progress reversal must exactly reverse one matching progress entry';
    END IF;
  END IF;

  IF NEW.tender_rate_work_item_link_id IS NOT NULL THEN
    SELECT * INTO allocation
      FROM contractor_tender_rate_work_item_link
      WHERE id = NEW.tender_rate_work_item_link_id
      FOR UPDATE;
    IF NOT FOUND
    THEN
      RAISE EXCEPTION 'progress tender allocation does not exist';
    END IF;
    SELECT * INTO tender FROM contractor_tender_rate WHERE id = NEW.tender_rate_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'progress tender rate does not exist';
    END IF;
    SELECT * INTO package FROM contract_package WHERE id = NEW.contract_package_id;
    IF NOT FOUND
      OR allocation.contractor_tender_rate_id <> tender.id
      OR allocation.measurable_work_item_id <> NEW.measurable_work_item_id
      OR tender.contract_package_id <> package.id
      OR tender.status NOT IN ('ACCEPTED', 'LOCKED')
      OR tender.unit_code <> NEW.unit_code
      OR package.job_id <> NEW.job_id
      OR package.contractor_id <> NEW.contractor_id
    THEN
      RAISE EXCEPTION 'progress tender allocation does not match work item and tender rate';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER work_progress_validate_insert
BEFORE INSERT ON work_progress
FOR EACH ROW
EXECUTE FUNCTION validate_work_progress_entry();
--> statement-breakpoint
CREATE FUNCTION validate_contractor_claim_line()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  claim_header contractor_claim%ROWTYPE;
  allocation contractor_tender_rate_work_item_link%ROWTYPE;
  tender contractor_tender_rate%ROWTYPE;
  package contract_package%ROWTYPE;
  cumulative_claimed NUMERIC(18,6);
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'claim lines require a SERIALIZABLE transaction with retry on serialization failure';
  END IF;
  SELECT * INTO claim_header FROM contractor_claim WHERE id = NEW.contractor_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'claim header does not exist';
  END IF;
  SELECT * INTO allocation FROM contractor_tender_rate_work_item_link WHERE id = NEW.tender_rate_work_item_link_id FOR UPDATE;
  IF NOT FOUND OR allocation.allocated_quantity IS NULL THEN
    RAISE EXCEPTION 'claim requires a known tender allocation quantity';
  END IF;
  SELECT * INTO tender FROM contractor_tender_rate WHERE id = NEW.contractor_tender_rate_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'claim tender rate does not exist';
  END IF;
  SELECT * INTO package FROM contract_package WHERE id = claim_header.contract_package_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'claim package does not exist';
  END IF;

  IF claim_header.status <> 'DRAFT'
    OR allocation.contractor_tender_rate_id <> NEW.contractor_tender_rate_id
    OR allocation.measurable_work_item_id <> NEW.measurable_work_item_id
    OR tender.contract_package_id <> claim_header.contract_package_id
    OR tender.status NOT IN ('ACCEPTED', 'LOCKED')
    OR tender.unit_code <> NEW.unit_code
    OR package.job_id <> claim_header.job_id
    OR package.contractor_id <> claim_header.contractor_id
  THEN
    RAISE EXCEPTION 'claim line does not match draft claim, locked tender allocation, package, contractor, job, or unit';
  END IF;

  SELECT COALESCE(SUM(line.claimed_quantity), 0)
    INTO cumulative_claimed
    FROM contractor_claim_line line
    JOIN contractor_claim header ON header.id = line.contractor_claim_id
    WHERE line.tender_rate_work_item_link_id = NEW.tender_rate_work_item_link_id
      AND header.status NOT IN ('REJECTED', 'WITHDRAWN');

  IF cumulative_claimed + NEW.claimed_quantity > allocation.allocated_quantity THEN
    RAISE EXCEPTION 'cumulative claimed quantity exceeds tender work-item allocation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER contractor_claim_line_validate_insert
BEFORE INSERT ON contractor_claim_line
FOR EACH ROW
EXECUTE FUNCTION validate_contractor_claim_line();
--> statement-breakpoint
CREATE FUNCTION validate_inspection_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  claim_line contractor_claim_line%ROWTYPE;
  allocation contractor_tender_rate_work_item_link%ROWTYPE;
  prior inspection_decision%ROWTYPE;
  cumulative_approved NUMERIC(18,6);
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'inspection decisions require a SERIALIZABLE transaction with retry on serialization failure';
  END IF;
  SELECT * INTO claim_line FROM contractor_claim_line WHERE id = NEW.contractor_claim_line_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inspection claim line does not exist';
  END IF;
  SELECT * INTO allocation FROM contractor_tender_rate_work_item_link WHERE id = claim_line.tender_rate_work_item_link_id FOR UPDATE;
  IF NOT FOUND OR allocation.allocated_quantity IS NULL THEN
    RAISE EXCEPTION 'inspection approval requires a known tender allocation quantity';
  END IF;
  IF NEW.inspected_quantity > claim_line.claimed_quantity THEN
    RAISE EXCEPTION 'inspected quantity exceeds claim-line quantity';
  END IF;

  IF NEW.supersedes_decision_id IS NOT NULL THEN
    SELECT * INTO prior FROM inspection_decision WHERE id = NEW.supersedes_decision_id FOR UPDATE;
    IF NOT FOUND OR prior.contractor_claim_line_id <> NEW.contractor_claim_line_id THEN
      RAISE EXCEPTION 'inspection supersession must reference a decision for the same claim line';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM inspection_decision WHERE contractor_claim_line_id = NEW.contractor_claim_line_id) THEN
    RAISE EXCEPTION 'later inspection decisions must supersede the current decision';
  END IF;

  SELECT COALESCE(SUM(decision.approved_quantity), 0)
    INTO cumulative_approved
    FROM inspection_decision decision
    JOIN contractor_claim_line line ON line.id = decision.contractor_claim_line_id
    WHERE line.tender_rate_work_item_link_id = claim_line.tender_rate_work_item_link_id
      AND NOT EXISTS (
        SELECT 1 FROM inspection_decision replacement
        WHERE replacement.supersedes_decision_id = decision.id
      )
      AND decision.id IS DISTINCT FROM NEW.supersedes_decision_id;

  IF cumulative_approved + NEW.approved_quantity > allocation.allocated_quantity THEN
    RAISE EXCEPTION 'cumulative approved quantity exceeds tender work-item allocation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inspection_decision_validate_insert
BEFORE INSERT ON inspection_decision
FOR EACH ROW
EXECUTE FUNCTION validate_inspection_decision();
