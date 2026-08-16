# Phase 3E-B Execution Run Log

Status: **COMPLETE — migration executed and verified on 2026-08-14.**

## Preconditions (Gate 0) — APPROVED by user 2026-08-14

1. Canonical client for Spencer House: **Promise Igbinedion**.
2. Client ownership model: `clients` is canonical; `jobs.client_id` is the canonical relationship; preserve `jobs.client_name = 'Promise'` as legacy/source text (do not delete or overwrite).
3. Financial cutover date: **2026-08-14**.

## Gate 1 — Snapshot (COMPLETE)

- Tool: Docker `postgres:18-alpine` (server is PG 18.3); local pg_dump 16.14 is version-incompatible with the Render server.
- Dump: custom-format full dump of `hbxl_tracker_db`.
- File (OUTSIDE repo): `C:\Users\rudyb\AppData\Local\Temp\opencode\p3eb\hbxl_pre_3eb_backup_20260814_150442.dump`
- Size: 175805 bytes
- SHA256: `66C1814DDED5F368548EA1689DC92F98194AB628A784F0335C97E1B83D882C73`
- Restore test: restored into throwaway `postgres:18-alpine` container with `--no-owner --no-privileges`.
  - Table count after restore: **41** (matches live pre-migration).
  - `jobs` rows: 1; `job_assignments` rows: 1 (data present).
  - Scratch container removed after verification.

## Gate 2 — Read-only dry-run recheck (COMPLETE)

- Read-only comparison against live DB (pre-migration): **0 deployed tables missing from schema; 41/41 column sets `[OK]`; 0 mismatched.**
- The four 3E-B targets confirmed absent live.
- `jobs.client_name` = `"Promise"` confirmed as the single legacy value.

## Gate 3 — Diff production (COMPLETE)

- `drizzle-kit generate` run into a **temporary out-dir** (NOT the repo `migrations/`) with a temp config, because the repo journal snapshot (0017) predates 3E-A; its baseline would include the 21 deployed tables.
- Generated probe was a full baseline (all 74 canonical tables). Destructive scan of probe: **0** DROP TABLE / DROP COLUMN / DROP INDEX / ALTER COLUMN / TRUNCATE / DELETE / UPDATE / CREATE TYPE.
- The 4 Phase 3E-B tables were added to `shared/schema.ts` (source of truth) with `jobs.client_id`. Drizzle-generated DDL for all 4 matched the §3 prepared SQL exactly (columns, types, defaults, indexes, FKs — including `jobs_client_id_clients_id_fk` nullable FK).
- Prepared migration `migration-designs/phase3eb-first-controlled-migration.sql` scanned: **12 statements, all additive** (4× CREATE TABLE IF NOT EXISTS, 1× ALTER TABLE ADD COLUMN IF NOT EXISTS, 7× CREATE/UNIQUE INDEX IF NOT EXISTS), **zero destructive statements**.
- Manifest updated: `clients` moved from `financialTablesCore` to canonical; `legacy_identity_crosswalk`, `financial_opening_balance_set`, `financial_opening_position` added to canonical. Total 85. `clients` DDL removed from `financialTablesCore` initializer (its `SERIAL` shape was wrong). Tests updated and passing (schema-bootstrap 40/40, plus financial-tables).

## Gate 4 — Staging rehearsal (COMPLETE)

- Dump restored into throwaway `postgres:18-alpine` container.
- Migration applied **twice**: pass 1 = 12 statements OK; pass 2 (idempotency) = 0 errors.
- Row counts unchanged: jobs=1, job_assignments=1. New tables all **0 rows**.
- `jobs.client_name` = `"Promise"` preserved; `jobs.client_id` nullable `uuid`.
- Table count after = 45 (41 + 4). Container removed.

## Gate 5 — Live execution (COMPLETE — COMMITTED)

- Executed 2026-08-14 via `scripts/.p3eb-gen/apply-live.mjs` using `postgres` `sql.begin()` (single connection, atomic COMMIT/ROLLBACK).
- First attempt: transaction **rolled back cleanly** due to a strict string-vs-number comparison in the in-tx verifier (`table_count` was returned as string `"45"`). Confirmed post-rollback state identical to pre-migration (0 new tables, no `client_id` column, jobs rows=1). Fixed the verifier to coerce with `Number()`.
- Second attempt: **COMMIT OK**.
  - PREFLIGHT: targets absent, jobs rows=1, client_name=["Promise"], client_id col absent.
  - 12/12 statements OK.
  - IN-TX VERIFY: table_count=45, jobs_rows=1, ja_rows=1, clients_rows=0, bal_rows=0, pos_rows=0, cw_rows=0, client_id_cols=1.
  - Transaction committed and re-verified.

## Gate 6 — Post-execution verification (COMPLETE)

- Re-ran read-only comparison: **45 deployed tables, 45/45 column sets `[OK]`, 0 drop risk, 0 mismatched.**
- All 41 original tables present (none dropped/altered).
- All 4 new tables present with exact §3/drizzle structure (columns, types, defaults, PKs, unique/index names, FKs).
- New tables all **0 rows** (no auto client seed, no opening positions, no crosswalk rows).
- `jobs.client_id` nullable `uuid` with FK `jobs_client_id_fkey REFERENCES clients(id)`.
- `jobs.client_name` = `"Promise"` preserved.

## Gate 7 — Rollback readiness (COMPLETE)

- Gate 1 dump retained at the location above until a full review cycle completes.
- Rollback SQL documented at `migration-designs/phase3eb-rollback.sql` (NOT executed): drops the 4 tables + `jobs.client_id`. Marked unsafe if post-execution features have written to them.

## Constraints honored

- No Monzo connection. No later finance phases started. No INSERT/UPDATE/DELETE performed (new tables left empty; `client_name` untouched). No commit/push/merge/deploy of code.
- Repository changes made (all staged-in-working-tree only): `shared/schema.ts`, `server/table-manifest.ts`, `server/financial-tables-core.ts`, `tests/schema-bootstrap.test.ts`, `tests/financial-tables.test.ts`, `docs/phase-3eb-migration-design.md`, `docs/phase-3eb-run-log.md`, `migration-designs/phase3eb-first-controlled-migration.sql`, `migration-designs/phase3eb-rollback.sql`.

## Known pre-existing issue (NOT caused by Phase 3E-B)

- `tests/integration-contractor-message.test.ts` "inbound contractor messages design is dormant" asserts 2 statements in the committed, unmodified `migration-designs/phase1c-step2-contractor-messages-inbound.sql`, but the file contains 5. This failure predates Phase 3E-B (no changes to `migration-designs/` phase1c files).