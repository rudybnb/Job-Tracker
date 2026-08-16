# Phase 3H Run Log — Labour Cost Calculation Engine

Date: 2026-08-14
Status: EXECUTED + VERIFIED on live Render PostgreSQL 18.3 (hbxl_tracker_db)

## 1. Intent

Implement the minimum calculation engine/repository that converts VERIFIED
`labour_time_records` into auditable, versioned `labour_cost_calculations` for
agency labour (B) and direct self-employed labour (C). Supply-and-fit
subcontractors remain outside the clock-based calculation. No payments, Monzo,
CIS, VAT, supplier invoices or settlements are created.

## 2. Files changed (committed to working tree, NOT pushed)

- `server/labour-cost-engine.ts` (new): pure, dependency-free calculation rules —
  `calculateLabourCost`, `outcomesEquivalent`, reason codes.
- `server/labour-cost-repository.ts` (new): SQL resolution + versioned persistence —
  `calculateAndPersistTimeRecord`, `processVerifiedTimeRecords`, with an injectable
  `LabourCostExecutor`/`LabourCostTransaction` for testability.
- `tests/labour-cost-engine.test.ts` (new): 29 focused tests.
- `shared/schema.ts`: added `uniqueIndex("labour_calc_time_record_version_unique")`
  on `(time_record_id, calculation_version)` (rule 9).
- `migration-designs/phase3h-labour-cost-engine-index.sql` (new): the additive guard
  index, executed live.

## 3. Engine rules implemented

- HOURLY: cost = verified_payable_minutes / 60 x approved rate_amount.
- DAILY:  cost = verified_payable_minutes / standard_day_minutes x approved
  rate_amount. No assumed day length; missing/non-positive standard_day_minutes
  => UNRESOLVED (DAY_BASIS_UNRESOLVED).
- Resolved prerequisites (worker, job, payee, approved rate with amount) — any
  missing => UNRESOLVED with a specific unresolved_reason. Nothing fabricated.
- Only time_status='VERIFIED' records are processed; unverified => UNRESOLVED
  (TIME_UNVERIFIED). Invalid minutes => UNRESOLVED (TIME_INVALID).
- Rounding: half-away-from-zero on integer cents (matches Postgres numeric rounding).

## 4. Resolution logic

- Direct self-employed: worker is payee (payees payee_type='WORKER'); uses the
  worker's approved labour_rate effective on the work date.
- Agency: worker supplies the time; payee is the agency's supplier (payees
  payee_type='SUPPLIER' via agencies.supplier_id); prefers a worker-specific
  approved rate, falling back to the agency-level approved rate, both effective
  on the work date.

## 5. Versioning / auditability

- Each change writes a NEW calculation_version row; historical RESOLVED rows are
  never overwritten (append-only).
- Identical re-runs produce no new row (outcome-equivalence check).
- Snapshot of rate id/type/amount/day-basis/currency + source_evidence retained.
- Guard index `labour_calc_time_record_version_unique` prevents duplicate active
  calculations for the same time record/version.

## 6. DDL change (single additive index)

- `migration-designs/phase3h-labour-cost-engine-index.sql`:
  `CREATE UNIQUE INDEX IF NOT EXISTS labour_calc_time_record_version_unique
   ON labour_cost_calculations (time_record_id, calculation_version);`
- Pre-validated in a scratch `postgres:18-alpine` container restored from the
  pre-3H dump: index created; duplicate (record, version) insert rejected with the
  unique violation; version 2 insert allowed.
- Executed live in a single transaction on 2026-08-14.

## 7. Verification

- Tables remain 53 (no new tables).
- `labour_calc_time_record_version_unique` present in `pg_indexes`.
- Existing data unchanged: jobs=1, clients=1, work_sessions=0, labour_time_records=0,
  labour_cost_calculations=0, labour_rates=0, workers=0.

## 8. Tests run

- `tests/labour-cost-engine.test.ts`: 29/29 pass (hourly/daily self-employed,
  hourly/daily agency incl. agency-rate fallback, missing rate, missing day basis,
  missing payee, missing worker/job, unverified blocked, invalid minutes, versioning,
  duplicate-version guard, no fabricated rates).

## 9. Snapshots

- Pre: `hbxl_pre_3hh_backup_20260814_174146.dump`
  SHA256 `C189710D24D13C889D31597F9D79CB5CB6EAB0353105EDC584F7C8B6F02F96D9`
- Post: `hbxl_post_3hh_backup_20260814_174430.dump`
  SHA256 `83E09579D23FBD305FE9E3710BCDFAEC102C56098C771E7C7D7533358F668C3C`

## 10. Notes / limitations

- labour_rates has no job scoping; "agency worker/job relationship" is currently
  modelled as agency-worker relationship with a worker- or agency-level approved
  rate effective on the work date. Job-scoped rates are a future refinement.
- The engine/repository are not yet wired into any route or scheduled job; that is
  left to a later phase. Temp scripts under `scripts/.p3h-temp/` deleted after use.