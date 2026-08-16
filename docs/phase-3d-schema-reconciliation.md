# Phase 3D — Schema Reconciliation & Safe Finance Design

## 1. Context

This design combines the Phase 3B source-code audit (`docs/financial-schema-audit.md`), the Phase 3C live database inspection, and the approved foundation rules (`docs/financial-foundation-rules.md`) and control model (`docs/company-financial-control-model.md`).

The deployed Render database is **pre-Phase-2**: migrations 0007-0017 have never been applied. No `drizzle` migration journal exists. The deployed schema has 41 public tables, of which only 3 contain real operational data (`extracted_elements`: 885 rows, `rooms`: 266 rows, `job_files`: 63 rows), plus 1 job, 1 contractor, 2 contractor applications, and 1 job assignment. `work_sessions` has 0 rows.

Nothing in this phase changes the database. This is a design and plan only.

## 2. Structures To Preserve

### 2.1 Deployed extra tables not in source code (15 tables)

These tables were created outside the migration system. They must not be dropped or overwritten.

| Table | Rows | FK chain | Decision |
| --- | --- | --- | --- |
| `extracted_elements` | 885 | `jobs.id` (no FK constraint, nullable `job_id`) | Preserve — real IFC/PDF extraction data for Spencer House |
| `rooms` | 266 | `jobs.id` (no FK constraint, nullable `job_id`) | Preserve — real room geometry data for Spencer House |
| `job_files` | 63 | `jobs.id` (no FK constraint, nullable `job_id`) | Preserve — real uploaded files for Spencer House |
| `room_elements` | 0 | `rooms.id` (no FK) | Preserve — structure for room-level element breakdown |
| `packages` | 0 | `jobs.id` (no FK) | Preserve — parallel package model; reconcile with `contract_package` later |
| `package_items` | 0 | `packages.id` (CASCADE) | Preserve — items within packages with pricing fields |
| `job_cost_items` | 0 | `jobs.id` (NO ACTION) | Preserve — cost items with `cost_category` enum [LABOUR, MATERIAL, PLANT, SUBCONTRACTOR] |
| `payable_items` | 0 | none | Preserve — future payable model with HBXL source phase |
| `tender_requests` | 0 | `jobs.id` (NO ACTION) | Preserve — tender request headers |
| `tender_request_contractors` | 0 | `tender_requests.id` (CASCADE) | Preserve — contractor invitations to tender |
| `tender_submissions` | 0 | `tender_requests.id` (CASCADE) | Preserve — contractor submission headers |
| `tender_submission_items` | 0 | `tender_submissions.id` + `package_items.id` (CASCADE) | Preserve — submission line items |
| `assignment_pricing_baseline` | 0 | `job_assignments.id` + `package_items.id` (CASCADE) | Preserve — assignment-to-package-item pricing |
| `assignment_tender_items` | 0 | `job_assignments.id` + `package_items.id` (CASCADE) | Preserve — assignment-to-package-item tender items |
| `conversation_history` | 0 | none | Preserve — Telegram conversation log |

These tables form a parallel IFC/estimating/tendering model. The Phase 2 canonical tables (`contract_package`, `contractor_tender_rate`, etc.) serve a different, more rigorous procurement and valuation purpose. A future reconciliation phase must decide whether to bridge or retire these extra tables, but that decision is outside Phase 3D.

### 2.2 Jobs extra columns (10 columns not in shared/schema.ts)

| Extra column | Type | Decision |
| --- | --- | --- |
| `external_code` | text | Preserve — may serve an external integration |
| `project_type` | text | Preserve |
| `address` | text | Preserve |
| `postcode` | text | Preserve |
| `quoted_amount` | text | Preserve — but remain `UNKNOWN/AMBIGUOUS` amount basis |
| `financial_summary` | text | Preserve |
| `external_job_key` | text | Preserve — external identity |
| `external_source` | text default `'AG_8000'` | Preserve |
| `external_manifest_path` | text | Preserve |
| `budget_ledger` | text | Preserve |

These must be added to `shared/schema.ts` so a future `db:push` does not attempt to drop them.

### 2.3 Job_assignments extra columns

| Extra column | Type | Decision |
| --- | --- | --- |
| `job_id` | text nullable (NULL in existing row) | Preserve — will get FK later via crosswalk |
| `tender_status` | text default `'DRAFT'` | Preserve |
| `assigned_packages` | text[] nullable | Preserve |

### 2.4 Existing base tables (deployed)

These 20 tables from migration 0000 exist and match `shared/schema.ts`: `jobs`, `contractors`, `contractor_applications`, `work_sessions`, `temporary_departures`, `job_assignments`, `task_progress`, `admin_inspections`, `task_inspection_results`, `contractor_reports`, `contractor_replies`, `inspection_notifications`, `admin_settings`, `csv_uploads`, `project_master`, `project_cashflow_weekly`, `material_purchases`, `calendar_events`, `email_records`, `meetings`.

