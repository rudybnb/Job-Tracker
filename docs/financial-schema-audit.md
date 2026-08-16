# Financial Schema Audit

## 1. Scope And Method

This Phase 3B audit inventories the existing Job Tracker data structure so the finance system can be built on confirmed foundations. It is a **read-only source audit**: no database was accessed, no migration was run, no schema/table/API/UI was changed, and nothing was committed. Findings describe repository definitions and code, not confirmed deployed rows.

Three prior design documents remain in force:

- `docs/company-financial-control-model.md` — the management financial-control model (Phase 3A).
- `docs/financial-foundation-rules.md` — amount basis, opening positions, identity, Monzo readiness (Phase 3B foundation).
- The canonical commercial chain documented in `docs/purchase-order-ledger.md`, `docs/goods-receipt-supplier-invoice-ledger.md`, and `docs/contractor-actual-payment-ledger.md`.

This audit reuses the money-field and identity classifications already locked in `financial-foundation-rules.md` and focuses on the broader table inventory, the labour/time/payment structures, and how the three labour-payment categories fit the current model. Every monetary value not explicitly proven by source remains `UNKNOWN/AMBIGUOUS` per the foundation rules.

Confirmed source layers inspected:

| Layer | Definition file | Tables |
| --- | --- | --- |
| Canonical Drizzle schema | `shared/schema.ts` | 49 `pgTable` definitions |
| Migrations 0000-0017 | `migrations/*.sql`, `migrations/meta/_journal.json` | 55 table names total |
| Financial initializer | `server/financial-tables-core.ts` | 10 tables |
| Simple/auth initializer | `server/simple-init-core.ts` | 2 tables (`simple_users`, `staff`) |
| Cashflow alternate schema | `shared-cashflow/schema.ts` | duplicate `jobs`, `expenses`, `work_sessions`, `job_assignments` and more |
| Archived standalone model | `CASHFLOW_FILES/shared/schema.ts` | UUID-based `jobs`, budgets, costs |
| Ownership manifest | `server/table-manifest.ts` | canonical / financialTablesCore / simpleInitCore split |

## 2. Table Inventory By Domain

### 2.1 Source, baseline, and drawing (all canonical, FK -> jobs.id RESTRICT)

| Table | PK type | Key FKs | Finance-relevant fields | Refs |
| --- | --- | --- | --- | --- |
| `project_source_import` | uuid | job_id -> jobs (restrict), supersedes self (restrict) | none monetary | `shared/schema.ts:51` |
| `work_area` | uuid | job_id -> jobs, source_import, parent self | none | `shared/schema.ts:87` |
| `drawing_object` | uuid | job_id -> jobs, source_import, work_area | none | `shared/schema.ts:133` |
| `physical_wall` | uuid | drawing_object, job_id -> jobs, source_import | dimensional only | `shared/schema.ts:182` |
| `wall_surface` | uuid | physical_wall, adjacent_work_area | none | `shared/schema.ts:241` |
| `opening` | uuid | drawing_object/physical_wall, job_id -> jobs, source_import | none | `shared/schema.ts:271` |

### 2.2 HBXL baseline and measurable work

| Table | PK type | Key FKs | Finance-relevant fields | Refs |
| --- | --- | --- | --- | --- |
| `hbxl_resource_baseline` | uuid | job_id -> jobs, source_import | `baseline_unit_rate` numeric(18,6), `baseline_value` numeric(18,2), `currency_code` varchar(3) nullable default GBP | `shared/schema.ts:322` |
| `measurable_work_item` | uuid | job_id -> jobs, work_area | `planned_quantity` numeric (quantity) | `shared/schema.ts:366` |
| `work_item_source_link` | uuid | measurable_work_item, drawing_object/physical_wall/wall_surface/opening | `quantity_contribution` (quantity) | `shared/schema.ts:405` |
| `work_item_hbxl_resource_link` | uuid | measurable_work_item, hbxl_resource_baseline | `allocation_quantity` (quantity) | `shared/schema.ts:451` |

### 2.3 Contractor, tender, valuation, and payment (canonical commercial chain)

