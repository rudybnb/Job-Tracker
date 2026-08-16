-- Phase 3E-B — First Controlled Migration (DESIGN + EXECUTION SOURCE)
-- Status: additive-only. Contains zero DROP/TRUNCATE/DELETE/UPDATE/ALTER COLUMN TYPE.
-- Executed manually inside a single transaction on the live database on 2026-08-14
-- (see docs/phase-3eb-run-log.md). This file is dormant; the canonical migration
-- loader must NOT pick it up (it lives outside migrations/).

-- 3.1 clients (canonical client identity)
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  external_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS clients_name_unique ON clients (name);

-- 3.2 jobs.client_id (nullable canonical client relationship)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);

CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON jobs (client_id);

-- 3.3 legacy_identity_crosswalk (reviewed mapping log; UNRESOLVED = unmapped)
CREATE TABLE IF NOT EXISTS legacy_identity_crosswalk (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table TEXT NOT NULL,
  source_key TEXT NOT NULL,
  target_entity TEXT,
  target_id TEXT,
  evidence TEXT,
  mapping_status TEXT NOT NULL DEFAULT 'UNRESOLVED',
  reviewer TEXT,
  reviewed_at TIMESTAMPTZ,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crosswalk_source ON legacy_identity_crosswalk (source_table, source_key);
CREATE INDEX IF NOT EXISTS idx_crosswalk_target ON legacy_identity_crosswalk (target_entity, target_id);

-- 3.4 financial_opening_balance_set (one controlled cutover)
CREATE TABLE IF NOT EXISTS financial_opening_balance_set (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cutover_at TIMESTAMPTZ NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'GBP',
  source_reference TEXT,
  evidence_location TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  prepared_by TEXT,
  prepared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  completeness_statement TEXT,
  notes TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_opening_set_cutover_currency ON financial_opening_balance_set (cutover_at, currency_code);

-- 3.5 financial_opening_position (cutover position detail)
CREATE TABLE IF NOT EXISTS financial_opening_position (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_balance_set_id UUID NOT NULL REFERENCES financial_opening_balance_set(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'GBP',
  position_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  direction TEXT,
  net_amount NUMERIC(14,2),
  tax_amount NUMERIC(14,2),
  gross_amount NUMERIC(14,2),
  amount_basis_status TEXT NOT NULL DEFAULT 'UNKNOWN_LEGACY',
  job_id TEXT,
  client_id UUID REFERENCES clients(id),
  contractor_id TEXT,
  supplier_id TEXT,
  bank_account_id TEXT,
  vat_period_id UUID,
  cis_period_id UUID,
  contract_package_id UUID,
  due_date DATE,
  external_reference TEXT,
  source_evidence TEXT,
  review_status TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opening_position_set ON financial_opening_position (opening_balance_set_id);
CREATE INDEX IF NOT EXISTS idx_opening_position_job ON financial_opening_position (job_id);