These 6 tables exist in the deployed DB (from migrations 0001-0005) but are **NOT declared in `shared/schema.ts`**: `contractor_messages`, `integration_shadow_receipts`, `integration_shadow_changes`, `integration_shadow_reviews`, `integration_project_mapping`, `integration_change_order_applications`. They are migration-only DDL listed in the table ownership manifest but have no Drizzle `pgTable` definition. They are at equal risk from a naive `db:push` as the 15 extra tables and must be included in the Step 0 schema-sync scope.

## 3. Source Tables/Migrations Still Needed

### 3.1 Migrations already applied (do not re-run)

| Migration | Tables created | Status in deployed DB |
| --- | --- | --- |
| `0000_handy_harrier` | 20 base tables + 5 enums | Applied (all present) |
| `0001_phase1a_shadow_storage` | `integration_shadow_receipts`, `integration_shadow_changes` | Applied |
| `0002_phase1b_review_storage` | `integration_shadow_reviews` | Applied |
| `0003_phase1b_application_storage` | `integration_project_mapping`, `integration_change_order_applications` | Applied |
| `0004/0005_phase1c_contractor_messages` | `contractor_messages` (created + altered) | Applied |
| `0006_operational_jobs_client_name` | `jobs.client_name` column | Applied |

### 3.2 Migrations NOT applied — needed but NOT blindly

| Migration | Tables | Need | Collision risk |
| --- | --- | --- | --- |
| `0007_phase2a` | `project_source_import`, `work_area` | Yes — source import chain | None — no conflict |
| `0008_phase2b` | `drawing_object`, `physical_wall`, `wall_surface`, `opening` | Yes — drawing structure | Possible conceptual overlap with `extracted_elements` / `rooms` / `room_elements` but no table name collision |
| `0009_phase2c` | `hbxl_resource_baseline` | Yes — original budget | None |
| `0010_phase2d` | `measurable_work_item`, `work_item_source_link`, `work_item_hbxl_resource_link` | Yes — operational work items | None |
| `0011_phase2e1` | `contract_package`, `contractor_tender_rate`, `contractor_tender_rate_work_item_link` | Yes — contractor commitments | **Possible collision with deployed `packages` table** — different name but same conceptual role; must decide whether to bridge or keep separate |
| `0012_phase2e2a` | `work_progress`, `contractor_claim`, `contractor_claim_line`, `inspection_decision` | Yes — progress/claims | None |
| `0013_phase2e2b` | `contractor_valuation`, `contractor_valuation_line` | Yes — approved work value | None |
| `0014_phase2l` | `contractor_payments` | Yes — actual cash | None |
| `0015_phase2m` | `procurement_requirement`, `supplier_quote`, `supplier_quote_line` | Yes — procurement | None |
| `0016_phase2n` | `purchase_order`, `purchase_order_line` | Yes — PO commitments | None |
| `0017_phase2o` | `goods_receipt`, `goods_receipt_line`, `supplier_invoice`, `supplier_invoice_line` | Yes — supplier invoices | None |

### 3.3 Initializer tables NOT in deployed DB — needed under canonical control instead

| Table | Created by | Need | Decision |
| --- | --- | --- | --- |
| `clients` | `financial-tables-core.ts` | Yes — client identity | Create via canonical migration, NOT initializer |
| `job_phases` | `financial-tables-core.ts` | Later — phase hierarchy | Create via canonical migration if needed |
| `sub_phases` | `financial-tables-core.ts` | Later | Same |
| `contractor_types` | `financial-tables-core.ts` | Later | Same |
| `phase_assignments` | `financial-tables-core.ts` | Later | Same |
| `milestones` | `financial-tables-core.ts` | Later | Same |
| `expenses` | `financial-tables-core.ts` | Later — non-procurement costs | Create via canonical migration if needed; must resolve conflicting source definitions first |
| `work_hours` | `financial-tables-core.ts` | Decision needed | Consolidate with `work_sessions` rather than creating a second time model |
| `materials_catalog` | `financial-tables-core.ts` | Later | Same |
| `budget_alerts` | `financial-tables-core.ts` | Later — derived | Same |
| `simple_users` | `simple-init-core.ts` | Auth decision needed | Do NOT auto-create; belongs to a separate auth project |
| `staff` | `simple-init-core.ts` | Auth decision needed | Same |

### 3.4 Net-new tables required by the financial control model

These have no source migration or initializer yet. They are the entities designed in Phase 3A/3B.

