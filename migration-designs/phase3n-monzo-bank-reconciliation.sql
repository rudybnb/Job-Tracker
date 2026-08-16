-- Phase 3N — Monzo Bank Connection & Reconciliation Foundation
-- Status: additive-only. Contains zero DROP/TRUNCATE/DELETE/ALTER COLUMN TYPE.
-- Apply to live only after snapshot, restore-test, and scratch rehearsal.
--
-- Read-only bank visibility only:
--   - No bank payments or transfers.
--   - No standing orders.
--   - No Monzo mutation endpoints.
--   - No VAT activation.
--   - No CIS submission.

CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'MONZO',
  provider_account_id TEXT NOT NULL,
  description TEXT,
  account_type TEXT,
  currency_code VARCHAR(3),
  raw_provider_payload JSONB,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bank_accounts_provider_check CHECK (provider IN ('MONZO')),
  CONSTRAINT bank_accounts_identity_unique UNIQUE (provider, provider_account_id),
  CONSTRAINT bank_accounts_currency_code_check CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$')
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL DEFAULT 'MONZO',
  provider_account_id TEXT NOT NULL,
  provider_transaction_id TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  amount_minor BIGINT NOT NULL,
  currency_code VARCHAR(3) NOT NULL,
  direction TEXT NOT NULL,
  transaction_at TIMESTAMPTZ NOT NULL,
  description TEXT NOT NULL,
  reference TEXT,
  counterparty_name TEXT,
  merchant_name TEXT,
  raw_provider_payload JSONB NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bank_transactions_provider_check CHECK (provider IN ('MONZO')),
  CONSTRAINT bank_transactions_identity_unique UNIQUE (provider, provider_transaction_id),
  CONSTRAINT bank_transactions_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT bank_transactions_direction_check CHECK (direction IN ('INCOMING', 'OUTGOING')),
  CONSTRAINT bank_transactions_amount_nonzero CHECK (amount <> 0 AND amount_minor <> 0),
  CONSTRAINT bank_transactions_direction_amount_guard CHECK ((direction = 'INCOMING' AND amount > 0 AND amount_minor > 0) OR (direction = 'OUTGOING' AND amount < 0 AND amount_minor < 0))
);

CREATE TABLE IF NOT EXISTS bank_reconciliation_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_transaction_id UUID NOT NULL REFERENCES bank_transactions(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  job_id VARCHAR REFERENCES jobs(id) ON DELETE RESTRICT,
  counterparty_name TEXT,
  matched_amount NUMERIC(14,2) NOT NULL,
  match_status TEXT NOT NULL DEFAULT 'PROPOSED',
  match_type TEXT NOT NULL,
  evidence TEXT,
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  rejected_by TEXT,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bank_recon_direction_check CHECK (direction IN ('INCOMING', 'OUTGOING')),
  CONSTRAINT bank_recon_target_type_check CHECK (target_type IN ('LABOUR_SETTLEMENT', 'CONTRACTOR_VALUATION', 'SUPPLIER_INVOICE', 'CLIENT_RECEIVABLE')),
  CONSTRAINT bank_recon_direction_target_guard CHECK ((direction = 'INCOMING' AND target_type = 'CLIENT_RECEIVABLE') OR (direction = 'OUTGOING' AND target_type IN ('LABOUR_SETTLEMENT', 'CONTRACTOR_VALUATION', 'SUPPLIER_INVOICE'))),
  CONSTRAINT bank_recon_amount_positive CHECK (matched_amount > 0),
  CONSTRAINT bank_recon_status_check CHECK (match_status IN ('PROPOSED', 'CONFIRMED', 'REJECTED')),
  CONSTRAINT bank_recon_type_check CHECK (match_type IN ('EXACT', 'PARTIAL', 'MULTI_PAYMENT', 'MULTI_OBLIGATION', 'MANUAL')),
  CONSTRAINT bank_recon_confirm_guard CHECK (match_status <> 'CONFIRMED' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)),
  CONSTRAINT bank_recon_reject_guard CHECK (match_status <> 'REJECTED' OR (rejected_by IS NOT NULL AND rejected_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_provider_account ON bank_accounts (provider, provider_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_date ON bank_transactions (bank_account_id, transaction_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_direction_date ON bank_transactions (direction, transaction_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_description ON bank_transactions USING gin (to_tsvector('simple', description));
CREATE INDEX IF NOT EXISTS idx_bank_recon_transaction_status ON bank_reconciliation_matches (bank_transaction_id, match_status);
CREATE INDEX IF NOT EXISTS idx_bank_recon_target_status ON bank_reconciliation_matches (target_type, target_id, match_status);
CREATE INDEX IF NOT EXISTS idx_bank_recon_job_status ON bank_reconciliation_matches (job_id, match_status);
