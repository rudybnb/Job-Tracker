# Phase 3G Run Log — Verified Time & Labour Cost Calculation Foundation

Date: 2026-08-14
Status: EXECUTED + VERIFIED on live Render PostgreSQL 18.3 (hbxl_tracker_db)

## 1. Intent

Add the minimum structures to convert verified clock-in/out time into labour cost for
agency labour (B) and direct self-employed labour (C). Supply-and-fit subcontractors
(rule A) remain outside the clock-based calculation. No payments, Monzo, CIS, VAT,
supplier invoices, contractor settlements or "paid" treatment happen in this phase.

## 2. Source of truth updates (committed to working tree, NOT pushed)

- `shared/schema.ts`:
  - `labourRates` gained nullable `standardDayMinutes` (integer) — approved day basis
    required for DAILY rates (rule 5).
  - Added enums `labourTimeStatusEnum` (UNVERIFIED/VERIFIED/REJECTED) and
    `labourCalculationStatusEnum` (PENDING/RESOLVED/UNRESOLVED/ERROR).
  - Added `labourTimeRecords` (14 cols) — verified timesheet linked to `work_sessions`
    evidence with `verifiedPayableMinutes` and verification status.
  - Added `labourCostCalculations` (21 cols) — reproducible snapshot (rate type/amount,
    day basis, payee, verified minutes, status, unresolved reason, calculated cost,
    version) with `calc_resolved_cost_check` (RESOLVED requires a cost).
- `server/table-manifest.ts`: canonical 80 -> 82 (2 new tables); total 91 -> 93.
- `tests/schema-bootstrap.test.ts`: total assertion 91 -> 93.

## 3. DDL design + probe

- `migration-designs/phase3g-verified-time-labour-cost.sql`: additive-only, 13 statements:
  2 guarded enum `DO $$` blocks, 1 `ALTER TABLE labour_rates ADD COLUMN IF NOT EXISTS
  standard_day_minutes`, 2 `CREATE TABLE`, 3 + 5 indexes. Zero DROP/TRUNCATE/DELETE/
  UPDATE/ALTER COLUMN TYPE.
- drizzle-kit probe generated into `scripts/.p3g-temp/probe-out` (temp, not applied);
  column/FK/index shapes confirmed against the design.
- DDL validated in a scratch `postgres:18-alpine` container restored from the pre-3G
  dump: applied cleanly, produced 53 tables, new cols/enums present, existing data intact.

## 4. Snapshot before change

`hbxl_pre_3gg_backup_20260814_173006.dump`
SHA256 `C6FE943FA1C0B97D68A2569042E1EEB9DCE56FCB5033E12C0C69EB73CC8F097D`
Restore-tested in scratch: 51 tables, matching live.

## 5. Execution

Ran `scripts/.p3g-temp/execute.mjs` against live DB: single `sql.begin()` transaction,
13 statements, all OK, COMMIT confirmed. No time records or cost calculations were
inserted; both new tables remain empty.

## 6. Verification (all passed)

- Tables: 51 -> 53 (labour_time_records, labour_cost_calculations).
- New tables: 0 rows each (no fabricated calculations).
- `labour_time_records`: 14 cols; `labour_cost_calculations`: 21 cols.
- `labour_rates.standard_day_minutes` integer added (nullable).
- Existing data unchanged: jobs=1, clients=1, job_assignments=1, contractors=1,
  contractor_applications=2, financial_opening_balance_set=1, work_sessions=0,
  labour_rates=0, workers=0, payees=0.
- Enums: 16 total = 14 pre-existing + 2 new (labour_time_status, labour_calculation_status).
- Check constraint `calc_resolved_cost_check` present.
- Tests: schema-bootstrap + financial-tables + simple-init-safety = 51/51 pass.

## 7. Snapshot after change

`hbxl_post_3gg_backup_20260814_173307.dump`
SHA256 `C5542F0F23EDEE1CFA7812A87145DCB6D76877C475A153499F3F8A26C503C838`

## 8. Notes / limitations

- Calculation rules (hourly = verified minutes/60 x approved rate; daily requires an
  approved standard_day_minutes basis) are encoded as data model constraints only; the
  calculation engine/repository is a future phase.
- `calculation_status` defaults PENDING; UNRESOLVED/ERROR capture incomplete identity,
  rate or day-basis. `calc_resolved_cost_check` guarantees RESOLVED always carries cost.
- No payment, Monzo, CIS, VAT, invoice or settlement activity was performed.
- Scratch container `p3g-restore-test` was removed. Temp scripts under
  `scripts/.p3g-temp/` deleted after use.