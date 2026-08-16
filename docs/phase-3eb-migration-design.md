# Phase 3E-B — First Controlled Migration Design

Status: **EXECUTED AND VERIFIED on 2026-08-14** (see `docs/phase-3eb-run-log.md` for the gate-by-gate record). The §3 prepared SQL was applied to the live database inside a single committed transaction; all four new tables are empty (no data written), `jobs.client_id` is `NULL` on all rows, and `jobs.client_name = 'Promise'` is preserved. Rollback SQL is at `migration-designs/phase3eb-rollback.sql` (not executed).

This document prepares the first controlled migration for Phase 3E-B. It is a design and prepared SQL script; **nothing in this document has been run against any database**. Execution requires an explicit Phase 3E-B decision and a database snapshot.

## 1. Scope

Phase 3E-B introduces only the minimum structures required to anchor a financial cutover without touching existing data:

1. `clients` — canonical client identity.
2. `jobs.client_id` — nullable FK from jobs to clients.
3. `legacy_identity_crosswalk` — reviewed mapping log from legacy identities to canonical identities.
4. `financial_opening_balance_set` — one controlled cutover.
5. `financial_opening_position` — cutover position detail.

Out of scope (later phases): `supplier`, `agency`, `labour_rate`, `approved_timesheet`, `labour_settlement`, `contractor_settlement`, `contractor_payments` (does NOT exist deployed and must NOT be created here), `supplier_payment`, client invoices/receipts, VAT/CIS periods, retention, bank evidence, and all Phase 2 migrations `0007`-`0017`.

## 2. Corrections carried from Phase 3C

- `contractor_payments` does **not** exist in the deployed database. Any contractor payment ledger is a later, deliberately introduced migration — never this one.
- The deployed `jobs` table has no `client_id` column and no `clients` table; those are added here as the Phase 3E-B minimum.
- `work_sessions` is deployed with 0 rows and no `contractor_id`/`job_id`; time-worker linking is a later phase and must not be added here.

## 3. Prepared SQL (additive only)

All statements below are additive (CREATE + ALTER ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS). No DROP, no TRUNCATE, no data modification, no column type change, no renaming of any deployed table or column.

### 3.1 `clients`

```sql
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  external_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS clients_name_unique ON clients (name);
```

Rationale: canonical client identity per foundation rules §6 and Phase 3D Step 1. `name` carries a unique index for safe matching. No pre-existing data is referenced because no `clients` table exists deployed.

### 3.2 `jobs.client_id` (nullable)

```sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);

CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON jobs (client_id);
```

Rationale: additive nullable FK; existing rows keep `NULL` until human-reviewed. Does not touch any existing column or value.

### 3.3 `legacy_identity_crosswalk`

```sql
CREATE TABLE IF NOT EXISTS legacy_identity_crosswalk (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table TEXT NOT NULL,
  source_key TEXT NOT NULL,
  target_entity TEXT,
  target_id TEXT,
  evidence TEXT,
  mapping_status TEXT NOT NULL DEFAULT 'UNRESOLVED',
  reviewer TEXT,
  reviewed_at TIMESTAMPTZ,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crosswalk_source ON legacy_identity_crosswalk (source_table, source_key);
CREATE INDEX IF NOT EXISTS idx_crosswalk_target ON legacy_identity_crosswalk (target_entity, target_id);
```

Rationale: records reviewed mappings (Phase 3D Step 1.7). `UNRESOLVED` means unmapped; no guessed backfills. "Spencer House"/"Promise" mapping is recorded here only after human review — never as an automatic `jobs.client_id` update.

### 3.4 `financial_opening_balance_set`

```sql
CREATE TABLE IF NOT EXISTS financial_opening_balance_set (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cutover_at TIMESTAMPTZ NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'GBP',
  source_reference TEXT,
  evidence_location TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  prepared_by TEXT,
  prepared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  completeness_statement TEXT,
  notes TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_opening_set_cutover_currency ON financial_opening_balance_set (cutover_at, currency_code);
```

### 3.5 `financial_opening_position`

```sql
CREATE TABLE IF NOT EXISTS financial_opening_position (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_balance_set_id UUID NOT NULL REFERENCES financial_opening_balance_set(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'GBP',
  position_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  direction TEXT,
  net_amount NUMERIC(14,2),
  tax_amount NUMERIC(14,2),
  gross_amount NUMERIC(14,2),
  amount_basis_status TEXT NOT NULL DEFAULT 'UNKNOWN_LEGACY',
  job_id TEXT,
  client_id UUID REFERENCES clients(id),
  contractor_id TEXT,
  supplier_id TEXT,
  bank_account_id TEXT,
  vat_period_id UUID,
  cis_period_id UUID,
  contract_package_id UUID,
  due_date DATE,
  external_reference TEXT,
  source_evidence TEXT,
  review_status TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opening_position_set ON financial_opening_position (opening_balance_set_id);
CREATE INDEX IF NOT EXISTS idx_opening_position_job ON financial_opening_position (job_id);
```

Rationale: matches foundation rules §4 (neutral non-negative `position_amount` + `direction`, optional proven net/tax/gross, `UNKNOWN_LEGACY` default) and Phase 3D §5.11 (tax-period/contract/retention link fields). All reference fields are nullable text/UUID placeholders — no new referenced tables are required in this migration.

## 4. Data changes — NONE

- No INSERT/UPDATE/DELETE in this migration.
- `jobs.client_id` is left `NULL`; the "Promise"/Spencer House mapping is only recorded in `legacy_identity_crosswalk` as a proposed, human-reviewed entry during execution (a design decision — not executed now).
- No opening positions are populated automatically. Every category is declared explicitly by a human, or explicitly declared not applicable.

## 5. Safety verification

Before any execution, run in order:

