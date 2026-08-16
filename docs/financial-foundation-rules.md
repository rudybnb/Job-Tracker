# Financial Foundation Rules

## 1. Scope And Decisions

This Phase 3B design locks the minimum rules needed before client receivables, supplier payments, VAT/CIS controls, and Monzo integration. It does not create a bookkeeping ledger or define VAT calculations.

This was an offline source audit. No database was accessed, so deployed columns, historical values, duplicates, and opening positions remain unverified.

The locked decisions are:

1. New taxable financial documents preserve `net_amount`, `tax_amount`, `gross_amount`, and `currency_code` separately.
2. Existing values remain `UNKNOWN/AMBIGUOUS` unless their source explicitly proves an amount basis. Names such as cost, price, total, actual, or gross entitlement do not prove VAT basis.
3. Historical balances enter financial control as explicit opening positions, not invented invoices, payments, or bank transactions.
4. `jobs.id` is the only canonical project identity.
5. `clients.id` is the canonical client identity. `jobs.client_name` remains a historical/project snapshot.
6. Company facts and project facts remain distinguishable even when one source document affects both.
7. Management event categories classify source facts for reporting; they are not a double-entry journal.
8. Future Monzo transactions are bank evidence. They reconcile to, but never overwrite, invoices, valuations, payments, or receipts; dated bank evidence validates an opening bank position without pretending the opening is a transaction.

## 2. Canonical Money Model

### Required fields

Where tax treatment can affect a document or line, preserve:

| Field | Meaning |
| --- | --- |
| `net_amount` | Value before separately stated tax |
| `tax_amount` | Separately stated tax component; the calculation/treatment rules are deferred |
| `gross_amount` | Total document or line value including the separately stated tax component |
| `currency_code` | Required uppercase ISO 4217 three-letter code |

The basic stored invariant is:

```text
gross_amount = net_amount + tax_amount
```

Example:

```text
net_amount   = GBP 100.00
tax_amount   = GBP  20.00
gross_amount = GBP 120.00
```

This arithmetic invariant does not decide whether tax applies, the tax rate, tax point, recoverability, reverse charge, or rounding method. Those are later VAT/CIS policy decisions.

### Amount-basis rules

- Use fixed-precision decimal money, normally two decimal places for GBP document totals. Unit rates may retain the existing six-decimal precision.
- All components on one line/document use the same `currency_code`.
- Do not derive a missing historic component by assuming a VAT rate.
- Zero `tax_amount` is valid only when the source explicitly records zero tax or a reviewed treatment. It must not mean "unknown tax."
- Credits and reversals use an explicit document/event type and relationship. Do not overload a positive invoice with a negative amount or silently rewrite it.
- Header totals must reconcile to their lines, but the exact line/header tax-rounding policy is deferred.
- An amount-basis status is needed during transition: `NET_TAX_GROSS_CONFIRMED`, `CASH_MOVEMENT`, or `UNKNOWN_LEGACY`. This status describes evidence quality; it does not calculate tax.

### Cash settlements

Bank and cash movement records preserve the amount that actually moved. Net/gross tax basis is not applicable to a cash row itself. For normal invoice settlement the transferred amount may settle gross invoice value, but the bank row alone does not explain its net, tax, retention, CIS, credit, or multi-document composition.

```text
cash movement amount = actual amount transferred
document allocation = how that cash settles one or more outstanding balances
```

The source document remains authority for net/tax/gross composition. An ordinary invoice allocation uses its gross outstanding balance; contractor allocations may separately settle transferred cash, CIS, retention, and other components. Job cost and revenue reports show net and tax separately, including only tax proven irrecoverable under later policy as project cost.

## 3. Existing Money Field Audit

### Classification key

- **NET:** source explicitly says value before tax.
- **GROSS:** source explicitly says tax-inclusive document/line total.
- **UNKNOWN/AMBIGUOUS:** source does not prove the tax basis.
- **NOT APPLICABLE:** no amount field exists, the field is non-monetary, or the field is a confirmed cash movement for which document net/gross tax basis does not apply. Cash remains monetary and is separately labelled `CASH_MOVEMENT`.

No current commercial document provides a complete explicit net/tax/gross set. No current money field is safely classified as NET from repository evidence.

### Canonical procurement and contractor fields