| Table | PK type | Key FKs | Finance-relevant fields | Refs |
| --- | --- | --- | --- | --- |
| `contractors` | varchar | none | `rating`, `active_jobs`, `completed_jobs` as text counters; no money | `shared/schema.ts:12` |
| `contract_package` | uuid | job_id -> jobs, contractor_id -> contractors | `currency_code` | `shared/schema.ts:743` |
| `contractor_tender_rate` | uuid | contract_package | `locked_unit_rate` numeric(18,6), `locked_contract_value` numeric(18,2), `currency_code` | `shared/schema.ts:773` |
| `contractor_tender_rate_work_item_link` | uuid | tender_rate, measurable_work_item | `allocated_quantity` (quantity) | `shared/schema.ts:811` |
| `work_progress` | uuid | job_id -> jobs, measurable_work_item, contractor_id, contract_package, tender_rate, reverses self | progress quantities only | `shared/schema.ts:838` |
| `contractor_claim` | uuid | job_id -> jobs, contract_package, contractor_id | header only | `shared/schema.ts:868` |
| `contractor_claim_line` | uuid | contractor_claim, measurable_work_item, tender_rate, link | claimed quantity | `shared/schema.ts:895` |
| `inspection_decision` | uuid | contractor_claim_line, supersedes self | approved quantity | `shared/schema.ts:917` |
| `contractor_valuation` | uuid | job_id -> jobs, contract_package, contractor_id, supersedes self | `currency_code` | `shared/schema.ts:949` |
| `contractor_valuation_line` | uuid | valuation, measurable_work_item, tender_rate, link | `current_value` numeric(18,2), `currency_code` | `shared/schema.ts:983` |
| `contractor_payments` | uuid | job_id -> jobs, contractor_id, contractor_valuation_id (nullable), reverses self | `payment_amount` numeric(18,2), `currency_code`, `payment_status` (`PENDING`, `SCHEDULED`, `PAID`, `FAILED`, `CANCELLED`, `REVERSED`; only `PAID`/`REVERSED` affect the balance), `payment_date` | `shared/schema.ts:1011` |

### 2.4 Procurement

| Table | PK type | Key FKs | Finance-relevant fields | Refs |
| --- | --- | --- | --- | --- |
| `procurement_requirement` | uuid | job_id -> jobs, hbxl_resource_baseline, measurable_work_item, work_area | `required_quantity` (quantity) | `shared/schema.ts:480` |
| `supplier_quote` | uuid | job_id -> jobs, supersedes self | `currency_code` | `shared/schema.ts:515` |
| `supplier_quote_line` | uuid | supplier_quote, procurement_requirement | `unit_price` numeric(18,6), `line_value` numeric(18,2), `currency_code` | `shared/schema.ts:544` |
| `purchase_order` | uuid | job_id -> jobs, accepted_supplier_quote, supersedes self | `currency_code` | `shared/schema.ts:573` |
| `purchase_order_line` | uuid | purchase_order, procurement_requirement, supplier_quote_line | `agreed_unit_price` numeric(18,6), `ordered_line_value` numeric(18,2), `currency_code` | `shared/schema.ts:605` |
| `goods_receipt` / `goods_receipt_line` | uuid | job_id -> jobs, purchase_order, purchase_order_line | received/accepted/rejected quantities only | `shared/schema.ts:633`, `:653` |
| `supplier_invoice` | uuid | job_id -> jobs, purchase_order (nullable) | `currency_code`; no header totals | `shared/schema.ts:685` |
| `supplier_invoice_line` | uuid | supplier_invoice, purchase_order_line (nullable), procurement_requirement (nullable) | `actual_unit_price` numeric(18,6), `actual_line_value` numeric(18,2), `currency_code` | `shared/schema.ts:709` |

### 2.5 Core operational / legacy

| Table | PK type | Key FKs | Finance-relevant fields | Refs |
| --- | --- | --- | --- | --- |
| `jobs` | varchar | contractor_id -> contractors (no onDelete), upload_id -> csv_uploads | `client_name` text (migration 0006); no money/currency | `shared/schema.ts:23` |
| `csv_uploads` | varchar | none | none | `shared/schema.ts:43` |
| `contractor_applications` | varchar | none | `adminPayRate` text; CIS fields (`cisStatus`, `isCisRegistered`, `utrNumberDetails`, `adminCisVerification`); payment-instruction/bank fields (`bankName`, `accountHolderName`, `sortCode`, `accountNumber`); `username`/`password` login | `shared/schema.ts:1039` |
| `work_sessions` (canonical) | varchar | none | none monetary; no job_id, no contractor_id | `shared/schema.ts:1094` |
| `temporary_departures` | varchar | work_session_id -> work_sessions (no onDelete) | none | `shared/schema.ts:1110` |
| `job_assignments` (legacy) | text | none | `hbxl_job` text, `build_phases` text[], `work_location` text; no job_id, no contractor_id | `shared/schema.ts:1342` |
| `task_progress`, `contractor_reports`, `admin_inspections`, `inspection_notifications`, `task_inspection_results` | text | assignment_id (text, not FK) | none monetary | `shared/schema.ts:1368-1458` |

### 2.6 Weekly/legacy cashflow (all text money, no currency)

| Table | PK type | Identity | Money fields (all TEXT) | Refs |
| --- | --- | --- | --- | --- |
| `project_cashflow_weekly` | text | `project_id` text, `project_name` text (no FK) | forecast/actual/cumulative/budget/variance text defaults "0" | `shared/schema.ts:1471` |
| `material_purchases` | text | `project_id` text, `project_name` text (no FK) | `unit_cost` text, `total_cost` text | `shared/schema.ts:1567` |
| `project_master` | text | unique `project_name` text, `client_name` text (no FK) | `total_budget`, `quoted_price`, `labour_budget`, `material_budget` text; JSON breakdowns | `shared/schema.ts:1616` |

### 2.7 Financial-initializer tables (financialTablesCore)

