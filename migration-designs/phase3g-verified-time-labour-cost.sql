-- Phase 3G — Verified Time & Labour Cost Calculation Foundation (DESIGN + EXECUTION SOURCE)
-- Status: additive-only. Contains zero DROP/TRUNCATE/DELETE/UPDATE/ALTER COLUMN TYPE.
-- Executed manually inside a single transaction on the live database on 2026-08-14
-- (see docs/phase-3g-run-log.md). This file is dormant; the canonical migration
-- loader must NOT pick it up (it lives outside migrations/).
--
-- Business rules honoured:
--   1. Payable time comes only from verified clock-in/out (work_sessions evidence).
--   2. Scheduled hours are never automatically payable.
--   3. No calculation proceeds where worker, job, payee or approved rate is unresolved.
--   4. No fabricated rates (rate_amount remains NULL until approved).
--   5. DAILY rates require an approved standard_day_minutes basis; otherwise unresolved.
--   6. HOURLY rates: cost = verified payable minutes / 60 * approved hourly rate.
--   7. Agency labour: worker supplies time; agency/supplier is the payee.
--   8. Direct self-employed: worker supplies time; worker is the payee.
-- No wage/payment, Monzo, CIS, VAT, supplier invoice or settlement is created here.

-- 5.1 enum types (guarded; PG lacks CREATE TYPE IF NOT EXISTS)
DO $$ BEGIN
  CREATE TYPE labour_time_status AS ENUM ('UNVERIFIED', 'VERIFIED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE labour_calculation_status AS ENUM ('PENDING', 'RESOLVED', 'UNRESOLVED', 'ERROR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5.2 labour_rates: approved day basis for DAILY rates (rule 5; nullable, additive)
ALTER TABLE labour_rates ADD COLUMN IF NOT EXISTS standard_day_minutes INTEGER;

-- 5.3 labour_time_records (approved/verified timesheet; evidence = work_sessions)
CREATE TABLE IF NOT EXISTS labour_time_records (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL REFERENCES jobs(id),
  worker_id VARCHAR NOT NULL REFERENCES workers(id),
  work_session_id VARCHAR NOT NULL REFERENCES work_sessions(id),
  work_date DATE NOT NULL,
  clock_in_at TIMESTAMP,
  clock_out_at TIMESTAMP,
  verified_payable_minutes INTEGER,
  time_status labour_time_status NOT NULL DEFAULT 'UNVERIFIED',
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS labour_time_record_session_unique ON labour_time_records (work_session_id);
CREATE INDEX IF NOT EXISTS idx_labour_time_worker ON labour_time_records (worker_id);
CREATE INDEX IF NOT EXISTS idx_labour_time_job ON labour_time_records (job_id);

-- 5.4 labour_cost_calculations (reproducible, auditable calculation snapshot)
CREATE TABLE IF NOT EXISTS labour_cost_calculations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  time_record_id VARCHAR NOT NULL REFERENCES labour_time_records(id),
  job_id VARCHAR NOT NULL REFERENCES jobs(id),
  worker_id VARCHAR NOT NULL REFERENCES workers(id),
  payee_id VARCHAR REFERENCES payees(id),
  labour_rate_id VARCHAR REFERENCES labour_rates(id),
  rate_type labour_rate_type,
  rate_amount NUMERIC(14,2),
  standard_day_minutes INTEGER,
  currency_code TEXT NOT NULL DEFAULT 'GBP',
  verified_payable_minutes INTEGER,
  calculation_status labour_calculation_status NOT NULL DEFAULT 'PENDING',
  unresolved_reason TEXT,
  calculated_cost NUMERIC(14,2),
  calculation_version INTEGER NOT NULL DEFAULT 1,
  calculated_at TIMESTAMPTZ,
  calculated_by TEXT,
  source_evidence TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT calc_resolved_cost_check CHECK ((calculation_status = 'RESOLVED') OR (calculated_cost IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_labour_calc_time_record ON labour_cost_calculations (time_record_id);
CREATE INDEX IF NOT EXISTS idx_labour_calc_job ON labour_cost_calculations (job_id);
CREATE INDEX IF NOT EXISTS idx_labour_calc_worker ON labour_cost_calculations (worker_id);
CREATE INDEX IF NOT EXISTS idx_labour_calc_rate ON labour_cost_calculations (labour_rate_id);
CREATE INDEX IF NOT EXISTS idx_labour_calc_payee ON labour_cost_calculations (payee_id);