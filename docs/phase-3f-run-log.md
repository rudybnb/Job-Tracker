# Phase 3F Run Log — Worker, Agency & Time-Cost Foundation

Date: 2026-08-14
Status: EXECUTED + VERIFIED on live Render PostgreSQL 18.3 (hbxl_tracker_db)

## 1. Intent

Add minimum canonical structures for worker/agency/time-cost, without any wage/payment
calculation and without fabricating rates. Supply-and-fit subcontractors (business rule A)
remain contract/quotation/invoice based — represented by `contractors` and
`contractor_applications`. Agency labour (B) and direct self-employed labour (C) are the
clocked workers this phase enables; cost derivation is deferred to a later phase and must
use verified clock-in/out time and approved rates only.

## 2. Source of truth updates (committed to working tree, NOT pushed)

- `shared/schema.ts`: added `workerTypeEnum`, `supplierTypeEnum`, `labourRateTypeEnum`,
  `rateApprovalStatusEnum`, `payeeTypeEnum` and six pgTable structures — `suppliers`,
  `agencies`, `workers`, `agencyWorkers`, `labourRates`, `payees`. Extended `workSessions`
  with five nullable FKs: `jobId`, `workerId`, `contractorId`, `supplierId`, `payeeId`.
  Legacy text fields `contractor_name` / `job_site_location` remain untouched.
- `server/table-manifest.ts`: canonical list 74 -> 80 (6 new tables); total 85 -> 91.
- `tests/schema-bootstrap.test.ts`: total assertion 85 -> 91.

## 3. DDL design + probe

- `migration-designs/phase3f-worker-agency-timecost.sql`: additive-only, 26 statements:
  5 guarded enum `DO $$` blocks, 6 `CREATE TABLE`, 1 + 1 + 1 unique/index sets,
  5 `ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS`, 5 indexes. Zero DROP/TRUNCATE/
  DELETE/UPDATE/ALTER COLUMN TYPE.
- drizzle-kit probe generated into `scripts/.p3f-temp/probe-out` (temp, not applied) to
  cross-check column/FK/index shapes; schema snapshot in probe meta confirms enum columns.
- DDL validated in a scratch `postgres:18-alpine` container restored from the pre-3F
  dump: applied cleanly, produced 51 tables, 5 new work_sessions cols, 5 new enums.

## 4. Snapshot before change

`hbxl_pre_3ef_backup_20260814_171440.dump`
SHA256 `DC119AF2B218DB50CA01D2894E2CDD14AEF90C803AC2B4EAAB1F8138D823CCC6`
Restore-tested in scratch: 45 tables, matching live.

## 5. Execution

Ran `scripts/.p3f-temp/execute.mjs` against live DB: single `sql.begin()` transaction,
26 statements, all OK, COMMIT confirmed. No rate/pay data written; all six new tables
remain empty.

## 6. Verification (all passed)

- Tables: 45 -> 51 (6 new: suppliers, agencies, workers, agency_workers, labour_rates, payees).
- New tables: all 0 rows.
- `work_sessions`: 17 columns (12 original + 5 new nullable links), 0 rows;
  `contractor_name` and `job_site_location` remain NOT NULL.
- Existing data unchanged: jobs=1, clients=1, job_assignments=1, contractors=1,
  contractor_applications=2, financial_opening_balance_set=1, legacy_identity_crosswalk=1.
- Enums: 14 total = 9 pre-existing + 5 new (labour_rate_type, payee_type,
  rate_approval_status, supplier_type, worker_type).
- Tests: schema-bootstrap + financial-tables + simple-init-safety = 51/51 pass.

## 7. Snapshot after change

`hbxl_post_3ef_backup_20260814_172124.dump`
SHA256 `A8B31C7348BAF52A5972C8DD2D5593A1FB8FA054EEFC05049FE23FD7428766FE`

## 8. Notes / limitations

- No wages, payments, CIS/VAT/settlement, or invoice derivation was performed.
- `labour_rates.rate_amount` is nullable; existing null `admin_pay_rate` values remain
  UNKNOWN. Approved-rate entry is a later, separate work stream.
- Future payable time must come from verified clock-in/out (`work_sessions`), not from
  scheduled hours.
- Scratch containers `p3f-type-test`, `p3f-ddl-test`, `p3f-restore-test` were removed.
  Temp scripts under `scripts/.p3f-temp/` deleted after use.