| Table | PK type | Key FKs | Notes | Refs |
| --- | --- | --- | --- | --- |
| `clients` | serial | none | `total_spent` decimal summary, `active_jobs` int summary; no canonical ownership, no uniqueness | `server/financial-tables-core.ts:5` |
| `job_phases` | serial | job_id -> jobs (CASCADE) | phase/labour/material/plant budgets and actual-cost summaries, all decimal | `server/financial-tables-core.ts:16` |
| `sub_phases` | serial | phase_id -> job_phases (CASCADE) | same budget/actual summary fields | `server/financial-tables-core.ts:36` |
| `contractor_types` | serial | none | type reference | `server/financial-tables-core.ts:54` |
| `phase_assignments` | serial | phase_id, sub_phase_id, contractor_id -> contractors (CASCADE) | `agreed_price`, `materials_cost` decimal | `server/financial-tables-core.ts:59` |
| `milestones` | serial | assignment_id -> phase_assignments (CASCADE) | `milestone_amount` decimal, `payment_status` | `server/financial-tables-core.ts:74` |
| `expenses` (initializer) | serial | job_id -> jobs (CASCADE), phase_id, sub_phase_id | `amount`, `unit_price` decimal; `supplier_name`, `receipt_image_url` | `server/financial-tables-core.ts:87` |
| `work_hours` | serial | contractor_id -> contractors (CASCADE), assignment_id -> phase_assignments (CASCADE) | `total_hours` decimal, `break_duration_minutes` int, `is_approved`, `approved_by`, `approved_at` | `server/financial-tables-core.ts:105` |
| `materials_catalog` | serial | none | `standard_unit_price` decimal (catalog reference, not authority) | `server/financial-tables-core.ts:121` |
| `budget_alerts` | serial | job_id -> jobs (CASCADE), phase_id | derived alert | `server/financial-tables-core.ts:133` |

### 2.8 Auth/staff initializer (simpleInitCore)

| Table | PK type | Fields | Refs |
| --- | --- | --- | --- |
| `simple_users` | varchar | username, password, role default 'contractor', full_name | `server/simple-init-core.ts:5` |
| `staff` | varchar | username, password, role default 'admin', full_name | `server/simple-init-core.ts:14` |

These are login accounts only. They are not contractor/worker identities and carry no financial fields.

### 2.9 Integration and messaging (migration-defined; implied by manifest)

Migration-only tables not all declared in `shared/schema.ts` Drizzle definitions: `integration_shadow_receipts`, `integration_shadow_changes`, `integration_shadow_reviews`, `integration_project_mapping`, `integration_change_order_applications` (has `approved_amount_minor` bigint and `currency` text), and `contractor_messages`. These are append/audit ledgers and integration intake; they are not financial posting tables and must not be repurposed as such. `approved_amount_minor` is a change-order snapshot and is never applied into operational `jobs.phase_task_data` (enforced by tests).

### 2.10 Cashflow alternate schema duplicates

`shared-cashflow/schema.ts` redefines physical tables that canonical `shared/schema.ts` also claims, with different/added columns:

| Duplicate table | Extra cashflow fields | Refs |
| --- | --- | --- |
| `jobs` | `estimated_budget`, `actual_cost`, `profit_margin`, `client_payment_status`, `client_payment_amount` decimal | `shared-cashflow/schema.ts:22` |
| `work_sessions` | `hourlyRate`, `grossPay`, `cisDeduction`, `netPay` decimal; nullable `jobId -> jobs.id` | `shared-cashflow/schema.ts:110` |
| `expenses` | `unit_cost` decimal, `payment_status`, `invoice_number`, `date_incurred` | `shared-cashflow/schema.ts:222` |
| `job_assignments` | `jobId -> jobs.id`, `contractorId -> contractors.id`, `contractorName` | `shared-cashflow/schema.ts:263` |
| `client_payments` (unique to cashflow) | `invoice_amount`, `payment_amount`, `retention_amount` decimal; combines invoice+payment | `shared-cashflow/schema.ts:242` |
| `project_cash_flow` (unique) | weekly income/expense aggregates | `shared-cashflow/schema.ts:154` |
| `cash_flow_forecasts` (unique) | forecast client payments, retention, costs | `shared-cashflow/schema.ts:182` |

## 3. Identity Model

### 3.1 Project identity

`jobs.id` (varchar, `shared/schema.ts:23`) is the single canonical project root. Every Phase 2 commercial table uses a required `job_id -> jobs.id ON DELETE RESTRICT`. This is confirmed and consistent across baseline, work items, contractor, tender, valuation, payment, procurement, and invoice tables.

Competing project identities still in the codebase:

| Identity path | Where | Status |
| --- | --- | --- |
| `project_master.id` + unique `project_name` | `shared/schema.ts:1616`, active storage/routes | Parallel root; preserve but do not expand |
| Text `project_id` + `project_name` | `project_cashflow_weekly`, `material_purchases` | Legacy evidence; no FK |
| `hbxl_job` text + `build_phases` text[] + `work_location` | legacy `job_assignments` | Provenance only; matched by name/location in code |
| Phase/assignment chain only | `sub_phases`, `phase_assignments`, `milestones`, `work_hours` | Classification chain, not project identity |
| UUID `jobs.id` | `CASHFLOW_FILES/shared/schema.ts:17` | Incompatible type; standalone model |

