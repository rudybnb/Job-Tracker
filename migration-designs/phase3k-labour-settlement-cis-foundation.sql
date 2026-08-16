-- Phase 3K — Labour Settlement & CIS Foundation (DESIGN + EXECUTION SOURCE)
-- Status: additive-only. Contains zero DROP/TRUNCATE/DELETE/ALTER COLUMN TYPE.
-- Do not run against live Render without a snapshot and explicit approval.
-- This file is dormant; the canonical migration loader ignores migration-designs/.
--
-- Business rules honoured:
--   1. Settlements reference immutable RESOLVED labour_cost_calculations.
--   2. Direct self-employed settlements pay the worker payee.
--   3. Agency labour settlements pay the agency supplier payee, never the worker.
--   4. Supply-and-fit subcontractors remain outside this time-based settlement flow.
--   5. CIS is centralised on payee_cis_profile; unresolved CIS leaves settlement
--      UNRESOLVED with no net amount.
--   6. labour_settlement_line.labour_calculation_id is unique to prevent duplicate
--      settlement of the same labour-cost calculation.
-- No payment, Monzo, bank transaction, VAT activation or HMRC CIS submission.

DO $$ BEGIN
  CREATE TYPE payee_cis_status AS ENUM (
    'UNRESOLVED',
    'NOT_APPLICABLE',
    'GROSS_PAYMENT',
    'NET_DEDUCTION',
    'HIGHER_RATE_DEDUCTION'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE labour_settlement_status AS ENUM (
    'UNRESOLVED',
    'REVIEW_REQUIRED',
    'APPROVED',
    'VOIDED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS payee_cis_profile (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  payee_id VARCHAR NOT NULL UNIQUE REFERENCES payees(id),
  cis_status payee_cis_status NOT NULL DEFAULT 'UNRESOLVED',
  deduction_rate NUMERIC(5,2),
  verification_reference TEXT,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  source_evidence TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payee_cis_profile_rate_check CHECK (deduction_rate IS NULL OR (deduction_rate >= 0 AND deduction_rate <= 100)),
  CONSTRAINT payee_cis_profile_unresolved_guard CHECK (cis_status <> 'UNRESOLVED' OR deduction_rate IS NULL),
  CONSTRAINT payee_cis_profile_deduction_guard CHECK (cis_status IN ('UNRESOLVED', 'NOT_APPLICABLE') OR deduction_rate IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_payee_cis_profile_status ON payee_cis_profile (cis_status);

CREATE TABLE IF NOT EXISTS labour_settlements (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL REFERENCES jobs(id),
  payee_id VARCHAR NOT NULL REFERENCES payees(id),
  settlement_kind TEXT NOT NULL,
  status labour_settlement_status NOT NULL DEFAULT 'REVIEW_REQUIRED',
  gross_amount NUMERIC(14,2) NOT NULL,
  cis_status payee_cis_status NOT NULL DEFAULT 'UNRESOLVED',
  cis_deduction_rate NUMERIC(5,2),
  cis_deduction_amount NUMERIC(14,2),
  net_amount NUMERIC(14,2),
  currency_code TEXT NOT NULL DEFAULT 'GBP',
  unresolved_reason TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  review_notes TEXT,
  source_evidence TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT labour_settlement_kind_check CHECK (settlement_kind IN ('DIRECT_SELF_EMPLOYED', 'AGENCY')),
  CONSTRAINT labour_settlement_amount_nonnegative CHECK (gross_amount >= 0 AND (cis_deduction_amount IS NULL OR cis_deduction_amount >= 0) AND (net_amount IS NULL OR net_amount >= 0)),
  CONSTRAINT labour_settlement_unresolved_guard CHECK ((status = 'UNRESOLVED' AND net_amount IS NULL) OR (status <> 'UNRESOLVED' AND net_amount IS NOT NULL)),
  CONSTRAINT labour_settlement_approval_guard CHECK (status <> 'APPROVED' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_labour_settlement_job ON labour_settlements (job_id);
CREATE INDEX IF NOT EXISTS idx_labour_settlement_payee ON labour_settlements (payee_id);
CREATE INDEX IF NOT EXISTS idx_labour_settlement_status ON labour_settlements (status);

CREATE TABLE IF NOT EXISTS labour_settlement_lines (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id VARCHAR NOT NULL REFERENCES labour_settlements(id),
  labour_calculation_id VARCHAR NOT NULL REFERENCES labour_cost_calculations(id),
  time_record_id VARCHAR NOT NULL REFERENCES labour_time_records(id),
  job_id VARCHAR NOT NULL REFERENCES jobs(id),
  worker_id VARCHAR NOT NULL REFERENCES workers(id),
  payee_id VARCHAR NOT NULL REFERENCES payees(id),
  line_number INTEGER NOT NULL,
  gross_amount NUMERIC(14,2) NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'GBP',
  verified_payable_minutes INTEGER,
  rate_type labour_rate_type,
  rate_amount NUMERIC(14,2),
  standard_day_minutes INTEGER,
  work_date DATE,
  source_evidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT labour_settlement_line_number_positive CHECK (line_number > 0),
  CONSTRAINT labour_settlement_line_gross_nonnegative CHECK (gross_amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS labour_settlement_line_number_unique ON labour_settlement_lines (settlement_id, line_number);
CREATE UNIQUE INDEX IF NOT EXISTS labour_settlement_line_calculation_unique ON labour_settlement_lines (labour_calculation_id);
CREATE INDEX IF NOT EXISTS idx_labour_settlement_line_settlement ON labour_settlement_lines (settlement_id);
CREATE INDEX IF NOT EXISTS idx_labour_settlement_line_worker ON labour_settlement_lines (worker_id);
CREATE INDEX IF NOT EXISTS idx_labour_settlement_line_time_record ON labour_settlement_lines (time_record_id);
