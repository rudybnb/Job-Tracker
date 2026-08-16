# Phase 3E-C Execution Run Log

Status: **COMPLETE — controlled live-data setup executed and verified on 2026-08-14.**

## Approved facts (user)
- Canonical client: **Promise Igbinedion**
- Existing job: **Spencer House** (`id=9477fff9-c549-4080-a7a4-f0ba6e27a9c0`)
- Existing legacy `jobs.client_name = "Promise"` must remain unchanged
- Financial cutover date: **2026-08-14**

## 1. Snapshot / pre-write safety (COMPLETE)

- Tool: Docker `postgres:18-alpine` (server is PG 18.3).
- Dump (OUTSIDE repo): `C:\Users\rudyb\AppData\Local\Temp\opencode\p3ec\hbxl_pre_3ec_backup_20260814_165006.dump`
- Size: 185901 bytes; SHA256: `DB559F7B7593BF544D6B00AB287D36213BB99A88F115AFFE33D8D97DB32866C8`
- Restore test: restored into throwaway `postgres:18-alpine` container → 45 tables, `clients`=0, `financial_opening_balance_set`=0, `jobs.client_name`="Promise". Container removed.
- Read-only pre-check (live): 1 job (Spencer House, `client_name`="Promise", `client_id`=null); `clients`=0, `legacy_identity_crosswalk`=0, `financial_opening_balance_set`=0, `financial_opening_position`=0; tables=45.

## 2. Write transaction (COMPLETE — COMMITTED)

Single transaction (`sql.begin`, atomic commit/rollback). Only the minimum INSERT/UPDATE statements.

1. `INSERT INTO clients (name) VALUES ('Promise Igbinedion')` → `id=8bbdacb0-90e4-4f83-af57-de2afd8604ff`
2. `UPDATE jobs SET client_id = <client id> WHERE id = <Spencer House job>` — `client_name` untouched.
3. `INSERT INTO financial_opening_balance_set (cutover_at, currency_code, status, source_reference, notes)` → `cutover_at='2026-08-14 00:00:00+00'`, `currency='GBP'`, `status='APPROVED'`, notes record no evidenced amounts.
4. `INSERT INTO legacy_identity_crosswalk (source_table='jobs', source_key=<job id>, target_entity='clients', target_id=<client id>, evidence, mapping_status='APPROVED', reason)` tracing legacy "Promise" to Promise Igbinedion.
5. **No** `financial_opening_position` writes (zero fabricated balances).

In-transaction verification passed before COMMIT: clients=1, balance_set=1, positions=0, crosswalk=1, job linked, `client_name`="Promise".

## 3. Post-execution verification (COMPLETE — independent read-only)

- Exactly one client: `Promise Igbinedion` (count=1). ✔
- Spencer House `jobs.client_id` = `8bbdacb0-…` (matches the client). ✔
- `jobs.client_name` = `"Promise"` unchanged. ✔
- One `financial_opening_balance_set` for 2026-08-14 (GBP, APPROVED). ✔
- `financial_opening_position` = 0 rows (no fabricated positions). ✔
- One `legacy_identity_crosswalk` record (jobs→clients, APPROVED). ✔
- Table count = 45 (unchanged); `jobs`=1, `job_assignments`=1; spot-checked extra tables unchanged (contractors=1, packages=0, rooms=266, extracted_elements=885, etc.). ✔

## Constraints honored

- No schema changes, no migrations, no `db:push`, no Monzo connection, no VAT/CIS/payment work, no unrelated code changes, no commit/push/merge/deploy.
- Temp scripts created under `scripts/.p3ec-temp/` and deleted after use.