| Entity | Purpose | Priority |
| --- | --- | --- |
| `supplier` | Canonical supplier/payee identity for both material suppliers and agencies | Phase 3E minimum |
| `agency` | Agency-specific extension of supplier (CIS handling, charge rates, worker registration) | Phase 3E minimum |
| `agency_worker_assignment` | Links an individual worker to an agency for a job/period | Phase 3E minimum |
| `labour_rate` | Numeric, effective-dated hourly/daily rate for worker or agency charge rate | Phase 3E minimum |
| `approved_timesheet` | Approved verified-time fact that creates a payable for categories B and C | Phase 3E |
| `labour_settlement` | Time-based settlement with CIS/retention/VAT split, distinct from valuation-linked contractor settlement | Phase 3F |
| `contractor_settlement` | Supply-and-fit (category A) settlement splitting approved valuation value into CIS/retention/VAT/net | Phase 3F |
| `contractor_payment_allocation` | Existing payment-to-settlement allocation including CIS deduction posted for that amount | Phase 3F |
| `contractor_adjustment` | Typed approved adjustment to a settlement/valuation; never rewrites approved quantity | Phase 3G |
| `labour_invoice` | Agency invoice for time worked (category B payable) or self-employed invoice (category C) | Phase 3F |
| `project_commercial_terms` | Job-client contractual relationship: contract value, variations, currency, value basis, effective dates | Phase 3F |
| `supplier_payment` | Supplier payment (cash out to supplier/agency) | Phase 3F |
| `supplier_payment_allocation` | Payment-to-invoice/settlement allocation | Phase 3F |
| `client_invoice` / `client_invoice_line` | Client receivable document | Phase 3F |
| `client_receipt` / `client_receipt_allocation` | Client cash in | Phase 3F |
| `vat_period` | VAT control period | Phase 3F |
| `cis_period` | CIS control period | Phase 3F |
| `cis_deduction_event` | Posted CIS deduction linked to a payment/credit | Phase 3F |
| `retention` / `retention_release` | Retention control | Phase 3G |
| `supplier_credit_note` / `client_credit_note` | Credit adjustments | Phase 3G |
| `bank_account` | Company bank account identity | Phase 3G |
| `bank_balance_snapshot` | Accepted bank balance | Phase 3G |
| `bank_transaction_evidence` | Monzo/provider transaction import | Phase 3G |
| `bank_reconciliation_link` | Bank evidence to Job Tracker record reconciliation | Phase 3G |
| `financial_opening_balance_set` | Cutover control | Phase 3E minimum |
| `financial_opening_position` | Cutover position detail | Phase 3E minimum |
| `legacy_identity_crosswalk` | Reviewed mapping from legacy project/client/assignment identities to canonical `jobs.id`/`clients.id`/`contractors.id` with evidence, status, reviewer, time, reason | Phase 3E minimum |

## 4. Canonical Identity Model

### 4.1 Client

```text
clients (NEW, canonical migration)
  id SERIAL | PK
  name TEXT NOT NULL
  email TEXT
  phone TEXT
  address TEXT
  status TEXT DEFAULT 'active'
  created_at / updated_at

jobs.client_id -> clients.id  (nullable, added to jobs)
jobs.client_name TEXT  (preserved snapshot, not a FK)
```

Rules:
- `clients` created via canonical migration, not the initializer.
- No automatic deduplication by name/email.
- `jobs.client_id` populated by reviewed mapping only.
- A future `project_commercial_terms` table will hold the job-client contractual relationship.

### 4.2 Job/Project

`jobs.id` (varchar) is the canonical project root. Already deployed and confirmed. All 10 extra columns preserved in `shared/schema.ts`.

The deployed `packages`, `rooms`, `extracted_elements`, `job_files`, and `job_cost_items` tables reference `jobs.id` as text. Adding FK constraints to these extra tables is a later reconciliation task, not Phase 3D scope.

### 4.3 Contractor

```text
contractors (existing, 1 row)
  id VARCHAR PK
  name TEXT
  email TEXT
  specialty TEXT
  status TEXT

contractor_applications (existing, 2 rows)
  id VARCHAR PK
  first_name / last_name TEXT
  cis_status / is_cis_registered / utr_number_details TEXT
  admin_pay_rate TEXT (to be replaced by labour_rate table)
  bank_name / account_holder_name / sort_code / account_number TEXT
  status TEXT
```

Rules:
- `contractors.id` is the canonical contractor business identity.
- `contractor_applications` is the onboarding/approval record. A future FK `contractor_applications.contractor_id -> contractors.id` replaces name matching.
- `admin_pay_rate` (text) is deprecated; future rate storage is `labour_rate` with numeric values and effective dates.

### 4.4 Agency (NEW)