No guessed backfill is approved. A reviewed crosswalk records source key, target `jobs.id`, evidence, mapping status, reviewer, time, and reason. Unresolved means unmapped. These rules match `financial-foundation-rules.md` section 5.

### 3.2 Client identity

`clients` (`server/financial-tables-core.ts:5`) is the intended canonical client table but is initializer-owned with no reliable uniqueness and no canonical schema definition. `jobs.client_name` (text, migration 0006) is a project snapshot, not a foreign key. Active financial routes assume `jobs.client_id`, but that column is absent from `shared/schema.ts`. `project_master.client_name` and `shared-cashflow.client_payments` are free text. A future nullable `jobs.client_id -> clients.id` is the approved path, preserving `jobs.client_name` unchanged.

### 3.3 Contractor / worker identity

| Concept | Current table | Identity | Gap |
| --- | --- | --- | --- |
| Contractor business entity | `contractors` | varchar `name`, `email` | no client/agency link; text counters |
| Onboarding/approval record | `contractor_applications` | varchar by person | CIS/bank/adminPayRate stored here; no link to `contractors.id`; resolved by name |
| Auth login | `simple_users`, `staff` | username | separate from contractor identity |
| Time worker | `work_sessions.contractorName` | text by name | no `contractor_id`, no `job_id` in canonical; cashflow adds nullable `jobId` |

There is no concept of an agency, umbrella company, or labour supplier anywhere in the repository (grep for `agency`, `umbrella`, `labour supplier`, `PAYE` returned no files). Every worker is modelled as an individual contractor, and every financial obligation of a worker is linked only to `contractor_id`/`contractorName`. This is the biggest structural gap for labour categories B and C.

### 3.4 Supplier identity

Supplier identity on canonical tables is a **text snapshot** on each document: `purchase_order.supplierName`, `supplier_invoice.supplierName`, `supplier_quote` supplier fields, and `material_purchases.supplierName`. There is no canonical `supplier` entity table. This is acceptable for commercial-evidence snapshot policy, but a future supplier/payee master will be needed for supplier payments and payables at company level.

## 4. Money Fields Summary

The detailed per-field classification (NET / GROSS / UNKNOWN/AMBIGUOUS / NOT APPLICABLE) is locked in `docs/financial-foundation-rules.md` section 3. The key confirmed conclusions for this audit:

- No canonical commercial document provides an explicit net/tax/gross set. All invoice, PO, quote, valuation, tender, HBXL, expense, purchase, and budget values are `UNKNOWN/AMBIGUOUS` for VAT basis unless independently reviewed.
- `contractor_payments.payment_amount` is confirmed actual cash transferred; net/gross tax basis is not applicable to the cash row itself.
- `contractor_tender_rate.locked_contract_value` and `contractor_valuation_line.current_value` are work/entitlement values before settlement deductions; their existing VAT basis is unknown.
- Legacy `project_cashflow_weekly`, `material_purchases`, and `project_master` store money as **TEXT**, not numeric, with no currency.
- Currency is present and required on all canonical Phase 2 tables and supplier-quote/PO/invoice lines; it is absent from `clients`, `expenses`, `material_purchases`, `project_master`, `project_cashflow_weekly`, `job_phases`, `sub_phases`, and all cashflow models.
- No exchange-rate, base-currency, or conversion model exists.

Net-new monetary fields found in this audit not covered by the foundation-rules table:

| Structure | Field | Type | Classification | Refs |
| --- | --- | --- | --- | --- |
| `shared-cashflow.work_sessions` | `hourlyRate` | decimal(8,2) | UNKNOWN/AMBIGUOUS | `shared-cashflow/schema.ts:124` |
| `shared-cashflow.work_sessions` | `grossPay` | decimal(10,2) | UNKNOWN/AMBIGUOUS (computed-on-the-fly) | `shared-cashflow/schema.ts:125` |
| `shared-cashflow.work_sessions` | `cisDeduction` | decimal(10,2) | UNKNOWN/AMBIGUOUS (on-the-fly estimate, not posted) | `shared-cashflow/schema.ts:126` |
| `shared-cashflow.work_sessions` | `netPay` | decimal(10,2) | UNKNOWN/AMBIGUOUS | `shared-cashflow/schema.ts:127` |
| `integration_change_order_applications` | `approved_amount_minor` | bigint | UNKNOWN/AMBIGUOUS, minor units, not operational money | `migrations/0003_phase1b_application_storage.sql` |

## 5. Tax / CIS / VAT Fields

### 5.1 VAT

No VAT fields exist on any canonical table. `supplier_invoice_line` has `actual_unit_price` and `actual_line_value` with no net/tax/gross split. F2B explicitly deferred VAT. No `vat_period` or document tax component exists. The Phase 3A model and foundation rules define the future shape; nothing is implemented.

### 5.2 CIS

CIS exists only as onboarding/on-the-fly calculation evidence, never as a posted deduction or liability:

