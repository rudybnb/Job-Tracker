-- Phase 3M — Client Receivables Foundation (DESIGN + EXECUTION SOURCE)
-- Status: additive-only. Contains zero DROP/TRUNCATE/DELETE/ALTER COLUMN TYPE.
-- Apply to live only after snapshot, restore-test, and scratch rehearsal.
--
-- Sculpt Projects is currently NOT VAT registered:
--   - VAT remains inactive by default.
--   - Current receivables must not add VAT under NOT_REGISTERED_INACTIVE.
--   - The structure is VAT-ready for a future registration phase.
-- No payments, Monzo, bank transactions, VAT activation or CIS submission.

CREATE TABLE IF NOT EXISTS client_receivable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE RESTRICT,
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  reference TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'GBP',
  net_amount NUMERIC(14,2) NOT NULL,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross_amount NUMERIC(14,2) NOT NULL,
  amount_received NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  vat_status TEXT NOT NULL DEFAULT 'NOT_REGISTERED_INACTIVE',
  source_evidence TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_receivable_reference_unique UNIQUE (job_id, reference),
  CONSTRAINT client_receivable_amounts_nonnegative CHECK (net_amount >= 0 AND vat_amount >= 0 AND gross_amount >= 0 AND amount_received >= 0),
  CONSTRAINT client_receivable_gross_reconciles CHECK (gross_amount = net_amount + vat_amount),
  CONSTRAINT client_receivable_received_cap CHECK (amount_received <= gross_amount),
  CONSTRAINT client_receivable_due_date_guard CHECK (due_date IS NULL OR due_date >= invoice_date),
  CONSTRAINT client_receivable_status_check CHECK (status IN ('DRAFT', 'ISSUED', 'PART_RECEIVED', 'RECEIVED', 'DISPUTED', 'CANCELLED')),
  CONSTRAINT client_receivable_vat_status_check CHECK (vat_status IN ('NOT_REGISTERED_INACTIVE', 'VAT_READY_FUTURE')),
  CONSTRAINT client_receivable_vat_inactive_guard CHECK (vat_status <> 'NOT_REGISTERED_INACTIVE' OR vat_amount = 0)
);

CREATE INDEX IF NOT EXISTS idx_client_receivable_job_status ON client_receivable (job_id, status);
CREATE INDEX IF NOT EXISTS idx_client_receivable_client ON client_receivable (client_id);
CREATE INDEX IF NOT EXISTS idx_client_receivable_due_date ON client_receivable (due_date);