```text
supplier (NEW, canonical)
  id UUID PK
  supplier_type TEXT NOT NULL  -- 'AGENCY', 'MATERIAL_SUPPLIER', 'SUBCONTRACTOR', 'OTHER'
  name TEXT NOT NULL
  company_registration TEXT
  vat_registration TEXT
  cis_verification_status TEXT  -- 'VERIFIED', 'UNVERIFIED', 'NOT_APPLICABLE'
  payment_terms TEXT
  bank_account_ref TEXT  -- link to banking details, not credentials
  status TEXT DEFAULT 'active'
  created_at / updated_at

agency (NEW, extends supplier)
  supplier_id UUID PK -> supplier.id
  -- agency-specific CIS handling policy
  cis_handling TEXT  -- 'AGENCY_OPERATES_CIS' or 'SCULPT_OPERATES_CIS'
  charge_rate_model TEXT  -- 'TIME_BASED', 'FIXED', 'MIXED'
```

Rules:
- `supplier` is the canonical payee identity for company-level payables.
- Agency is a typed supplier. Material suppliers are another type.
- The agency is the financial payee for category B labour, not the individual worker.
- Agency CIS handling policy determines whether Sculpt Projects or the agency deducts CIS.

### 4.5 Agency Worker

An agency worker is an individual who clocks in/out (provides time evidence) but is paid through an agency supplier. The worker is not the payee.

```text
agency_worker_assignment (NEW)
  id UUID PK
  supplier_id UUID -> supplier.id  -- the agency
  contractor_id VARCHAR -> contractors.id  -- the worker (for identity/onboarding)
  job_id VARCHAR -> jobs.id  -- nullable during transition
  start_date / end_date DATE
  status TEXT  -- 'ACTIVE', 'INACTIVE'
  agency_charge_rate_id UUID -> labour_rate.id  -- what the agency charges Sculpt Projects
  worker_pay_rate_id UUID -> labour_rate.id  -- what the worker is paid (reference only)
```

Rules:
- One worker can be assigned to multiple agencies over time (one row per assignment).
- `contractor_id` links to the individual for onboarding/CIS/identity.
- `supplier_id` links to the agency who is the financial payee.
- For category B, cost is `verified time x agency charge rate`, not `verified time x worker pay rate`.

### 4.6 Direct Self-Employed Worker

```text
labour_rate (NEW)
  id UUID PK
  contractor_id VARCHAR -> contractors.id  -- the worker
  job_id VARCHAR -> jobs.id  -- nullable for generic rates
  rate_type TEXT  -- 'HOURLY', 'DAILY'
  rate_amount NUMERIC(18,2) NOT NULL
  currency_code VARCHAR(3) DEFAULT 'GBP'
  effective_from DATE NOT NULL
  effective_to DATE
  source TEXT  -- 'AGREED', 'CONTRACT', 'ADMIN_SET'
  status TEXT DEFAULT 'active'
  created_at
```

Rules:
- Replaces the text `admin_pay_rate` field.
- Multiple rates per worker with effective dates; no guessing from a single text field.
- For category C, cost is `verified time x labour_rate` and the worker is the payee.
- CIS is deducted by Sculpt Projects (or not, per verification status).

## 5. Three Payment Models

### A. Supply & Fit Subcontractor

**Current support:** Phase 2 canonical chain designed but not yet applied to deployed DB.

```text
contract_package -> contractor_tender_rate -> contractor_valuation -> contractor_payments
```

**What needs applying:** Migrations 0011-0014 (contract packages, tender rates, valuations, payments).

**Future additions:** `contractor_settlement` splitting approved value into CIS/retention/VAT/net; VAT/CIS period links; credit/adjustment structures.

**Not clock-based.** `work_sessions` is irrelevant for category A payment calculation.

### B. Agency Labour

**Current support:** None. No agency entity, no time-based cost model, no agency invoice/payable.

**Constraint:** Scheduled hours are not payable hours. Only verified clock-in/out time (adjusted for breaks) produces a payable amount.

**Required structures:**

```text
supplier (type=AGENCY) -> agency_worker_assignment -> work_sessions (worker clocks in)
work_sessions -> approved_timesheet -> agency_invoice (payable to agency)
agency_invoice -> supplier_payment (cash to agency)
```

- Worker clocks in/out via `work_sessions` (needs `contractor_id` + `job_id` links).
- Verified time produces an `approved_timesheet`.
- Agency charge rate from `labour_rate` (linked via `agency_worker_assignment.agency_charge_rate_id`) calculates cost.
- Agency issues an invoice for time worked -> `agency_invoice` (a typed supplier invoice or a separate `labour_invoice` table).
- Sculpt Projects pays the agency -> `supplier_payment`.
- If agency operates CIS, the agency handles deductions internally; Sculpt Projects pays gross.
- If Sculpt Projects operates CIS for the agency, a `cis_deduction_event` is posted against the payment.

### C. Direct Self-Employed Labour