| Structure | Current field | Type | Classification | Reason |
| --- | --- | --- | --- | --- |
| `supplier_invoice` | Header totals | Absent | NOT APPLICABLE | Header has identity, date, status, and currency but no monetary totals |
| `supplier_invoice_line` | `actual_unit_price` | `numeric(18,6)` | UNKNOWN/AMBIGUOUS | Actual billed unit price; VAT basis was deferred |
| `supplier_invoice_line` | `actual_line_value` | `numeric(18,2)` | UNKNOWN/AMBIGUOUS | Quantity x unit price, but net/gross basis is not declared |
| `purchase_order` | Header total | Absent | NOT APPLICABLE | Commitment values are held on lines |
| `purchase_order_line` | `agreed_unit_price` | `numeric(18,6)` | UNKNOWN/AMBIGUOUS | Agreed rate with no VAT basis |
| `purchase_order_line` | `ordered_line_value` | `numeric(18,2)` | UNKNOWN/AMBIGUOUS | Quantity x agreed rate with no VAT basis |
| `contractor_tender_rate` | `locked_unit_rate` | `numeric(18,6)` | UNKNOWN/AMBIGUOUS | Accepted rate; VAT basis absent |
| `contractor_tender_rate` | `locked_contract_value` | `numeric(18,2)` | UNKNOWN/AMBIGUOUS | Quantity x locked rate; VAT basis absent |
| `contractor_valuation` | Header total | Absent | NOT APPLICABLE | Incremental value is on lines |
| `contractor_valuation_line` | `current_value` | `numeric(18,2)` | UNKNOWN/AMBIGUOUS | Incremental approved work value; "gross entitlement" does not prove VAT-inclusive value |
| `contractor_payments` | `payment_amount` | `numeric(18,2)` | NOT APPLICABLE (cash movement) | Canonical ledger proves actual cash transferred; net/gross tax basis belongs to the settled document, and tax/deduction composition is absent |

Canonical structures above carry explicit currency on headers/lines where applicable. There is no exchange-rate or base-currency conversion model. Source references: `shared/schema.ts:515-741`, `shared/schema.ts:743-809`, `shared/schema.ts:949-1037`, and migrations `0011`, `0013`, `0014`, `0015`, `0016`, and `0017`.

### Budget, expenses, purchases, and summaries

| Structure | Current fields | Classification | Currency |
| --- | --- | --- | --- |
| `hbxl_resource_baseline` | `baseline_unit_rate`, `baseline_value` | UNKNOWN/AMBIGUOUS | Present but nullable; default GBP does not prove historical currency or VAT basis |
| Initializer `expenses` | `amount`, `unit_price` | UNKNOWN/AMBIGUOUS | Absent |
| `shared-cashflow.expenses` | `amount`, `unit_cost` | UNKNOWN/AMBIGUOUS | Absent |
| `material_purchases` | text `unit_cost`, `total_cost` | UNKNOWN/AMBIGUOUS | Absent |
| Canonical `jobs` | No direct budget/money columns | NOT APPLICABLE | Absent |
| Financial-route assumed `jobs` fields | `total_budget`, component budgets, `total_actual_cost`, `profit_loss` | UNKNOWN/AMBIGUOUS and not canonical schema fields | Absent |
| `project_master` | text `total_budget`, `quoted_price`, labour/material budgets and JSON breakdowns | UNKNOWN/AMBIGUOUS | Absent |
| `job_phases` / `sub_phases` | Budget and actual-cost summary fields | UNKNOWN/AMBIGUOUS | Absent |
| `phase_assignments` | `agreed_price`, `materials_cost` | UNKNOWN/AMBIGUOUS | Absent |
| `milestones` | `milestone_amount` | UNKNOWN/AMBIGUOUS | Absent |
| `project_cashflow_weekly` | All forecast, actual, cumulative, budget, and variance text fields | UNKNOWN/AMBIGUOUS | Absent |

The initializer expense definition and active routes also disagree: the initializer has `supplier_name`, `receipt_image_url`, and no payment status; routes use `supplier`, `receipt_url`, and `payment_status`. A second incompatible expense shape exists in `shared-cashflow/schema.ts`. Source references: `server/financial-tables-core.ts:16-144`, `server/financial-routes.ts:470-590`, and `shared/schema.ts:1470-1594`.

