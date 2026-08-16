# Phase 3I Run Log — Labour Review & Settlement Preparation

Date: 2026-08-14
Status: EXECUTED + VERIFIED on live Render PostgreSQL 18.3 (hbxl_tracker_db)

## 1. Intent

Connect the Phase 3H labour-cost engine into an admin operational workflow so
admins can run, review and correct labour calculations before any
settlement/payment phase: job-scoped rate resolution, a manual run trigger, a
read review API, and a minimum correction workflow. No payments, Monzo, CIS,
VAT, supplier invoices or contractor settlements are created.

## 2. Files changed (committed to working tree, NOT pushed)

- `shared/schema.ts`: `labourRates.jobId` (nullable varchar FK -> jobs) + index
  `idx_labour_rates_job`.
- `server/labour-cost-repository.ts`: job-scoped rate resolution with priority
  worker+job -> agency+job -> worker general -> agency general.
- `server/labour-cost-executor.ts` (new): `PostgresLabourCostExecutor` adapter.
- `server/labour-cost-review.ts` (new): read review repository + the two minimum
  correction ops (verify time record, create APPROVED rate).
- `server/labour-cost-routes.ts` (new): admin-only labour review router.
- `server/index.ts`: mounted the router path-scoped under `/api/labour`.
- `tests/labour-cost-engine.test.ts`: updated mock for job-scoped rate SQL + 4
  new job-scope priority tests.
- `tests/labour-cost-review-route.test.ts` (new): 11 route tests.
- `migration-designs/phase3i-labour-review.sql` (new): additive DDL executed live.

## 3. Job-scoped rate support

- `labour_rates.job_id` nullable. Existing general rates preserved untouched.
- Resolution priority (engine + repository):
  a. approved worker + job specific rate
  b. approved agency worker + job specific rate
  c. approved worker/agency general rate
- No fabricated rates: approval_status = APPROVED and rate_amount still required.

## 4. Manual calculation trigger

- POST /api/labour/calculations/run (admin-only via requireAdmin). Re-runs every
  VERIFIED labour_time_record through the Phase 3H engine inside one transaction
  and returns recordsProcessed + the resulting calculations.

## 5. Admin review workflow / API

- GET /api/labour/calculations?status=&jobId=&workerId=  (latest calculation per
  time record; RESOLVED / UNRESOLVED list with worker, job, payee, verified
  minutes, rate used, cost, version, unresolved_reason).
- GET /api/labour/calculations/:timeRecordId  (full version history).
- GET /api/labour/time-records?status=  (verified/unverified time records).
- POST /api/labour/time-records/:id/verify  (correction: set verified minutes +
  VERIFIED). Re-run trigger then produces a new versioned calculation.
- POST /api/labour/rates  (correction: create an APPROVED job-scoped or general
  rate for a worker or agency). Re-run trigger then re-resolves.
- Workflow: run -> review UNRESOLVED + reason -> correct (verify time / create
  approved rate) -> re-run trigger -> new version rows.

## 6. Unresolved handling

Unresolved reasons surfaced in the review list: WORKER_UNRESOLVED, JOB_UNRESOLVED,
PAYEE_UNRESOLVED, TIME_UNVERIFIED, TIME_INVALID, RATE_UNRESOLVED, RATE_NOT_APPROVED,
RATE_AMOUNT_UNRESOLVED, DAY_BASIS_UNRESOLVED. calculated_cost stays NULL for
UNRESOLVED rows (calc_resolved_cost_check).

## 7. Recalculation behaviour

Append-only versioning. Corrections never edit historical RESOLVED rows: the run
trigger writes a new calculation_version whenever the outcome changes
(outcomesEquivalent no-op guard). Unique index (time_record_id, calculation_version)
prevents duplicate active calculations.

## 8. Tests run

- tests/labour-cost-engine.test.ts: 33/33 pass (added job-scope priority: worker
  job beats worker general, agency job beats agency general, worker general beats
  agency general, no rate => RATE_UNRESOLVED).
- tests/labour-cost-review-route.test.ts: 11/11 pass (admin guard, listing,
  filters, version history, verify, rate creation validation).
- Full necessary set: schema-bootstrap + financial-tables + simple-init-safety:
  95/95 pass.
- npm run check: no errors in any labour-cost file (pre-existing repo-wide
  failures elsewhere untouched).

## 9. Live DB changes

- ALTER TABLE labour_rates ADD COLUMN IF NOT EXISTS job_id VARCHAR REFERENCES jobs(id);
- CREATE INDEX IF NOT EXISTS idx_labour_rates_job ON labour_rates (job_id);
- Executed in a single transaction. Verified: 53 tables, job_id column + index
  present, labour_rates=0 / labour_time_records=0 / labour_cost_calculations=0
  (no data altered).

## 10. Snapshots

- Pre:  hbxl_pre_3ii_backup_20260814_180406.dump
  SHA256 A602245A392DE1F783A9F0CD91AE11C567E3F6E512C9437C88A4DCE876C14D66
- Post: hbxl_post_3ii_backup_20260814_180520.dump
  SHA256 7913D7123C880AB0D23DA47E53D9347F3946721EBEC3E436CA261D0B8A3AFDD8

## 11. Notes / limitations

- The run trigger is a synchronous request; large batches should later move to a
  background job. Review UI screens are a later phase. Temp scripts under
  scripts/.p3i-temp/ deleted after use.