**Current support:** Partial. `work_sessions` records time; `contractor_applications` stores worker identity and CIS status. But no rate authority, no posted CIS, no settlement/payment.

**Constraint:** Scheduled hours are not payable hours. Only verified clock-in/out time (adjusted for breaks) produces a payable amount.

**Required structures:**

```text
contractors.id -> labour_rate (effective-dated rate)
work_sessions (contractor_id + job_id) -> approved_timesheet
approved_timesheet -> labour_settlement (gross, CIS, retention split)
labour_settlement -> contractor_payments (cash, net of CIS)
cis_deduction_event -> cis_period (posted CIS liability)
```

- Worker clocks in/out via `work_sessions`.
- Verified time produces an `approved_timesheet`.
- Rate from `labour_rate` (linked by `contractor_id` and effective date) calculates gross cost.
- CIS deduction is posted as a `cis_deduction_event` when payment is made, not estimated in advance.
- Worker is paid net cash via `contractor_payments` (existing table, extended or linked to `labour_settlement`).

## 6. Work_Sessions Safe Linking Design

Current deployed `work_sessions` has 0 rows and no `contractor_id` or `job_id`. This is a clean opportunity.

### Proposed additions to `work_sessions`

| Column | Type | Nullable | FK | Purpose |
| --- | --- | --- | --- | --- |
| `contractor_id` | varchar | YES ( Nullable for backfill) | `contractors.id` | Stable worker identity (replaces name matching) |
| `job_id` | varchar | YES (nullable for backfill) | `jobs.id` | Stable project link (replaces postcode matching) |
| `agency_worker_assignment_id` | uuid | YES | `agency_worker_assignment.id` | Agency worker context (nullable for category C) |
| `break_duration_minutes` | integer | YES | none | Break time deduction (currently only on non-existent `work_hours`) |

### Migration rules

- All new columns nullable — no data migration needed since 0 rows exist.
- `contractor_name` and `job_site_location` preserved as text snapshots for provenance and display.
- Future population: new clock-in events must set `contractor_id` and `job_id`; existing rows (none currently) would need reviewed backfill.
- `agency_worker_assignment_id` is set when the worker is assigned via an agency (category B); NULL for direct self-employed (category C).
- `total_hours` should eventually move from text `"HH:MM:SS"` to a computed numeric or interval, but that is a later optimisation, not Phase 3D scope.

### What work_sessions must NOT become

- Not a payable (that needs `approved_timesheet`).
- Not a rate source (that needs `labour_rate`).
- Not a CIS calculation (that needs `cis_deduction_event` posted at payment time).
- Not editable after session completion (immutability for `completed` sessions is a future control).

## 7. VAT And CIS Handling Design

### 7.1 VAT

Per `financial-foundation-rules.md`: new taxable documents preserve `net_amount`, `tax_amount`, `gross_amount`, `currency_code` separately with `gross = net + tax`.

| Entity needing VAT fields | Fields |
| --- | --- |
| `supplier_invoice_line` (existing, to extend) | `net_amount`, `tax_amount`, `gross_amount`, `vat_rate`, `vat_treatment`, `tax_point_date`, `vat_recoverability` |
| `client_invoice_line` (new) | Same set |
| `labour_settlement` / `contractor_settlement` (new) | Same set |
| `vat_period` (new) | `period_start`, `period_end`, `scheme`, `opening_position`, `status` |

Rules:
- Do NOT add VAT fields to existing `work_sessions`, `contractor_payments`, or `jobs`.
- Do NOT reinterpret existing `supplier_invoice_line.actual_line_value` as net or gross.
- VAT period is company-level. Document VAT is traceable to project but reported at company level.
- No VAT calculation engine in this phase.

### 7.2 CIS

Per Phase 3A: CIS is a settlement and tax-liability fact posted when a contractor/worker is paid, not when work is valued or estimated.

| Entity needing CIS fields | Fields |
| --- | --- |
| `labour_settlement` (new) | `cis_verification_status`, `cis_deduction_rate`, `estimated_cis_amount`, `labour_element`, `material_element` |
| `cis_deduction_event` (new) | `settlement_id`, `payment_id`, `cis_amount`, `cis_period_id`, `status` |
| `cis_period` (new) | `tax_month_start`, `tax_month_end`, `opening_position`, `status`, `total_deducted`, `total_remitted` |
| `supplier` (new) | `cis_verification_status`, `cis_type` (for agencies that handle CIS themselves) |

Rules:
- Existing `contractor_applications.cis_status` and `is_cis_registered` remain as onboarding evidence. They are NOT posted CIS facts.
- The four inconsistent code-path CIS calculations (routes.ts, database-storage.ts, voice-agent.ts, earnings-calculator.ts) must NOT be treated as financial authority. They produce estimates, not posted deductions.
- CIS is posted as a `cis_deduction_event` linked to the actual payment/credit at payment time.
- For agency labour where the agency operates CIS, no Sculpt Projects `cis_deduction_event` is needed — the agency handles it. But the agency invoice should record that CIS is agency-operated.