### Client and payment-like fields

| Structure | Current fields | Classification | Currency |
| --- | --- | --- | --- |
| Canonical client invoices/receipts | Do not exist | NOT APPLICABLE | Not applicable |
| `clients` | `total_spent` | UNKNOWN/AMBIGUOUS mutable summary | Absent |
| `shared-cashflow.client_payments` | `invoice_amount`, `payment_amount`, `retention_amount` | UNKNOWN/AMBIGUOUS | Absent |
| `shared-cashflow.jobs` | `estimated_budget`, `actual_cost`, `client_payment_amount` | UNKNOWN/AMBIGUOUS | Absent |
| `project_cash_flow` | Client payments, retention, variations, costs, income/expense totals | UNKNOWN/AMBIGUOUS | Absent |
| `cash_flow_forecasts` | Expected client/retention receipts and projected costs | UNKNOWN/AMBIGUOUS | Absent |
| Integration change orders | `approved_amount_minor` | UNKNOWN/AMBIGUOUS | Explicit currency exists, but no tax basis |

`shared-cashflow.client_payments` combines invoice, retention, and one payment state. It is not suitable as the canonical receivable or cash ledger. Source references: `server/financial-tables-core.ts:5-15`, `shared-cashflow/schema.ts:22-45`, and `shared-cashflow/schema.ts:151-258`.

### Audit conclusion

Existing ambiguous values remain unchanged. A later migration may add reviewed amount-basis metadata or opening positions, but it must not relabel existing values as net, gross invoice value, or zero-tax by assumption. UI GBP formatting is not currency evidence.

## 4. Opening-Balance Strategy

### Purpose

Financial control needs a cutover without claiming that all historical documents and cash movements were created in Job Tracker. Opening balances are explicit positions at a cutover timestamp.

```text
current controlled position
  = approved opening position at cutover
  + effective post-cutover events
  - effective post-cutover settlements/reversals
```

Do not create fake old invoices, valuations, payments, receipts, VAT entries, CIS deductions, retention releases, or Monzo transactions.

### Proposed logical structures

`financial_opening_balance_set` identifies one controlled cutover:

- cutover date/time;
- company and reporting currency policy;
- source/reference and evidence location;
- status: `DRAFT`, `APPROVED`, `SUPERSEDED`;
- prepared/approved actor and time;
- notes and completeness statement.

`financial_opening_position` contains the detail:

- opening balance set;
- category;
- `currency_code`;
- neutral non-negative `position_amount` plus payable/receivable or debit/credit direction;
- `net_amount`, `tax_amount`, and `gross_amount` only where source evidence separately proves that composition;
- amount-basis status, including `UNKNOWN_LEGACY`;
- nullable `job_id`, `client_id`, contractor/supplier identity, bank account, tax period, contract, or retention relationship as appropriate;
- original external document/reference and due date where known;
- source evidence, reason, review status, approver, and timestamp.

### Supported opening categories

| Opening category | Scope and minimum detail |
| --- | --- |
| Bank cash | Company-level by bank account and currency; actual balance at cutover |
| Client debtor | Company receivable, with `job_id` and `client_id` where proven; preserve external invoice/reference and due date where known |
| Supplier creditor | Company payable, with `job_id` where proven and supplier identity; preserve reference/due date |
| Contractor creditor | Company payable, with `job_id`, contractor, and package/valuation reference where proven |
| VAT payable/recoverable | Company-level by VAT period/cutover evidence, with direction explicit |
| CIS liability | Company-level by CIS period/cutover evidence |
| Retention receivable | Project/client-contract scoped where proven, with expected release date |
| Retention payable | Project/contractor-package scoped where proven, with expected release date |
| Other receivable/payable | Company or proven project scope, named category, counterparty/reference, due date, and evidence |
| Financing/overdraft | Company-level by facility/account and currency; debt is not positive bank cash or available headroom |

### Controls