| Location | Field/concept | Status | Refs |
| --- | --- | --- | --- |
| `contractor_applications.cisStatus` | text | onboarding capture | `shared/schema.ts:1058` |
| `contractor_applications.isCisRegistered` | text default "false" | onboarding capture | `shared/schema.ts:1060` |
| `contractor_applications.utrNumberDetails` | text | onboarding capture | `shared/schema.ts:1059` |
| `contractor_applications.adminCisVerification` | text | admin verification note | `shared/schema.ts:1081` |
| `shared-cashflow.work_sessions.cisDeduction` | decimal | on-the-fly estimate column; no route confirmed posting it | `shared-cashflow/schema.ts:126` |
| `server/routes.ts:3012` | `cisRate: 0.30` default | ignores `isCisRegistered` in that path | `server/routes.ts:3012` |
| `server/database-storage.ts:662` | `cisRate = 0.30` hardcoded | comment cites one named contractor | `server/database-storage.ts:662` |
| `server/voice-agent.ts:172` | `isCisRegistered === 'true' ? 20 : 30` | dynamic but ad-hoc | `server/voice-agent.ts:172` |
| `client/src/lib/earnings-calculator.ts` | `cisRate` parameter | UI helper | `client/src/lib/earnings-calculator.ts:8` |

Key facts:

- CIS deductions are **calculated in at least four inconsistent code paths** and discarded; they are not persisted as posted facts.
- The canonical `contractor_payments` has no CIS, retention, or deduction fields (Phase 2L deferred all of these).
- Nothing links a CIS deduction to a CIS period or an HMRC remittance.
- No CIS rate table or verification-status table exists; the rate is hard-coded per code path.

### 5.3 Retention

Retention appears only in noncanonical cashflow snapshots (`shared-cashflow.client_payments.retention_amount`, `project_cash_flow.retention_released`, `cash_flow_forecasts.expected_retention`). No canonical retention or release structure exists. Phase 3A defines the future shape; nothing is implemented.

## 6. Labour And Time Structures

### 6.1 Canonical `work_sessions` (`shared/schema.ts:1094`)

Columns: `id` varchar, `contractorName` text, `jobSiteLocation` text (postcode), `startTime` timestamp, `endTime` timestamp nullable, `totalHours` text (`"HH:MM:SS"`), `startLatitude`/`startLongitude`/`endLatitude`/`endLongitude` text, `status` enum (`active`, `completed`, `cancelled`, `temporarily_away`), `createdAt`.

Critical gaps:

- **No `job_id`.** No project FK. Project attribution relies on `jobSiteLocation` postcode substring matching in routes.
- **No `contractor_id` FK.** Worker identity is the text `contractorName`, matched by string equality.
- **`totalHours` is text**, not an interval or numeric. Parsed by splitting on `:` in code.
- **No money fields.** Rate, gross, CIS, and net are computed on the fly and not persisted here.
- GPS coordinates are text; `gpsVerified: true` is hard-coded in the weekly earnings route (`server/routes.ts:3013`), not derived from a verification rule.

### 6.2 Cashflow `work_sessions` (`shared-cashflow/schema.ts:110`)

Same base columns as canonical, plus `hourlyRate`, `grossPay`, `cisDeduction`, `netPay` decimal and nullable `jobId -> jobs.id`. This is a **duplicate definition of the same physical table** adding financial/identity columns the canonical version lacks. Routes that read `work_sessions` use the canonical shape (text identity, no job link); the cashflow columns appear largely unused by storage routes.

### 6.3 `work_hours` (`server/financial-tables-core.ts:105`)

A separate time-entry model: `contractor_id -> contractors.id`, `assignment_id -> phase_assignments.id`, `work_date`, `clock_in_time`, `clock_out_time`, `total_hours` decimal, `break_duration_minutes`, `is_approved`, `approved_by`, `approved_at`. It overlaps `work_sessions` and is the only time model with an explicit approval gate, but it is phase-assignment-scoped (not job-scoped) and unused by the live pay calculations audited. The permanent-data model says `work_hours` should be consolidated with `work_sessions` later.

### 6.4 `temporary_departures` (`shared/schema.ts:1110`)

Tracks time away from site during a session: `work_session_id -> work_sessions.id`, `departure_time`, `return_time`, `status` (`away`/`returned`), `distanceFromSite` text, `nearestJobSite` text. Useful for break/absence evidence for categories B and C, but not linked to pay deductions in any current path.

### 6.5 `job_assignments`

- Canonical/legacy (`shared/schema.ts:1342`): `hbxl_job` text, `build_phases` text[], `work_location` text, contractor name/contact text. No `job_id`, no `contractor_id`.
- Cashflow (`shared-cashflow/schema.ts:263`): adds `jobId -> jobs.id` and `contractorId -> contractors.id`.

The canonical/legacy text form is what progress/inspection/report matching uses today, via name/location substring logic. This is fragile and not financial identity.

## 7. Pay Rate And Earnings Calculation Paths

### 7.1 Rate resolution

