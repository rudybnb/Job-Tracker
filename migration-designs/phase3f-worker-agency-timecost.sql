-- Phase 3F — Worker, Agency & Time-Cost Foundation (DESIGN + EXECUTION SOURCE)
-- Status: additive-only. Contains zero DROP/TRUNCATE/DELETE/UPDATE/ALTER COLUMN TYPE.
-- Executed manually inside a single transaction on the live database on 2026-08-14
-- (see docs/phase-3f-run-log.md). This file is dormant; the canonical migration
-- loader must NOT pick it up (it lives outside migrations/).
--
-- Business rules honoured:
--   A. Supply-and-fit subcontractors are contract/quotation/invoice based (NOT clock-paid).
--      They remain represented by contractors / contractor_applications. No rate is fabricated.
--   B. Agency labour clocks in/out; the agency is the supplier/payee.
--   C. Direct self-employed labour clocks in/out; the worker is the payee.
-- No wage/payment calculation, no CIS/VAT/settlement/invoice derivation happens here.

-- 4.1 enum types (guarded; DO block because PG lacks CREATE TYPE IF NOT EXISTS)
DO $$ BEGIN
  CREATE TYPE worker_type AS ENUM ('AGENCY', 'DIRECT_SELF_EMPLOYED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE supplier_type AS ENUM ('AGENCY', 'MATERIAL', 'SUBCONTRACTOR', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE labour_rate_type AS ENUM ('HOURLY', 'DAILY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE rate_approval_status AS ENUM ('UNKNOWN', 'APPROVED', 'SUPERSEDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payee_type AS ENUM ('WORKER', 'SUPPLIER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4.2 suppliers (canonical supplier/payee entity; an agency is a supplier of type AGENCY)
CREATE TABLE IF NOT EXISTS suppliers (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  supplier_type supplier_type NOT NULL DEFAULT 'OTHER',
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4.3 agencies (agency profile, 1:1 with a supplier of type AGENCY)
CREATE TABLE IF NOT EXISTS agencies (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id VARCHAR NOT NULL UNIQUE REFERENCES suppliers(id),
  agency_name TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  commission_basis TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4.4 workers (canonical worker identity for clocked labour; direct self-employed or agency worker)
CREATE TABLE IF NOT EXISTS workers (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  worker_type worker_type NOT NULL DEFAULT 'DIRECT_SELF_EMPLOYED',
  contractor_id VARCHAR REFERENCES contractors(id),
  contractor_application_id VARCHAR REFERENCES contractor_applications(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4.5 agency_workers (agency-worker relationship)
CREATE TABLE IF NOT EXISTS agency_workers (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id VARCHAR NOT NULL REFERENCES agencies(id),
  worker_id VARCHAR NOT NULL REFERENCES workers(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  started_at DATE,
  ended_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agency_workers_agency_worker_unique ON agency_workers (agency_id, worker_id);

-- 4.6 labour_rates (approved rate records; rate_amount stays NULL until approved)
CREATE TABLE IF NOT EXISTS labour_rates (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id VARCHAR REFERENCES workers(id),
  agency_id VARCHAR REFERENCES agencies(id),
  rate_type labour_rate_type NOT NULL DEFAULT 'HOURLY',
  rate_amount NUMERIC(14,2),
  currency_code TEXT NOT NULL DEFAULT 'GBP',
  effective_from DATE,
  effective_to DATE,
  approval_status rate_approval_status NOT NULL DEFAULT 'UNKNOWN',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  source_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_labour_rates_worker ON labour_rates (worker_id);
CREATE INDEX IF NOT EXISTS idx_labour_rates_agency ON labour_rates (agency_id);

-- 4.7 payees (unified payee identity: a worker, or a supplier such as an agency)
CREATE TABLE IF NOT EXISTS payees (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  payee_type payee_type NOT NULL,
  worker_id VARCHAR REFERENCES workers(id),
  supplier_id VARCHAR REFERENCES suppliers(id),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payee_target_check CHECK ((worker_id IS NOT NULL) <> (supplier_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS payees_worker_unique ON payees (worker_id);
CREATE UNIQUE INDEX IF NOT EXISTS payees_supplier_unique ON payees (supplier_id);

-- 4.8 work_sessions: safe nullable canonical links (legacy text fields preserved untouched)
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS job_id VARCHAR REFERENCES jobs(id);
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS worker_id VARCHAR REFERENCES workers(id);
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS contractor_id VARCHAR REFERENCES contractors(id);
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS supplier_id VARCHAR REFERENCES suppliers(id);
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS payee_id VARCHAR REFERENCES payees(id);

CREATE INDEX IF NOT EXISTS idx_work_sessions_job ON work_sessions (job_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_worker ON work_sessions (worker_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_contractor ON work_sessions (contractor_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_supplier ON work_sessions (supplier_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_payee ON work_sessions (payee_id);