## 8. Opening-Balance Design And Cutover Rules

### 8.1 Structures

Per `financial-foundation-rules.md` section 4:

```text
financial_opening_balance_set
  id UUID PK
  cutover_date TIMESTAMP NOT NULL
  currency_code VARCHAR(3)
  status TEXT  -- 'DRAFT', 'APPROVED', 'SUPERSEDED'
  prepared_by / approved_by TEXT
  prepared_at / approved_at TIMESTAMP
  source_reference TEXT
  completeness_statement TEXT

financial_opening_position
  id UUID PK
  opening_balance_set_id UUID -> financial_opening_balance_set.id
  category TEXT  -- 'BANK_CASH', 'CLIENT_DEBTOR', 'SUPPLIER_CREDITOR',
                   --   'CONTRACTOR_CREDITOR', 'VAT_PAYABLE', 'VAT_RECOVERABLE',
                   --   'CIS_LIABILITY', 'RETENTION_RECEIVABLE', 'RETENTION_PAYABLE',
                   --   'OTHER_RECEIVABLE', 'OTHER_PAYABLE', 'FINANCING'
  direction TEXT  -- 'PAYABLE' or 'RECEIVABLE' / 'DEBIT' or 'CREDIT'
  position_amount NUMERIC(18,2) NOT NULL
  net_amount NUMERIC(18,2)
  tax_amount NUMERIC(18,2)
  gross_amount NUMERIC(18,2)
  amount_basis_status TEXT  -- 'NET_TAX_GROSS_CONFIRMED', 'UNKNOWN_LEGACY'
  currency_code VARCHAR(3)
  job_id VARCHAR -> jobs.id  (nullable)
  client_id INTEGER -> clients.id  (nullable)
  supplier_id UUID -> supplier.id  (nullable)
  contractor_id VARCHAR -> contractors.id  (nullable)
  bank_account_id UUID  (nullable, for bank cash positions)
  vat_period_id UUID  (nullable, for VAT opening positions)
  cis_period_id UUID  (nullable, for CIS opening positions)
  contract_package_id UUID  (nullable, for retention-contract positions)
  due_date DATE  (nullable)
  external_reference TEXT
  source_evidence TEXT
  review_status TEXT
  approved_by TEXT
  approved_at TIMESTAMP
  notes TEXT
```

### 8.2 Cutover rules

- Opening positions are explicit; no fabricated invoices, payments, valuations, or bank transactions.
- With only 1 job and minimal financial data, most opening positions will be zero or not applicable.
- Bank cash opening: the actual cleared balance at cutover from the Monzo/Starling account statement (identified externally, not from the Financeflow feed).
- Client debtor: if any client owes money for Spencer House at cutover, record it with external invoice/valuation reference and due date.
- Contractor creditor: if any contractor is owed for approved work at cutover. Currently no valuations or payments exist, so likely zero — but must be explicitly declared, not assumed.
- CIS liability: currently zero (no posted deductions). Must be explicitly declared.
- VAT: currently zero (no VAT records). Must be explicitly declared.
- Company financial views carry a completeness flag until the opening set is approved or each category is explicitly declared not applicable.
- Post-cutover source documents must not duplicate amounts already included in opening positions. Cutover reports need an `opening`, `post_cutover`, and `total` breakdown.

## 9. Safe Migration Order

This is a plan only. No migration is executed.

### Step 0: Pre-migration safety (before any schema changes)

1. **Snapshot the deployed database** (`pg_dump` or Render backup).
2. **Add all 21 deployed-but-unmanaged tables and 13 extra columns to `shared/schema.ts`** so a future `db:push` will not drop them. This includes the 15 extra tables (§2.1), the 6 integration/messaging tables not in `shared/schema.ts` (§2.4: `contractor_messages`, `integration_shadow_receipts`, `integration_shadow_changes`, `integration_shadow_reviews`, `integration_project_mapping`, `integration_change_order_applications`), and the 10 extra `jobs` columns + 3 extra `job_assignments` columns (§2.2-2.3).
3. **Add `.env` to `.gitignore`** (already done).
4. **Run a dry-run `drizzle-kit push --dry` or equivalent** to confirm no destructive changes are planned.

### Step 1: Identity foundation