- Opening positions use category and direction, never a signed ambiguous amount.
- An `UNKNOWN_LEGACY` balance uses only `position_amount`; it is never copied into `net_amount`, `tax_amount`, or `gross_amount` by assumption.
- Project/client links are nullable only when genuinely unproven. Unmapped balances remain company totals and cannot appear against a guessed job/client.
- Detail must reconcile to the approved opening control total by category and currency.
- Adjusting an approved opening set requires an explicit superseding set or controlled adjustment, never silent editing.
- Post-cutover source documents must not duplicate amounts already included in opening positions. Cutover reports need an `opening`, `post_cutover`, and `total` breakdown.
- Opening client/supplier/contractor items can be settled by future receipts/payments through explicit allocation to the opening position without manufacturing the missing historic document.
- Company financial views carry a completeness flag until all required categories are approved or explicitly declared zero/not applicable.

## 5. Canonical Project Identity

`jobs.id` remains the single canonical project root. Every new project-scoped financial header must have a required `job_id -> jobs.id`. Child lines inherit project identity through that header and must not carry an independently conflicting project key.

### Existing project identity paths

| Path | Current use | Decision |
| --- | --- | --- |
| Canonical `job_id -> jobs.id` | HBXL baseline, procurement requirements, quotes, POs, receipts, supplier invoices, contract packages, valuations, contractor payments | Reuse |
| Initializer nullable `job_id` | `job_phases`, `expenses`, `budget_alerts` | Reconcile before financial use; future financial facts require a non-null canonical job where project-scoped |
| Phase/assignment chain only | `sub_phases`, `phase_assignments`, `milestones`, `work_hours` | Classification/legacy chain, not a new project identity |
| `project_master.id` | Independent project/cashflow root | Preserve but do not expand or use for new finance |
| Text `project_id` plus `project_name` | `project_cashflow_weekly`, `material_purchases` | Legacy evidence only; no assumed FK |
| Free-text `hbxl_job`, phase, location | Legacy assignments/progress/report matching | Provenance/display only; never financial identity |
| Alternate cashflow `jobs` definitions | `shared-cashflow` and `CASHFLOW_FILES` | Noncanonical; do not use for new finance |

`project_master` is not deleted in Phase 3B. A future crosswalk records source table/key, target `jobs.id`, evidence, mapping status, reviewer, time, and reason. Name, address, postcode, client text, HBXL text, supplier, invoice number, date, amount, and phase are not sufficient for automatic mapping. Unresolved means unmapped.

The weekly labour calculation currently accepts a project ID but does not filter work sessions by that project, and another cashflow report uses contractor names/location matching and synthetic rates. Neither is project financial authority.

## 6. Canonical Client Identity

`clients.id` is the canonical client identity after its ownership and duplicate policy are normalised. It currently exists only in the financial initializer and has no reliable uniqueness rule.

`jobs.client_name` remains unchanged as the historical/project snapshot. It is useful for display and provenance but is not a foreign key and must not be used to infer a client automatically.

Future project client relationship:

```text
jobs.id
  -> nullable reviewed clients.id
  + preserved jobs.client_name snapshot
```

Future client invoice and receipt records use both:

- required `job_id` for project-scoped sales;
- required `client_id` once the job/client relationship is confirmed;
- an immutable client name/address snapshot on the issued document where legally/commercially needed.

During controlled transition, a historical opening debtor may have a proven client but an unresolved job, or a proven job with an unresolved canonical client. Such rows remain explicitly unresolved; no name match fills the gap.

### Parallel client paths and risks

- `project_master.client_name` is free text and has no `client_id`.
- Canonical `jobs` has only `client_name` today.
- Active financial routes assume `jobs.client_id`, but that column is absent from `shared/schema.ts`.
- `shared-cashflow.client_payments` has `job_id` but no canonical `client_id` and combines invoice/payment facts.
- `clients.total_spent` and `active_jobs` are mutable summaries, not identity or financial facts.
- Similar names, emails, addresses, and project names are review evidence only, not automatic deduplication authority.

## 7. Company And Project Money

Scope is explicit on every fact:

| Fact | Company effect | Project effect |
| --- | --- | --- |
| HBXL original budget | None directly | Project budget |
| Purchase order | Company commercial commitment | Project committed cost |
| Supplier invoice for a job | Company supplier payable | Project incurred cost and tax trace |
| Contractor valuation | Company contractor entitlement/payable | Project incurred contractor cost |
| Client invoice | Company receivable | Project invoiced value/revenue evidence |
| Supplier/contractor payment | Company cash out and liability settlement | Project cash paid when allocated |
| Client receipt | Company cash in and receivable settlement | Project cash received when allocated |
| VAT liability/recoverable | Company tax position | Traceable document tax; only irrecoverable tax becomes project cost under later policy |
| CIS liability | Company HMRC liability | Traceable to contractor settlement/payment and job, but not extra project cost |
| Retention | Company receivable/payable | Project/client contract or contractor package balance |
| Bank balance/Monzo transaction | Company cash evidence | Project attribution only through reviewed reconciliation/allocation |
| Company overhead | Company cost | No `job_id` unless a controlled allocation policy later assigns it |

