-- Phase 3I — Labour Review & Settlement Preparation (DESIGN + EXECUTION SOURCE)
-- Status: additive-only. Contains zero DROP/TRUNCATE/DELETE/UPDATE/ALTER COLUMN TYPE.
-- Executed manually inside a single transaction on the live database on 2026-08-14
-- (see docs/phase-3i-run-log.md). This file is dormant; the canonical migration
-- loader must NOT pick it up (it lives outside migrations/).
--
-- Business rules honoured:
--   1. labour_rates may optionally be scoped to a single job (job_id nullable).
--   2. Rate resolution priority: approved worker+job specific > approved agency
--      worker+job specific > approved worker/agency general rate.
--   3. Existing general rates are preserved untouched.
--   4. No fabricated rates — approval_status + rate_amount are still required.
-- No wage/payment, Monzo, CIS, VAT, supplier invoice or settlement is created here.

-- 6.1 job-scoped labour rates (nullable FK; additive)
ALTER TABLE labour_rates ADD COLUMN IF NOT EXISTS job_id VARCHAR REFERENCES jobs(id);

CREATE INDEX IF NOT EXISTS idx_labour_rates_job ON labour_rates (job_id);