1. Create `clients` under canonical migration (not initializer) with uniqueness on name.
2. Add `jobs.client_id` nullable -> `clients.id`.
3. Populate `jobs.client_id` for Spencer House -> reviewed `clients.id` (human-mapped "Promise" to a client entity).
4. Add `contractor_applications.contractor_id` nullable -> `contractors.id`.
5. Populate existing applications' `contractor_id` (human-mapped "Rudy BNB" and "Test Contractor" to `contractors.id`).
6. Add `job_assignments.job_id` FK -> `jobs.id` (nullable, then populate the one row).
7. Create `legacy_identity_crosswalk` to record reviewed mappings with source table, source key, target entity/type/id, evidence, mapping status, reviewer, time, and reason. Unresolved means unmapped; no guessed backfills.
8. Create `financial_opening_balance_set` and `financial_opening_position`.

### Step 2: Time-worker foundation

1. Add `work_sessions.contractor_id` nullable -> `contractors.id`.
2. Add `work_sessions.job_id` nullable -> `jobs.id`.
3. Add `work_sessions.break_duration_minutes` integer nullable.
4. Add `work_sessions.agency_worker_assignment_id` uuid nullable (FK added in Step 3).
5. Decide `work_hours` vs `work_sessions`: do NOT create `work_hours`; use `work_sessions` as the single time model.

### Step 3: Supplier and agency foundation

1. Create `supplier` (canonical supplier/payee identity, typed).
2. Create `agency` (extends supplier for agency-specific CIS handling).
3. Create `agency_worker_assignment` (links worker to agency for a job/period).
4. Add `work_sessions.agency_worker_assignment_id` FK -> `agency_worker_assignment.id`.
5. Create `labour_rate` (numeric, effective-dated rates for workers and agency charge rates).

### Step 4: Canonical commercial chain (migrations 0007-0017, applied carefully)

1. Apply `0007_phase2a` (source imports, work areas) — no collision.
2. Apply `0008_phase2b` (drawing structure) — check conceptual overlap with `extracted_elements`/`rooms`; no table name collision.
3. Apply `0009_phase2c` (HBXL baseline) — no collision.
4. Apply `0010_phase2d` (measurable work items) — no collision.
5. Apply `0011_phase2e1` (contract packages, tender rates) — **review collision with deployed `packages`/`package_items`/`tender_*` tables** before applying; the names differ (`contract_package` vs `packages`) so no direct collision, but the semantic overlap must be documented.
6. Apply `0012-0017` (progress, claims, valuations, payments, procurement, POs, receipts, invoices) — no collisions.

### Step 5: Financial foundation extensions

1. Add net/tax/gross/VAT fields to `supplier_invoice_line` (additive, nullable, not reinterpreting existing `actual_line_value`).
2. Create `vat_period`.
3. Create `cis_period` and `cis_deduction_event`.
4. Add `contractor_payments` settlement link fields (nullable `contractor_settlement_id` for supply-and-fit category A settlements and `labour_settlement_id` for time-based categories B/C settlements).
5. Create `supplier_payment` and `supplier_payment_allocation`.

### Step 6: Client receivables

1. Create `client_invoice` / `client_invoice_line`.
2. Create `client_receipt` / `client_receipt_allocation`.
3. Create `project_commercial_terms`.

### Step 7: Time-based settlement and payment

1. Create `approved_timesheet` (from verified `work_sessions`).
2. Create `labour_settlement` (with CIS/VAT/retention split for categories B and C).
3. Create `labour_invoice` (agency invoice for time worked, category B).
4. Link `contractor_payments` to `labour_settlement` (category C cash payment).

### Step 8: Retention, credits, and bank evidence

1. Create `retention` / `retention_release`.
2. Create `supplier_credit_note` / `client_credit_note`.
3. Create `bank_account` / `bank_balance_snapshot`.
4. Create `bank_transaction_evidence` / `bank_reconciliation_link`.

### Step 9: Read models and legacy retirement

1. Build project financial position views.
2. Build company financial position views.
3. Bridge or retire `project_master`, `project_cashflow_weekly`, `material_purchases`.
4. Consolidate `expenses` definitions (if created at all).
5. Bridge or retire `packages`/`package_items`/`tender_*` extra tables.
6. Retire or reconcile `shared-cashflow/schema.ts` duplicate definitions (`work_sessions` extra columns, `jobs` alternate shape, `expenses` alternate shape, `job_assignments` alternate shape, `client_payments`, `project_cash_flow`, `cash_flow_forecasts`) — none of these were applied to the deployed DB, so retirement is source-code cleanup, not a data migration.

## 10. Migrations NOT To Apply Blindly

### 10.1 Never re-run: migrations 0000-0006

Already applied to the deployed database. Re-running could fail on `CREATE TABLE IF NOT EXISTS` or `ALTER TABLE ADD COLUMN` that already exists.

### 10.2 Do NOT run `npm run db:push` before Step 0