Rules:

- A company tax or bank fact does not require a fake project.
- A project supplier/client/contractor document also contributes to company-wide balances.
- `job_id` is required when the originating commercial fact belongs to one project.
- Company-only records have an explicit company scope and nullable/no `job_id`; null must not mean "unknown project" when a project should exist.
- Company totals aggregate project facts plus genuine company-only facts once, by category and currency.

## 8. Financial Event Categories

These are management classifications over authoritative source records. They do not create one generic financial-event posting table. Phase 3A's seven fact types are the economic model; the nine Phase 3B labels are reporting classifications. `CASH_IN` and `CASH_OUT` are directions of actual cash. `OPENING_BALANCE` is an orthogonal pre-cutover provenance label, so an opening supplier creditor enters `PAYABLE` totals once and is separately identified as opening.

| Category | Meaning | Existing/future source |
| --- | --- | --- |
| `BUDGET` | Approved or original planning baseline | Original selected `hbxl_resource_baseline`; legacy budgets remain ambiguous migration evidence |
| `COMMITMENT` | Authorised future commercial cost not yet replaced by incurred cost | Effective `purchase_order_line`; effective awarded contractor rates/packages |
| `PAYABLE` | Amount owed to a supplier/contractor/other creditor | Approved `supplier_invoice`; incremental approved contractor valuation split by future settlement; approved opening creditor |
| `RECEIVABLE` | Amount owed by a client/other debtor | Future issued client invoice; approved opening debtor |
| `CASH_IN` | Cleared company cash received | Future client receipt; future matched Monzo credit is bank evidence for it |
| `CASH_OUT` | Cleared company cash paid | Existing effective `contractor_payments`; future supplier payment; future matched Monzo debit is bank evidence for it |
| `TAX_LIABILITY` | Requested management category for tax position, with mandatory `PAYABLE` or `RECOVERABLE` direction | Future VAT/CIS period facts and explicit tax opening positions |
| `RETENTION` | Contractual amount withheld, payable or receivable | Future origin-linked retention/release facts and retention opening positions |
| `OPENING_BALANCE` | Explicit pre-cutover position | Approved opening position only; never presented as a historic transaction |

One source can affect management views in related ways without being duplicated. For example, a supplier invoice is primarily a `PAYABLE`, contributes approved project cost, and exposes a tax component. It does not become `CASH_OUT` until a separate payment occurs. A Monzo debit is cash evidence, not a second supplier invoice.

## 9. Monzo Readiness

### Future bank account identity

A future `bank_account` needs:

- internal ID;
- provider (`MONZO`);
- provider account ID stored securely as an external identifier;
- account display name/type;
- `currency_code`;
- restricted/unrestricted status;
- active/closed status;
- import cursor/freshness metadata without storing API credentials in financial rows.

### Future bank transaction evidence

A future `bank_transaction_evidence` needs:

- bank account ID;
- provider transaction ID, unique within provider/account;
- provider-created and settled/booked date/time where supplied;
- original signed amount in minor units or equivalent lossless provider value;
- canonical non-negative amount plus explicit `CREDIT`/`DEBIT` direction;
- `currency_code`;
- counterparty identity where supplied;
- description/reference;
- transaction status, including pending, settled, reversed/declined where supplied;
- balance after transaction if supplied, clearly marked provider-reported;
- source payload hash, imported/updated timestamps, and provider metadata needed to explain updates;
- reconciliation status: `UNMATCHED`, `PART_MATCHED`, `MATCHED`, `IGNORED`, or `REVIEW_REQUIRED`.

Pending and settled versions of the same provider transaction update the bank-evidence lifecycle by provider ID; they must not create duplicate cash. Provider reversals/refunds remain identifiable evidence, not destructive deletion.

### Reconciliation links

A separate `bank_reconciliation_link` relates bank evidence to Job Tracker records:

- bank transaction evidence ID;
- target type and controlled target reference: supplier payment, contractor payment, client receipt, tax remittance/refund, retention settlement, inter-account transfer, bank fee, or reviewed other cash event;
- allocated cash amount and currency;
- match method (`MANUAL`, `RULE_SUGGESTED`, `EXACT_REFERENCE`, or later approved method);
- status, reviewer, time, reason, and reversal/unmatch history.

The relationship must support:

- one bank transaction settling several documents/payments;
- several bank transactions settling one obligation;
- part matches;
- fees or unrelated components;
- paired company-account transfer legs with one transfer identity;
- unmatched bank transactions awaiting review.

### Monzo boundaries

- Monzo is authority for bank evidence, not for project identity, invoice value, valuation value, VAT treatment, CIS calculation, retention, or profit.
- Import never updates source commercial documents.
- Text similarity, amount, date, and counterparty may suggest a match but cannot silently confirm one.
- A matched Monzo row confirms/reconciles cash; it must not create a second `CASH_IN` or `CASH_OUT` if a payment/receipt already records that event.
- Accepted bank balance snapshots determine the controlled account balance. Transactions explain movement and reconciliation and are never summed on top of a snapshot as a second cash balance.
- Unmatched credits/debits remain visible bank evidence but unclassified for project/payable/receivable reporting until reviewed.
- Opening bank positions are validated against dated bank evidence, not reconciled as if they were transactions.
- Paired transfers between company accounts appear as account-level debit/credit movements but have zero consolidated company cash effect. Bank fees remain company `CASH_OUT` unless a later controlled project allocation applies.
- Bank balances are company-level by account/currency. Provider balance snapshots need timestamp and freshness controls before use in true available cash.
- API credentials, refresh tokens, webhook secrets, and personal authentication data are integration-security concerns and must not be stored in transaction or reconciliation records.

No Monzo connection or API contract is implemented in Phase 3B.

## 10. Risks And Required Decisions

- Deployed legacy schema/data was not inspected; source definitions and active routes conflict.
- Existing supplier invoices, POs, valuations, HBXL values, expenses, budgets, and legacy client values have unknown tax basis.
- Existing currency defaults and GBP UI formatting may not describe historical source currency.
- Opening balances can be duplicated if post-cutover documents include pre-cutover value without explicit allocation/cutover controls.
- `project_master`, text project IDs/names, HBXL job text, alternate cashflow schemas, and phase-only chains compete with `jobs.id`.
- `clients` has no canonical schema ownership or uniqueness policy yet, while routes assume a nonexistent `jobs.client_id`.
- Legacy cashflow labour attribution can count sessions without a real project FK.
- Monzo pending/settled updates, reversals, fees, transfers between company accounts, and split settlements require reconciliation rules to avoid duplicate cash.
- Tax amount basis can be locked now, but VAT rate/treatment, recoverability, tax point, reverse charge, CIS timing/base, and rounding need accountant-approved rules before tax implementation.
- Multi-currency reporting requires an explicit conversion model later; this phase prohibits silent conversion.

## 11. Recommended First Finance Migration

The first actual finance migration should be a **financial identity and opening-position foundation**, not client invoices, supplier payments, VAT, or Monzo ingestion.

Minimum scope:

1. Prerequisite: perform an authorised read-only deployed-schema/data inventory and assess table collisions, duplicates, ID types, nulls, and FK feasibility. This is not part of Phase 3B's offline audit.
2. Bring `clients` under canonical migration/schema ownership without changing or deduplicating historical rows automatically.
3. Add nullable `jobs.client_id -> clients.id` while preserving `jobs.client_name` unchanged.
4. Add reviewed legacy project/client crosswalk structures with unresolved states and no guessed backfills.
5. Add `financial_opening_balance_set` and `financial_opening_position` with category, scope, currency, neutral position amount, optional proven net/tax/gross composition, provenance, approval, cutover, and completeness controls.
6. Add only the minimum shared amount-basis convention needed by those opening positions; do not reinterpret existing commercial amount columns.

This migration establishes who and what future finance belongs to, and where controlled history starts. The next migration can then add complete client receivable documents or supplier settlement records using required `job_id`, reviewed `client_id`, and explicit net/tax/gross/currency fields.