`getContractorPayRate(contractorName)` (`server/database-storage.ts:553`) matches `CONCAT(firstName, ' ', lastName) = contractorName` against `contractor_applications`, returns `parseFloat(adminPayRate)`, or a hard-coded fallback of `25.00`.

Problems:

- Rate is the **text `adminPayRate`** on the onboarding record; not numeric, no effective dates, no per-job rate, no agency charge rate vs worker pay rate.
- Match is **by exact full-name string**; no stable `contractor_id` link. Renames or duplicate names break it.
- There is no concept of an agreed weekly/day rate, a schedule of rates, or a rate effective from/until a date.
- The only structured contractor rate in the canonical model is `contractor_tender_rate.locked_unit_rate`, but that is for **measurable work items** (category A), not for time-based labour.

### 7.2 Earnings/split calculation paths (inconsistent)

| Path | Rate rule | CIS rule | Extras | Refs |
| --- | --- | --- | --- | --- |
| Weekly earnings route | daily cap = hourlyRate x 8 for 8+ hour days; hourly for partial | `cisRate = 0.30` default, ignores registration | `gpsVerified: true` hard-coded | `server/routes.ts:2996-3068` |
| `calculateEarnings` helper | weekend x1.5 overtime; hourly for all hours | `cisRate = 0.30` hardcoded | punctuality deduction £0.50/min after 08:15 (max £50); minimum £100/day | `server/database-storage.ts:634-667` |
| Voice agent | hourly | `isCisRegistered === 'true' ? 20 : 30` | | `server/voice-agent.ts:172` |
| `calculateWeeklyLabourCosts` | hourly x hours parsed from `HH:MM:SS` | none | does not filter by project despite accepting a `projectId` | `server/database-storage.ts:1159` |

These are operational payroll heuristics. None of their outputs are persisted to canonical financial ledgers, none produce a posted CIS deduction, and none create a payable or payment. They cannot be treated as financial authority.

## 8. Three Labour-Payment Categories

### A. Supply-and-fit subcontractor

**Model:** quote/contract is a lump sum, may include labour and materials, paid against agreed contract/quotation/invoices/variations. Not calculated from clock-in/out.

**Current support:** Strong.

| Needed fact | Current structure | Status |
| --- | --- | --- |
| Awarded scope and locked value | `contract_package` + `contractor_tender_rate.locked_contract_value` | Available |
| Measurable work items | `measurable_work_item` + links | Available |
| Approved work done | `contractor_valuation_line.current_value` (incremental) | Available |
| Actual cash paid | `contractor_payments` (PAID, REVERSED) | Available |
| VAT / CIS / retention on settlement | none | Deferred (Phase 3A planned) |

Gaps for A: no settlement splitting gross value into CIS/retention/VAT/net; no credit/adjustment; variation policy not locked. But the value and cash backbone exists and is canonical.

### B. Agency labour

**Model:** worker supplied through an agency; cost based on agreed rate and verified actual clock-in/out time; the **agency** is the financial supplier/payee; scheduled hours are not payable hours.

**Current support:** Essentially none.

| Needed fact | Current structure | Status |
| --- | --- | --- |
| Agency/supplier entity (payee) | none | Missing |
| Worker (time provider) distinct from payee | none; only individual `contractors` | Missing |
| Agency agreed charge rate vs worker pay rate | none | Missing |
| Verified clock-in/out time | `work_sessions` (partial) | Partial |
| Payable based on verified time to the agency | none | Missing |
| Agency invoice / supplier invoice for labour | none (supplier invoice is materials/procurement focused) | Missing |
| Settlement/payment of agency | none (contractor_payments is individual-contractor and valuation-linked) | Missing |

Gaps for B: need an agency/labour-supplier entity separated from the individual worker; need a labour-payable structure where the payee is the agency; need rate records (agency charge rate) and a time-based cost calculation that uses verified `work_sessions` time; need an agency invoice/payable that is not model 1's measurable-work valuation.

### C. Direct self-employed labour

**Model:** worker works directly for Sculpt Projects; paid using agreed rate and verified clock-in/out time; scheduled hours are not payable hours.

**Current support:** Partial, but no controlled payment path.

| Needed fact | Current structure | Status |
| --- | --- | --- |
| Worker identity | `contractor_applications` by name; `contractors` | Partial, name-based |
| Agreed rate | `adminPayRate` text on applications | Partial; not numeric/effective-dated |
| Verified clock-in/out time | `work_sessions` (start/end, GPS, temp departures) | Partial; no contractor_id/job_id |
| Project attribution of time | none on canonical `work_sessions` | Missing |
| Posted timesheet approval as payable | none | Missing |
| Posted CIS deduction | none (on-the-fly only) | Missing |
| Settlement and payment for time | none (contractor_payments is valuation-linked) | Missing |

Gaps for C: need `work_sessions` linked to `contractor_id` and `job_id`; need structured rate records (hourly/day, effective dates); need an approved-time/timesheet fact that creates a payable; need a posted CIS deduction event; need a settlement/payment structure for time-based pay distinct from valuation-linked `contractor_payments`.

