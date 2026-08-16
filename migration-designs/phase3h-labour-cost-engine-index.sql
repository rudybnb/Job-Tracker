-- Phase 3H — Labour Cost Calculation Engine (DESIGN + EXECUTION SOURCE)
-- Status: additive-only. Single guard index to prevent duplicate active
-- calculations for the same verified time record/version (rule 9).
-- Executed manually inside a single transaction on the live database on 2026-08-14
-- (see docs/phase-3h-run-log.md). Dormant; lives outside migrations/ so the
-- canonical loader ignores it.

CREATE UNIQUE INDEX IF NOT EXISTS labour_calc_time_record_version_unique
  ON labour_cost_calculations (time_record_id, calculation_version);