1. **Snapshot**: `pg_dump` of the deployed Render database (or Render backup).
2. **Read-only dry-run**: run `drizzle-kit push --dry` (or the equivalent generate + diff) and confirm the ONLY statements are the additive ones in §3, i.e.:
   - no `DROP TABLE`, `DROP COLUMN`, `DROP INDEX`, `ALTER COLUMN TYPE`, `TRUNCATE`, `DELETE`, `UPDATE`;
   - every deployed table and column already in `shared/schema.ts` (Phase 3E-A) produces zero diff.
3. **Diff review**: confirm the diff does not mention any deployed extra table, `jobs`/`job_assignments` extra columns, or integration/messaging tables.
4. Only then run the migration inside a transaction with a rollback plan.

## 6. Rollback

- `clients`, `legacy_identity_crosswalk`, `financial_opening_balance_set`, `financial_opening_position` can be dropped in a dedicated rollback migration (they are new, empty tables).
- `jobs.client_id` rollback = `ALTER TABLE jobs DROP COLUMN IF EXISTS client_id` plus index drop. Only safe if no post-execution feature writes to it.

## 7. Open decisions for Phase 3E-B

- Exact client row(s) to seed for "Promise" (human decision; one client row proposed).
- Whether `clients` belongs under the canonical migration path (recommended) vs the `financialTablesCore` initializer (NOT recommended — wrong shape: `id SERIAL`, different columns).
- Timing/cutover for the first opening-balance set (recommended: current date, `DRAFT`, explicitly zero/N/A categories).

## 8. Execution plan (NOT yet run — checklist only)

Every item below is a gate. Do not skip one. A red result at any gate halts execution and requires a re-plan before continuing.

### Gate 0 — Preconditions
- [ ] Confirm a human decision exists for each §7 item (client seed, ownership, cutover date). No default assumption allowed for the client row(s).
- [ ] Confirm the repository is at a known commit/tag and the working tree is clean for the files in scope (`shared/schema.ts`, `migrations/`, `docs/phase-3eb-migration-design.md`).
- [ ] Confirm who has permission to run DDL against the deployed Render database (owner account, not the app pooler).

### Gate 1 — Snapshot
- [ ] Take a full `pg_dump` of the deployed Render database (schema + data) to a location outside the repo (never committed).
- [ ] Record the dump filename, checksum, and timestamp in a run log.
- [ ] Verify the dump restores cleanly to a scratch database on a throwaway instance before any live action.

### Gate 2 — Read-only dry-run recheck
- [ ] Re-run the read-only schema comparison (the Phase 3E-A script) against the live DB and confirm:
  - 0 deployed tables missing from source;
  - all 41 deployed tables' columns still `[OK]`;
  - the four Phase 3E-B targets are still NOT deployed.
- [ ] Capture the dry-run output into the run log for the audit trail.

### Gate 3 — Diff production (no write)
- [ ] Run `drizzle-kit generate` locally against the canonical schema to produce the Phase 3E-B migration SQL.
- [ ] Compare generated SQL statement-by-statement against §3 prepared SQL. Allowed statements ONLY: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_id`, `CREATE INDEX IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`.
- [ ] Confirm zero occurrences of: `DROP TABLE`, `DROP COLUMN`, `DROP INDEX`, `ALTER COLUMN TYPE`, `TRUNCATE`, `DELETE`, `UPDATE`, `ALTER COLUMN ... SET DEFAULT` on any deployed column.
- [ ] Confirm the diff contains no statement touching any deployed extra table, `jobs`/`job_assignments` extra columns, or integration/messaging tables.

### Gate 4 — Staging rehearsal (optional but recommended)
- [ ] If a scratch/CI database is available, apply the migration there and re-run `tests/schema-bootstrap.test.ts` (manifest count 82) and `tests/financial-tables.test.ts`.
- [ ] Confirm zero data rows are affected in the staging copy (row counts identical before/after).

### Gate 5 — Live execution (single transaction)
- [ ] Begin a transaction (`BEGIN`).
- [ ] Execute the §3 statements in order: `clients` → `jobs.client_id` → `legacy_identity_crosswalk` → `financial_opening_balance_set` → `financial_opening_position`.
- [ ] Do NOT insert the proposed "Promise" client row automatically; at most record the mapping as `UNRESOLVED`/proposed in `legacy_identity_crosswalk` if a human has reviewed it.
- [ ] Do NOT create any opening positions; leave the balance set(s) `DRAFT` with explicit zero/N/A categories if created.
- [ ] Verify with read-only queries: new tables exist, `jobs.client_id` column exists and every existing row is `NULL`.
- [ ] Commit only after verification; otherwise `ROLLBACK`.

### Gate 6 — Post-execution verification
- [ ] Re-run the read-only comparison: now `clients`, `financial_opening_balance_set`, `financial_opening_position`, `legacy_identity_crosswalk` are the only new tables vs before, and no deployed table changed.
- [ ] Confirm the migration is recorded in the run log with timestamp, exec actor, statement list, and verification output.
- [ ] Decide and record whether a Git commit of the migration + design doc is wanted (only if the user asks; never auto-commit).

### Gate 7 — Rollback readiness
- [ ] Keep the Gate 1 dump until the migration has been live for a full review cycle.
- [ ] Record the rollback migration (DROP the four new tables + `ALTER TABLE jobs DROP COLUMN IF EXISTS client_id`) in the run log, unexecuted.

## 9. Run log template

| Field | Value |
| --- | --- |
| Date/time | |
| Exec actor | |
| Preconditions (§7 decisions) | |
| Dump filename + checksum | |
| Dry-run result | |
| Diff statement count / allowed | |
| Live begin/commit time | |
| Post-exec verification | |
| Rollback readiness | |