## 9. Clock-In/Out Feeding Job Cost And Payment For B And C

Verified time evidence partially exists and could feed categories B and C once the missing links are added.

### What exists

- `work_sessions.startTime` / `endTime` timestamps (canonical) provide actual clock-in/out.
- `startLatitude`/`startLongitude`/`endLatitude`/`endLongitude` provide GPS evidence at clock events.
- `temporary_departures` records time away from site within a session.
- `totalHours` is derived (stored as text `"HH:MM:SS"`).

### What is missing for cost/payment

1. **Project link:** canonical `work_sessions` has no `job_id`. Time cannot be attributed to a project for job-cost without fragile postcode matching. The cashflow duplicate adds nullable `jobId`, but canonical routes do not use it.
2. **Worker link:** no `contractor_id` on `work_sessions`; identity is text `contractorName`. Need a stable FK for both cost attribution and payment.
3. **Rate authority:** `adminPayRate` is a single text field resolved by name. Need numeric, effective-dated rate records, and for agency labour an agency charge rate distinct from the worker pay rate.
4. **Verified payable hours:** scheduled hours are not payable. Need an approved-time/timesheet gate that takes verified `work_sessions` hours (adjusted for breaks/temporary departures) and posts an approved labour payable. `work_hours.is_approved` is the only approval gate today, but it is a separate, phase-scoped model that overlaps `work_sessions`.
5. **Break handling:** `work_hours` has `break_duration_minutes`; canonical `work_sessions` does not. Need one consistent break/deduction model before time drives pay.
6. **Posted CIS deduction:** on-the-fly calculations must become a posted deduction event linked to the payment/credit, assigned to a CIS period.
7. **Settlement/payment path:** `contractor_payments` is linked to `contractor_valuation` (measurable work). Time-based pay needs a settlement/payment that references approved time, not a valuation.
8. **Agency payee:** for category B, the payment must go to the agency supplier, not the individual worker; `contractor_payments` has only individual `contractor_id`.

### Existing derivation must not be treated as authority

`calculateWeeklyLabourCosts` (`server/database-storage.ts:1159`) accepts a `projectId` but does not filter sessions by project; the weekly earnings route groups by `contractorName` text and applies hard-coded 30% CIS; `calculateEarnings` applies ad-hoc overtime/punctuality/minimum-pay heuristics. None of these post a payable, a CIS deduction, or a payment. They are reporting/payroll helpers, not financial control facts, and must not be reused as the source for job-cost or payment authority without the missing links above.

## 10. Opening-Balance Data Requirements (Identify Only)

Per `financial-foundation-rules.md` section 4, opening positions are explicit cutover positions, not fabricated history. This phase identifies what information will later be needed; it does not create or migrate opening balances.

| Category | Data needed later | Existing source today |
| --- | --- | --- |
| Bank cash | account identity, currency, balance at cutover, source/timestamp | none (Financeflow external feed is unreconciled) |
| Client debtor | client identity, job link, currency, outstanding amount, due date, external invoice ref | none canonical; `shared-cashflow.client_payments` is noncanonical and combines facts |
| Supplier creditor | supplier identity, job link, currency, outstanding amount, due date, external ref | none; supplier invoices exist but no payment/settlement to carry an opening balance |
| Contractor creditor | contractor identity, job link, package/valuation reference, outstanding amount, type (supply-and-fit vs time-based) | `contractor_valuation` provides approved value; `contractor_payments` PAID provides cash paid to date, but CIS/retention composition is unknown |
| VAT payable/recoverable | period, direction, amount, evidence | none |
| CIS liability | period, deducted amount, evidence | none (existing deductions are on-the-fly and unposted) |
| Retention receivable | client contract, job link, amount withheld, release date | none canonical; noncanonical cashflow snapshots only |
| Retention payable | contractor package, job link, amount withheld, release date | none |
| Other receivable/payable | counterparty, category, currency, amount, due date, evidence | none |

Important: existing `contractor_payments` PAID rows can inform an opening "contractor cash paid to date" figure, but because CIS and retention were never posted, the split between cash, CIS, and retention in historical payments is unknowable from the repository. Any opening contractor creditor must be an external, evidenced position, not a reverse calculation from payment history.

## 11. Legacy, Duplicate, And Ambiguous Identity Inventory

| Item | Conflict | Impact on finance |
| --- | --- | --- |
| `project_master` vs `jobs` | parallel project root | must not be used for new finance |
| Text `project_id`/`project_name` | no FK in cashflow/materials | cannot be project identity |
| `hbxl_job`/`build_phases`/`work_location` | name-based matching | fragile; not financial identity |
| Two `expenses` definitions | initializer vs `shared-cashflow` disagree on columns; routes use a third vocabulary | cannot be cost authority until reconciled |
| Two `work_sessions` definitions | canonical has no money/job_id; cashflow adds financial/identity columns | must pick one; time-based pay needs both links |
| `work_hours` vs `work_sessions` | overlapping time models, one phase-scoped, one name-scoped | consolidate before time drives pay |
| `jobs.client_id` assumed by routes | absent from `shared/schema.ts` | routes cannot be financial truth |
| `clients` no canonical ownership | initializer-only, no uniqueness | blocks canonical client receivables |
| `contractor_applications.adminPayRate` text | resolved by name, no FK to contractors | not a structured rate |
| CIS in four code paths | 0.30 default / 0.30 hard / dynamic 20-30 / UI param | not posted, not a liability |
| Cashflow `client_payments` | combines invoice+payment+retention | not suitable as receivable ledger |
| UUID `jobs` in `CASHFLOW_FILES` | incompatible ID type | standalone model only |
| Supplier identity as text snapshot | no supplier master | acceptable for evidence, gap for supplier payables/payments |
| No agency/umbrella concept | only individual contractors | blocks category B entirely |

