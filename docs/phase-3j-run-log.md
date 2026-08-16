# Phase 3J — Labour Verification & Review UI — Run Log

Date: 2026-08-14

## Scope
Minimal admin UI for the Phase 3I labour workflow built on the existing Phase 3H/3I
engine + APIs. No payments, Monzo, CIS, VAT, invoices or settlements. No background
queues or schedulers. Synchronous manual calculation trigger retained.

## Files changed
- `server/labour-cost-review.ts` — added `RejectTimeRecordInput` + `rejectTimeRecord`
  operation (sets REJECTED, clears payable minutes, records decider + note); verify
  now also records an optional note.
- `server/labour-cost-routes.ts` — verify route accepts optional `note`;
  new `POST /api/labour/time-records/:id/reject` (admin-only).
- `tests/labour-cost-review-route.test.ts` — in-memory repo implements
  `rejectTimeRecord`; new route test for reject (incl. optional note + 404).
- `client/src/pages/admin-labour-verification.tsx` (new) — time verification screen:
  status filter (UNVERIFIED/VERIFIED/REJECTED), worked-time display from clock-in/out,
  VERIFY (with payable minutes + optional note) and REJECT (with optional reason)
  actions via dialogs.
- `client/src/pages/admin-labour-review.tsx` (new) — calculation review screen:
  RESOLVED/UNRESOLVED/PENDING/ERROR filter, worker/job/payee/payable minutes/rate/cost,
  "Run calculations" button (`POST /api/labour/calculations/run`), "Add rate" correction
  dialog (`POST /api/labour/rates`, worker + optional job scope, HOURLY/DAILY with day
  basis), and per-record version history dialog.
- `client/src/App.tsx` — registered `/admin-labour-verification` and
  `/admin-labour-review` (admin-protected).
- `client/src/pages/admin-dashboard.tsx` — added "Time Verify" and "Labour Review"
  quick-action buttons.

## Verification
- Tests: `labour-cost-engine` (33) + `labour-cost-review-route` (12) + schema-bootstrap,
  financial-tables, simple-init-safety (51) = **96/96 pass**.
- `npm run check` (tsc): zero errors in any changed file (labour-cost-*, App.tsx,
  admin-dashboard.tsx, new pages). Existing 215-error baseline is unrelated/pre-existing.
- `vite build` from repo root: **build succeeds** (2074 modules).

## Live database changes
None. Phase 3J is UI-only; the existing live schema (53 tables, `labour_rates.job_id`
+ `idx_labour_rates_job`, guard index) is unchanged.

## Data note
Live DB has no labour time records/rates/calculations yet (0 rows each), so the screens
render the empty states until clock-in/out data exists.