`drizzle-kit push` compares `shared/schema.ts` with the deployed schema. Since the deployed schema has 15 extra tables and 13 extra columns not in `shared/schema.ts`, a `db:push` could:
- Attempt to drop the extra tables (especially if it interprets them as unmanaged).
- Attempt to drop the extra `jobs` columns.
- Attempt to recreate or alter existing tables.

**Before any `db:push`, all extra tables and columns must be added to `shared/schema.ts` (Step 0.2) so `drizzle-kit` sees them as intentionally present.**

### 10.3 Do NOT run financial-tables-core.ts initializer

The initializer creates `clients`, `expenses`, `job_phases`, `work_hours`, and other tables with `CREATE TABLE IF NOT EXISTS`. Since these tables don't exist in the deployed DB, the initializer would create them — but with the initializer's column shapes, not canonical ones. This would:
- Create `clients` without canonical uniqueness or ownership.
- Create a conflicting `expenses` shape.
- Create `work_hours` which overlaps `work_sessions`.

The initializer must be disabled or guarded before the canonical migration for `clients` runs.

### 10.4 Do NOT run simple-init-core.ts blindly

Creates `simple_users` and `staff`. These don't exist in the deployed DB. Whether to create them is an auth-model decision, not a finance decision. Running the initializer would create them with `role` defaults that may not match the intended auth model.

### 10.5 Migrations 0007-0017: apply individually, not all at once

Each migration should be applied and verified individually to catch:
- Dependency issues (e.g., `0011` depends on tables from `0010`).
- Conceptual collisions (e.g., `contract_package` vs deployed `packages`).
- Trigger/function creation failures on the Render PostgreSQL instance.

## 11. Risks

1. **15 undocumented extra tables** with real data (885 + 266 + 63 rows) exist outside the migration system. Any schema synchronization tool that doesn't know about them could damage them.
2. **`packages` vs `contract_package`** — two parallel package models may confuse users and reports. A bridge/retirement decision is needed before both are populated.
3. **`shared/schema.ts` is out of sync with deployed DB** — 29 canonical tables in source don't exist deployed, and 21 deployed tables aren't in `shared/schema.ts` (15 extra + 6 integration/messaging). A naive `db:push` is unsafe in both directions.
4. **No `drizzle` migration journal** exists in the deployed DB, so there's no record of which migrations have been applied. Migration state must be inferred from table presence.
5. **Initializer auto-creation risk** — if the application starts without guards, `financial-tables-core.ts` and `simple-init-core.ts` could create tables with wrong shapes before canonical migrations run.
6. **`jobs` extra columns** (`external_source`, `budget_ledger`, etc.) are undocumented in source. Their origin and current use are unknown. Dropping them could break an integration.
7. **`work_sessions` is empty** — this is an opportunity (clean links can be added) but also means no real time data to test payment calculations against.
8. **`admin_pay_rate` is NULL** for both contractor applications — no rate data exists to validate future `labour_rate` design.
9. **No auth tables** — auth state for the deployed environment is unknown. Schema changes must not assume `simple_users`/`staff` exist.
10. **Render PostgreSQL version compatibility** — migrations 0007-0017 use `SERIALIZABLE`, `gen_random_uuid()`, and advanced trigger functions. These must be verified against the Render PostgreSQL version before applying.

## 12. Recommended Phase 3E

Phase 3E should execute **Step 0 and Step 1 only** from the safe migration order:

1. Add the 21 deployed-but-unmanaged tables and 13 extra columns to `shared/schema.ts` so the schema matches deployed reality (15 extra tables + 6 integration/messaging tables + 10 extra `jobs` columns + 3 extra `job_assignments` columns).
2. Take a database snapshot/backup.
3. Run a dry-run schema comparison to confirm no destructive changes are pending.
4. Create `clients` under canonical migration.
5. Add `jobs.client_id` nullable -> `clients.id`.
6. Map the one existing job's client_name ("Promise") to a `clients` row (human review).
7. Add `contractor_applications.contractor_id` nullable -> `contractors.id`.
8. Map the two existing applications to `contractors.id` (human review).
9. Add `job_assignments.job_id` FK and populate the one existing row.
10. Create `legacy_identity_crosswalk` to record all reviewed mappings with evidence and status.
11. Create `financial_opening_balance_set` and `financial_opening_position`.
12. Create the opening balance set for Spencer House (most categories will be zero or not-applicable, but must be explicitly declared).

Phase 3E should NOT:
- Apply migrations 0007-0017 (that is Phase 3F).
- Create supplier/agency entities (that is Phase 3F).
- Add VAT/CIS fields (that is Phase 3F).
- Connect Monzo or any banking service.

## 13. Confirmation

No database, data, schema, API, UI, or configuration was changed. No migration was run. No `db:push` was executed. No Monzo connection was made. No commit, push, merge, or deployment occurred. This is a design and plan only.