## 12. Gaps For Future Finance

Structural gaps that must be addressed before the finance system is authoritative:

1. **Canonical client ownership and `jobs.client_id`.** Without this, client receivables have no identity.
2. **Supplier/payee master.** Needed for supplier payments and company-level payables.
3. **Agency/labour-supplier entity.** Separates worker (time provider) from payee (agency). Does not exist.
4. **Time-based cost and payment model.** Distinct from valuation-linked `contractor_payments`; supports verified time, rate records, posted CIS, and settlement for categories B and C.
5. **`work_sessions` project and worker links.** `job_id` and `contractor_id` FKs are required before time can drive job cost or pay.
6. **Structured rate records.** Numeric, effective-dated, per-assignment/per-worker (and per-agency charge) rates, replacing the text `adminPayRate`.
7. **Approved-time / timesheet payable fact.** A controlled payable arising from approved verified time, not a discarded calculation.
8. **Posted CIS deduction events and CIS periods.** Replacing on-the-fly estimates.
9. **VAT components and VAT periods.** Per the Phase 3A model; nothing implemented.
10. **Retention payable/receivable and release structures.** Not implemented.
11. **Client invoice/receipt/allocation ledgers.** Not implemented; `client_payments` is unsuitable.
12. **Supplier payment/allocation ledger.** Not implemented.
13. **Complete settlement for contractors.** Splitting approved value into cash, CIS, retention, VAT, and adjustments.
14. **Opening-balance structures.** Per `financial-foundation-rules.md`; not yet created.
15. **Bank account/transaction evidence and reconciliation links.** Per foundation rules; not yet created.
16. **Consolidation of `work_hours` vs `work_sessions` and `expenses` definitions.** Duplicate models must not both feed finance.

## 13. Recommendations For Phase 3C

Phase 3C should not jump to client invoices or Monzo. It should establish identity and amount-authority prerequisites first, consistent with the foundation rules' recommended first migration:

1. **Deployed-schema/data inventory (read-only).** Confirm which of these duplicate definitions and text/numeric money columns actually exist and what data they hold. This is the explicit prerequisite that source-only audit cannot satisfy.
2. **Canonical clients + `jobs.client_id`.** Bring `clients` under canonical ownership, add nullable `jobs.client_id -> clients.id`, preserve `jobs.client_name`.
3. **Reviewed crosswalks.** For `project_master`, text `project_id`, and `hbxl_job` to `jobs.id`, with unresolved states and no guessed backfills.
4. **Opening-position structures.** `financial_opening_balance_set` / `financial_opening_position` per the foundation rules.
5. **Worker/time foundation decisions.** Decide and lock: canonical time model (`work_sessions` vs `work_hours`), `work_sessions` `contractor_id` and `job_id` links, break handling, and numeric rate records. This is the prerequisite for categories B and C.
6. **Agency/labour-supplier model decision.** Decide whether to add a supplier/payee master that can represent an agency, and how time-based payables/payments link to it. This blocks category B.

Only after identity, opening positions, and the time-worker model are locked should subsequent phases add client receivables, supplier/contractor settlements, VAT/CIS periods, retention, and bank evidence.

## 14. Risks And Unresolved Questions

- Deployed schema and historical data were not inspected; duplicate definitions and text money may or may not match deployed columns.
- The split of historical `contractor_payments` into cash versus CIS versus retention is unknowable from the repository, so any opening contractor creditor must come from external evidence.
- On-the-fly CIS calculations are inconsistent and unposted; treating them as a liability would be unsafe.
- Name-based worker and project matching in current routes is fragile and cannot support financial attribution.
- Consolidating `work_sessions` and `work_hours` must preserve existing time evidence without losing historical attendance/break data.
- Adding `work_sessions.job_id`/`contractor_id` requires a reviewed mapping of existing sessions (by `contractorName` and `jobSiteLocation`) to canonical identities; automatic matching is not approved.
- There is no rate-effected-date model, so historical pay rates cannot be reconstructed; opening time-based obligations will need evidenced rates.
- Supplier identity is a text snapshot with no master; supplier payables/payments need a supplier entity decision.
- No agency concept exists; introducing one affects contractor onboarding, payments, and CIS ownership (agency may operate CIS verification/deduction, not Sculpt Projects).
- VAT basis of all existing commercial values remains unknown and must not be assumed.