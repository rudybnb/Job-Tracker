# Company Financial Control Model

## 1. Purpose And Boundary

This is the Phase 3A design for management financial control. It answers what Sculpt Projects owns, owes, has committed, has paid or received, and is likely to pay or receive. It does not replace bookkeeping, bank reconciliation, statutory accounts, payroll, or HMRC submission.

Phase 3B foundation rules in `docs/financial-foundation-rules.md` govern amount basis, opening positions, canonical project/client identity, company/project scope, event categories, and future Monzo evidence. Where this document uses an existing amount whose basis has not been proven, that value remains `UNKNOWN/AMBIGUOUS`.

The model keeps seven facts separate:

```text
BUDGET -> COMMITMENT -> ACCRUAL / LIABILITY -> ACTUAL CASH
                                      |
RECEIVABLE ---------------------------+
TAX LIABILITY and RETENTION remain separately identifiable
```

The seven canonical fact types are: **(1) budget, (2) commitment, (3) accrual/liability, (4) actual cash, (5) receivable, (6) tax liability, and (7) retention**. Cash direction and retention direction are attributes, not extra fact types. Each source record has one primary type: HBXL baseline is budget; PO or awarded package is commitment; approved invoice or incremental valuation is accrual/liability; payment or receipt is actual cash; client invoice is receivable; posted VAT/CIS is tax liability; and a contractual hold is retention.

No database was accessed for this audit. The findings describe repository definitions and code, not confirmed deployed schema or data.

### Control principles

1. `jobs` is the canonical project root. Reports must not treat `project_master` as a second project identity.
2. A source document is authoritative only for its own fact type. A PO is not a payable; an invoice is not a payment.
3. Approved commercial evidence is corrected by cancellation, reversal, credit, or replacement, not silent editing.
4. New taxable documents preserve net, tax, gross, and currency separately. Existing values are not treated as net or gross without evidence. No currencies are added together without a dated, identified conversion policy.
5. Project cost and revenue will be reported net of recoverable VAT once recoverability rules exist. Irrecoverable VAT is cost. Cash forecasts use expected transferred cash amounts.
6. Derived totals are read models, not new posting ledgers.
7. Legacy rows are not matched automatically by similar project, supplier, invoice number, date, description, or amount.

## 2. Current Financial Structures

### Canonical structures to reuse

| Structure | Existing role | Financial-control use |
| --- | --- | --- |
| `jobs` | Canonical project root | Project dimension; later link to a canonical client and commercial terms |
| `hbxl_resource_baseline` | Immutable imported quantity, rate, and value by source revision | Original cost budget, using the explicitly selected original commercial revision |
| `purchase_order` / `purchase_order_line` | Authorised supplier quantity and agreed value snapshot | Supplier commitment only while economically effective |
| `goods_receipt` / `goods_receipt_line` | Received, accepted, and rejected quantity evidence | Reconciliation and accrual warning; not cash and not automatically a payable |
| `supplier_invoice` / `supplier_invoice_line` | Supplier-billed actual cost with approval controls | Approved supplier accrual/payable; needs tax, due-date, credit, and settlement support |
| `contract_package`, `contractor_tender_rate` | Awarded scope and locked contractor value | Contractor commitment basis, subject to package status and remeasurement policy |
| `contractor_valuation` / `contractor_valuation_line` | Approved work quantity valued at locked rates | Contractor accrued cost and pre-deduction approved work value; existing VAT basis is unknown |
| `contractor_payments` | Actual cash paid, with exact reversals | Contractor cash out; keep and link to future settlement allocation |
| `clients` | Initializer-owned client record | Reuse after ownership, identity, and `jobs.client_id` are normalised |
| `expenses` | Initializer-owned mutable general expense record | Candidate for controlled non-procurement cost evidence only after schema/data reconciliation |
| `budget_alerts` | Derived alerts | Consumer of project financial read model, never financial authority |

Canonical ownership is recorded in `server/table-manifest.ts`. Existing commercial semantics are documented in `docs/purchase-order-ledger.md`, `docs/goods-receipt-supplier-invoice-ledger.md`, and `docs/contractor-actual-payment-ledger.md`.

### Legacy and reporting structures

| Structure | Current condition | Decision |
| --- | --- | --- |
| `material_purchases` | Text-valued asserted invoice/purchase lines with no canonical job, PO, supplier, or invoice FK; also accepts manual entries | Preserve as legacy evidence. Do not sum with canonical supplier invoices or expenses without a reviewed bridge |
| `project_cashflow_weekly` | Editable text-valued forecast/actual snapshot | Reporting consumer only. Rebuild from canonical facts or retire later |
| `project_master` | Parallel project root containing text budgets, quote, and JSON schedules | Do not expand. Reconcile useful commercial attributes to `jobs` and future project terms |
| `shared-cashflow.project_cash_flow` | Weekly aggregate income and expenses | Noncanonical snapshot; not source evidence |
| `shared-cashflow.cash_flow_forecasts` | Editable weekly forecast totals | Possible migration input, not the future forecast authority |
| `shared-cashflow.client_payments` | Combines invoice, retention, and payment in one row | Not suitable as the canonical receivable model |
| `job_phases` / `sub_phases` | Store mutable budget and actual summary columns | Classification/reporting only; do not make summary columns source facts |
| `milestones` | Combines milestone amount and payment state | Scope/milestone evidence only; not a substitute for invoice or receipt records |

### Existing route and report risks

- `server/financial-routes.ts` exposes mutable and deletable expenses and computes a dashboard from assumed `jobs` columns that are absent from the canonical `shared/schema.ts` definition.
- The initializer defines `expenses.supplier_name`, `receipt_image_url`, and `expense_category`; active routes use `supplier`, `receipt_url`, and `payment_status` instead.
- A second incompatible `expenses` definition exists in `shared-cashflow/schema.ts`.
- Weekly cashflow routes create and update snapshots. Comments claim authentic derived actuals, but the stored material actual is independently editable.
- Existing project cashflow reporting uses synthetic assumptions such as fixed labour rates and markup. It is not a financial control report.
- Existing CIS calculations are time/pay estimates and are not linked to approved valuations, deductions, payments, or HMRC liabilities.
- Existing voice finance queries fetch external Financeflow balances. That feed is not currently reconciled to project cash events and must not silently become the control model's bank authority.
- There are no canonical client invoice/receipt, supplier payment, VAT, CIS liability, retention, or credit records.

## 3. Canonical Financial Facts

| Fact type | Canonical event | Value recognised | Effective state |
| --- | --- | --- | --- |
| Budget | Original HBXL baseline | Original expected project cost | Rows in the selected original imported commercial revision |
| Commitment | Supplier PO | Ordered value not yet replaced by approved invoice cost | `APPROVED`, `SENT`, `PART_ORDERED`, `ORDERED`, `COMPLETED`; exclude `DRAFT`, `CANCELLED` |
| Commitment | Awarded contractor package/rates | Locked awarded value not yet valued | Only an explicitly awarded/effective package; final status rules must be locked before implementation |
| Accrual / liability | Supplier invoice | Approved net cost, VAT, and gross payable | `APPROVED`, less approved credits and settlements |
| Accrual / liability | Contractor valuation | Incremental approved work value before settlement deductions | Economically consumed `APPROVED` and `SUPERSEDED` lines; never cumulative certificate totals; existing VAT basis is unknown |
| Actual cash out | Supplier payment | Cleared amount paid | Future cleared/paid status, less exact reversals |
| Actual cash out | Contractor payment | Cleared net cash paid | Existing `PAID`, less exact `REVERSED` rows |
| Receivable | Client invoice/valuation | Amount legally or contractually due from client | Future issued/approved state, less credits, retention withheld, and receipts |
| Actual cash in | Client receipt | Cleared amount received | Future cleared status, less exact reversals/refunds |
| Tax liability | VAT period | Output VAT less recoverable input VAT and adjustments | Posted source documents allocated to a VAT period |
| Tax liability | CIS deduction | CIS withheld when a contractor payment/allocation is posted | Deducted and not remitted/reversed |
| Retention payable | Contractor retention | Approved entitlement withheld from contractor | Withheld less released/credited amount |
| Retention receivable | Client retention | Invoiced entitlement withheld by client | Withheld less released/credited/received amount |

Named reporting predicates should implement these rules: `is_economically_effective`, `is_approved_cost`, and `is_cleared_cash`. Their status mappings must be tested against the canonical migrations before implementation. `RECEIVED`, `UNDER_REVIEW`, `DISPUTED`, `DRAFT`, `PENDING`, and `SCHEDULED` facts can appear as recorded exposure, workflow, or forecast items, but not as approved-for-payment or cleared balances unless explicitly stated. A commercial dispute does not by itself prove that an external obligation or VAT tax point has ceased.

## 4. Proposed Future Entities

These are logical entities, not a migration specification. Prefer extending an existing canonical header where its identity is already correct; do not create duplicate documents merely to add financial fields.

| Entity | Priority | Minimum purpose and fields |
| --- | --- | --- |
| `project_commercial_terms` | Minimum | `job_id`, `client_id`, original contract value, approved variation value or links, currency, value basis, effective dates, status |
| `bank_account` | Minimum | Company account identity, currency, restricted/unrestricted flag, active status; no credentials |
| `bank_balance_snapshot` | Minimum | Account, cleared and provider-available balances, balance timestamp, source, acceptance actor/time, import/reference; latest accepted non-stale snapshot drives bank cash |
| `financial_opening_balance_set` / `financial_opening_position` | Minimum | Explicit cutover positions by category, currency, scope, identity, amount basis, source, approval, and completeness; never fake historic transactions |
| `bank_transaction_evidence` / `bank_reconciliation_link` | Later bank integration | Lossless provider transaction evidence and reviewed allocation to Job Tracker cash records; never overwrites commercial documents |
| `supplier_payment` | Minimum | Supplier, payment date, cleared status, transferred cash amount, currency, bank reference, reversal link |
| `supplier_payment_allocation` | Minimum | Payment-to-invoice allocation; supports partial and multi-invoice settlement |
| `client_invoice` / `client_invoice_line` | Minimum | Job, client, invoice/valuation number, issue and due dates, certified net, taxable net, VAT, amount due, retention, currency, status, source links |
| `client_receipt` | Minimum | Client, cleared date, transferred cash amount, currency, bank reference, reversal/refund link |
| `client_receipt_allocation` | Minimum | Receipt-to-invoice/retention allocation; supports part payments and one receipt covering several documents |
| `contractor_settlement` | Minimum | Valuation, approved pre-deduction work value, separately proven VAT, labour and material split, estimated CIS, retention withheld, approved adjustments, forecast cash payable, approval evidence |
| `contractor_payment_allocation` | Minimum | Existing payment-to-settlement allocation, including the CIS deduction posted for that paid/credited amount |
| `vat_period` | Minimum | Start/end dates, scheme, filing/payment due dates, opening position, status, submitted totals/reference if later supplied; no HMRC submission logic |
| `cis_period` | Minimum | Tax month, opening position, filing/payment due dates, status, deducted, adjusted, and remitted totals |
| `retention` | Minimum index | Direction, job, contract and exactly one originating invoice/settlement, due/release date, currency, status; original amount is controlled by the origin, not independently editable |
| `retention_release` | Minimum | Retention, released amount/date, invoice or settlement link, approval and reversal evidence |
| `supplier_credit_note` / `client_credit_note` | Minimum | Original document link, net/VAT/gross credit, reason, issue date, status, currency; document-specific tax treatment |
| `contractor_adjustment` | Minimum | Settlement/valuation relationship, typed approved adjustment, tax effect, reason, status; never rewrites approved work quantity |
| `cash_forecast_item` | Deferred until needed | Dated non-document cash expectation, direction, job/company scope, category, amount, currency, confidence/scenario, source, status |

Do not add a generic double-entry ledger in this phase. If statutory accounting integration is later required, export these controlled source facts to bookkeeping rather than making operational tables imitate a chart of accounts.

### Shared document requirements

Financial documents should carry `currency_code`, lifecycle status, source/provenance, approval actor/time, created time, and explicit reversal/cancellation relationships. Money should use fixed-precision numeric types. Derived outstanding balances should not be editable columns. Controlled status, due-date, snapshot-acceptance, and policy changes need append-only actor/time/reason audit history; this is audit metadata, not a bookkeeping ledger.

Where tax matters, the canonical amount set is `net_amount`, `tax_amount`, `gross_amount`, and `currency_code`, with `gross_amount = net_amount + tax_amount`. A zero tax value must be explicit, not a substitute for unknown. Bank/payment records preserve actual cash transferred; net/gross tax basis belongs to source documents and their settlement allocations.

## 5. VAT Model

### Document values

Every taxable client, supplier, credit, and applicable contractor settlement line needs:

- `net_amount`;
- `vat_rate`, preserving the rate used at the tax point rather than looking up today's rate;
- `vat_treatment`: at minimum `STANDARD`, `REDUCED`, `ZERO`, `EXEMPT`, `OUT_OF_SCOPE`, and `REVERSE_CHARGE`;
- `vat_amount`;
- `gross_amount`;
- `tax_point_date`;
- `vat_recoverability` or recoverable VAT amount for purchase documents;
- VAT status, accounting scheme, and allocation to a `vat_period` when posted.

The existing `supplier_invoice_line.actual_line_value` has no declared net/gross/VAT meaning. Do not reinterpret historic values. A reviewed migration must establish the amount basis or mark it unknown before VAT reporting.

### Calculations

For one VAT period and currency:

```text
output VAT = taxable output VAT - output credit VAT + output/reverse-charge adjustments
recoverable input VAT = recoverable purchase VAT - recoverable VAT reversed by supplier credits + input/reverse-charge adjustments
VAT position = output VAT - recoverable input VAT - VAT payments + VAT refunds
```

A positive VAT position is payable; a negative position is recoverable. Reverse-charge amounts must be identified separately even where their net cash effect is zero. Project profitability excludes recoverable VAT but includes irrecoverable VAT. Cash forecasts include gross invoice/receipt cash and separately include the VAT payment/refund on its expected date.

VAT is period-based, not a running percentage of bank cash. Inclusion is determined by the configured invoice/cash accounting scheme, tax point, valid cancellation or credit, and filed-period adjustment rules. Commercial approval, dispute, or payment status does not by itself add or remove VAT. Domestic reverse-charge output and input amounts remain separately visible even where net tax cash is zero. Period locks and later adjustments must preserve the submitted period history.

## 6. CIS Model

CIS is a settlement and tax-liability fact, not contractor work valuation. `contractor_valuation` continues to prove approved quantity and pre-deduction work value; its existing VAT basis remains unknown.

For each approved contractor settlement, preserve:

- approved valuation amount before deductions;
- VAT separately, if applicable under the selected VAT treatment;
- labour element subject to CIS;
- material and other excluded elements;
- CIS verification status and deduction rate used at settlement time;
- estimated CIS deduction amount before payment;
- retention and other deductions separately;
- net cash payable;
- expected CIS period and statement/reference evidence; the posted deduction receives the actual `cis_period_id`.

```text
CIS tax base = eligible labour element
CIS estimated = round(CIS tax base x deduction rate, 2)
net contractor cash payable
  = approved work value before deductions
  + VAT cash amount
  - CIS estimated
  - retention withheld
  +/- approved settlement adjustments
```

The precise statutory CIS base, payment/credit timing, partial-payment allocation, and domestic reverse-charge VAT interaction must be confirmed with Sculpt Projects' accountant before implementation. Existing hard-coded 20%/30% time-report calculations are not posted CIS facts. The approved settlement supplies a forecast estimate; the actual CIS deduction event is posted against the amount paid or credited and assigned to its CIS period.

```text
CIS liability to HMRC
  = CIS deductions posted on contractor payments/credits in the period
  + approved CIS adjustments
  - CIS remittances
```

Paying a contractor clears only the net cash component. The CIS component remains a company liability until remitted to HMRC. It is not profit and must not be counted as available cash.

## 7. Retention Model

Retention must use one controlled model with an explicit direction, while keeping contractor and client relationships distinct.

### Retention payable

This is approved contractor entitlement withheld by Sculpt Projects:

```text
original retention payable = retention withheld on approved settlements
remaining retention payable = original + adjustments - released - cancelled
```

It remains part of project incurred cost and company liabilities even though it has not left the bank. It enters the cash forecast on its contractual release date or best approved expected date.

### Retention receivable

This is client invoice value withheld from Sculpt Projects:

```text
original retention receivable = retention withheld on issued client invoices
remaining retention receivable = original + adjustments - released - credited - received
```

It remains a receivable, shown separately from currently due trade debt. It enters expected cash only when a release/due date is known; it is not available cash before receipt.

Each retention record needs job, client contract or contractor package, originating invoice/settlement, origin-controlled original amount, released amount through release rows, remaining derived amount, currency, due/release date, status, and evidence for date changes. Releases create or link to the relevant client invoice, receipt, contractor settlement, and payment; they do not overwrite the original hold.

## 8. Client Sales And Receivables

No suitable canonical client sales ledger exists. The noncanonical `client_payments` table combines invoice and payment facts and cannot reliably represent multiple payments, credits, or retention releases.

The future flow is:

```text
project commercial terms / approved client valuation
-> client invoice issued
-> net + VAT = gross invoice
-> retention withheld is identified
-> one or more client receipts allocated
-> credits/refunds allocated
-> outstanding trade and retention balances derived
```

For an issued client invoice, preserve `certified_net_before_retention`, `retention_net_withheld`, `taxable_net`, `vat_amount`, `invoice_amount_due`, and any VAT attributable to retained value under the approved tax policy. Do not derive the current due amount by blindly subtracting retention from an ambiguous gross total.

Then:

```text
outstanding trade balance
  = invoice amount due + debit adjustments - allocated credits - cleared receipt allocations
retention receivable = retention withheld - releases/credits/receipts
total client receivable = outstanding trade balance + remaining retention receivable
```

`client invoiced` is issued invoice net value for project reporting, with VAT reported separately; it is not automatically earned revenue. `client paid` is cleared receipt allocations, not invoice status text. A receipt may be unallocated temporarily: it reduces company cash exposure where the client is known, but not a project's invoice balance until allocated. Due date drives aging: current, overdue, 1-30, 31-60, 61-90, and 90+ days.

## 9. Supplier And Contractor Payables

### Supplier payable

Only approved supplier invoices create the normal supplier payable:

```text
supplier invoice gross payable
  = approved invoice net + VAT + approved debit adjustments - allocated approved credits
outstanding supplier payable
  = gross payable - cleared supplier payment allocations
```

Show `recorded supplier exposure`, `approved-for-payment payable`, and `disputed amount` separately. `RECEIVED`, `UNDER_REVIEW`, and `DISPUTED` invoices are not approved payment authority, but an unresolved external obligation is removed only by valid rejection, cancellation, or credit. True available cash policy must state whether recorded/disputed exposure is reserved. Goods accepted without an invoice remain part of the PO commitment and should appear as unbilled exposure; they must not be presented as an invoice payable or added again as a separate accounting accrual in this simple control model.

### Contractor payable

An approved valuation creates incurred project cost and contractor entitlement before settlement deductions. The settlement then splits who is owed:

```text
contractor cash payable = settlement net payable - cleared contractor payment allocations
CIS payable to HMRC = CIS withheld - CIS remitted
retention payable = retention withheld - retention released/settled
```

These components together explain settlement of the approved entitlement. Neither CIS nor retention reduces project cost. Existing `contractor_payments` remains actual cash evidence; it must not be changed into a work valuation or tax record.

## 10. Commitments, Actual Cash, And Credits

### Supplier commitment

For each effective PO line:

```text
uninvoiced PO commitment
  = max(0, effective ordered line value - approved linked invoice net value + credits that validly reopen the order)
```

Implementation should reconcile quantities as well as values because price variance means value subtraction alone can misstate the remaining order. A cancelled PO contributes zero future commitment. An approved invoice replaces the corresponding PO commitment with actual/accrued cost; it is never added on top of the full PO.

### Contractor commitment

For an effective awarded package:

```text
unvalued contractor commitment
  = max(0, locked awarded value + approved variations - cumulative approved valuation cost)
```

Remeasurement may make the locked value a forecast rather than a hard ceiling. The report must label that policy and show approved variations separately.

### Actual cash

- Bank/cash available comes from the latest accepted cleared bank balance snapshot per account.
- Supplier cash out comes only from cleared supplier payments less reversals.
- Contractor cash out comes only from `PAID` contractor payments less `REVERSED` rows.
- Client cash in comes only from cleared client receipts less reversals/refunds.
- Document dates, payment-status labels on expenses, and weekly cashflow actual columns are not cash evidence.
- Operational cash events must reconcile to bank transactions or accepted balance movements later. They do not replace bank truth.

### Credit adjustments

Credits are explicit approved documents linked to what they correct. They carry their own net, VAT, gross, date, currency, reason, and status. A credit reduces its source balance exactly once through an allocation; cash allocations apply only to the remaining debit balance, and unapplied credits are reported separately. A supplier credit may reopen PO commitment only where the goods remain ordered. A client credit reduces invoice value/receivable. A contractor downward correction uses an approved contractor adjustment and must not mutate approved quantity or use a negative payment row.

## 11. Project Profitability

All profitability measures use one currency and exclude recoverable VAT.

### Original budget

```text
HBXL original budget = sum(baseline_value)
```

Use the deliberately selected original imported commercial revision for the job, not whichever revision is currently marked current. Report rows with missing values, mixed currencies, and unresolved classification instead of silently treating them as zero. Preserve material, labour, plant, and other breakdowns.

### Cost measures

```text
supplier incurred cost
  = approved supplier invoice net + irrecoverable VAT - approved supplier credits

contractor incurred cost
  = incremental value of economically consumed APPROVED and SUPERSEDED valuation lines
  + irrecoverable VAT +/- approved contractor cost adjustments

other incurred cost
  = controlled approved non-procurement costs not represented above

actual cost (incurred) = supplier + contractor + other incurred cost

outstanding commitments
  = uninvoiced effective POs
  + unvalued effective contractor commitments
  + other approved commitments

current committed cost = actual cost + outstanding commitments

forecast remaining cost
  = outstanding commitments
  + explicitly forecast uncommitted work/cost
  - identified overlap between those two groups

expected final cost = actual cost + forecast remaining cost
```

For clarity, reports should also show `cash cost paid to date` separately. Payment timing never determines incurred project cost.

`contractor_valuation_line.current_value` is already an incremental event: current approved quantity less quantity consumed by earlier `APPROVED` or `SUPERSEDED` valuations, multiplied by the locked rate. Sum incremental lines once. Never sum cumulative certificates, and never subtract a `SUPERSEDED` valuation merely because it is no longer the current document; it retains consumed economic history. Future replacement/adjustment rules must explicitly identify any liability transfer so the same entitlement is not payable twice.

### Revenue and margin

```text
contract/client value = original agreed client value + approved variations
client invoiced = issued client invoice net - issued client credit net
client paid = cleared client receipt allocations, shown as transferred cash and net-of-tax allocation views
outstanding client balance = trade receivable + retention receivable

earned/certified revenue = value certified under the client contract policy, independent of invoice timing

expected final revenue = original agreed client value + approved variations

expected final profit = expected final revenue - expected final cost
expected margin % = expected final profit / expected final revenue x 100
```

Probable or unapproved revenue may appear only in a separately labelled upside scenario. If expected final revenue is zero, margin is `not applicable`, not zero.

### No-double-counting waterfall

For one cost, source precedence is `forecast -> commitment -> accepted/unbilled exposure -> invoice or valuation -> cash`. The supplier path progresses from PO commitment to approved invoice actual cost to payment cash out. The contractor path progresses from awarded commitment to approved incremental valuation cost to settlement components and payment cash out. Profit reporting uses incurred cost plus only the outstanding portion of commitments. Cash reporting uses payments/receipts and future due amounts. Stable source links must suppress lower-authority forecast, `expenses`, `material_purchases`, and snapshot values when a higher-authority fact represents the same cost. It never sums every stage.

## 12. Company Cash Position

### Position measures

At an `as_of` timestamp and by currency, the company view should show:

- cleared bank cash and provider-reported available cash;
- client trade receivables and retention receivable;
- supplier payables and contractor cash payables;
- uninvoiced PO and unvalued contractor commitments;
- VAT payable/recoverable;
- CIS payable;
- retention payable;
- expected cash in and out;
- true available cash;
- 30/60/90-day projected cash.

### True available cash

This is a management reserve calculation, not a bank or accounting balance. The default policy should be visible and configurable by control horizon.

```text
true available cash
  = unrestricted cleared bank cash from accepted non-stale snapshots
  - VAT reserve
  - CIS reserve
  - overdue and due-within-horizon supplier payables
  - overdue and due-within-horizon contractor cash payables
  - retention payable due within horizon
  - other approved liabilities due within horizon
  - near-term commitment reserve
```

Default assumptions:

- `VAT reserve` is the positive unremitted VAT position for open/submitted periods, not all output VAT in isolation. A recoverable position does not increase available cash until refund timing is sufficiently certain.
- `CIS reserve` is all posted, unremitted CIS deducted.
- The initial control horizon should be 30 days and displayed with the result.
- Near-term commitment reserve includes only uninvoiced commitments expected to become cash out within the horizon, using expected invoice/payment dates. It does not reserve every lifetime PO or contractor package.
- Amounts already represented by an approved payable are excluded from the commitment reserve.
- Scheduled payments are not subtracted twice from their underlying payable.
- Cleared but unapplied supplier payments offset known party exposure so the same cash is not reserved again; unallocated client receipts remain separately disclosed.
- Retention not contractually due within the horizon remains disclosed as a liability but is not deducted in the default 30-day measure.
- Overdraft or credit-card headroom is financing capacity, not bank cash. Restricted accounts are excluded unless released for operations.
- Pending bank debits, negative account balances, stale snapshots, disputed exposure, and approved obligations with unknown dates are disclosed as separate components and handled by a versioned policy rather than hidden.

The calculation does **not** add client receivables, expected receipts, recoverable VAT, unapproved variations, unused credit facilities, or low-confidence forecasts. Those belong in projected cash scenarios, not cash available today.

### Expected cash and 30/60/90 forecast

Document-backed forecast events use contractual due dates, amended only by an evidenced expected date. `cash_forecast_item` supplies only events that have no source document yet.

```text
expected cash in = due client invoice trade balances + due retention releases + approved forecast inflows
expected cash out = due supplier payables + contractor net payables + tax + retention releases + expected uninvoiced commitments + approved forecast outflows

projected closing cash for bucket N
  = prior bucket closing cleared cash
  + expected cleared inflows in bucket N
  - expected cleared outflows in bucket N
```

Use buckets `overdue/today`, days `1-30`, `31-60`, and `61-90`; the displayed 30/60/90 positions are cumulative. Produce at least two scenarios:

- **Contractual:** full document-backed amounts on contractual due dates plus high-confidence approved forecast items.
- **Expected:** evidenced expected dates and approved probability assumptions, with confidence visible.

Unknown-date and disputed items remain visible outside the timed total. Forecast runs must preserve `as_of`, opening bank snapshot, scenario, inclusion policy, and source drill-down so that two reports can be explained.

## 13. Minimum Jarvis Read Model

Jarvis should later read controlled views, not infer balances from raw tables or write financial facts.

| Read model | Minimum output |
| --- | --- |
| `company_financial_position` | `as_of`, currency, unrestricted cash base, bank/provider available cash, trade and retention receivables, supplier and contractor payables, retention payable, commitments, VAT/CIS, unapplied cash, every true-cash reserve component, unknown/disputed/excluded totals, true available cash, policy version/horizon, freshness, completeness |
| `company_obligation_detail` | Party, job, fact type, source document, amount, outstanding amount, due/expected date, age bucket, status, disputed flag, currency |
| `company_tax_position` | VAT period output/input/net/payment/refund and CIS period deducted/adjusted/remitted/outstanding, due dates and statuses |
| `company_cash_forecast` | Scenario, bucket, opening cash, expected in/out by fact type, closing cash, overdue and unknown-date totals, confidence and source count |
| `company_cash_movement` | Cleared date, direction, party, allocated job, payment/receipt source, amount, currency, allocation state, reversal/refund link, bank reconciliation state |
| `project_financial_position` | Contract value, approved variations, HBXL original budget, incurred actual cost, paid cash cost, outstanding commitments, current committed cost, remaining forecast, expected final cost/revenue/profit/margin, client invoiced/paid/outstanding, budget and margin flags |

These views answer:

- financial position today from `company_financial_position`;
- VAT and CIS held from `company_tax_position`;
- supplier, contractor, and client balances from `company_obligation_detail`;
- jobs over budget or losing margin from `project_financial_position`;
- committed cash and projected position from `company_cash_forecast`.

Every answer must include `as_of`, currency, source freshness, cutover/completeness state, and whether the value is actual, approved, committed, or forecast. Jarvis integration is outside Phase 3A.

## 14. Phased Implementation Order

### Phase 1: Authority and amount basis

1. Confirm deployed schema and data inventory without changing source facts.
2. Lock canonical status/inclusion rules, GBP/multi-currency policy, tax advice, and net/gross meaning of existing values.
3. Normalise `clients` ownership and add the canonical `jobs` client/commercial relationship.
4. Select and record each job's original HBXL commercial revision.
5. Establish controlled opening balances by party, job, currency, tax period, and fact type, with provenance and duplicate checks. Company totals remain explicitly incomplete until cutover is accepted.
6. Preserve opening balances as opening positions, not manufactured historical invoices, payments, receipts, valuations, or bank transactions.

### Phase 2: Missing settlement documents

1. Lock VAT, CIS, and retention policy needed by complete documents.
2. Add supplier invoice due dates and explicit net/VAT/gross treatment without reinterpreting history, then supplier payments and allocations.
3. Add complete client invoices, receipts, allocations, credits, retention, and project commercial terms.
4. Add complete contractor settlements, CIS deduction events, retention, and payment allocations while retaining existing valuations and payments.

### Phase 3: Tax, retention, and credits

1. Add VAT periods, opening positions, and period controls around document tax components.
2. Add CIS periods, opening positions, deductions, and remittances.
3. Complete retention release workflows.
4. Complete document-specific adjustment and immutable reversal rules.

### Phase 4: Cash control and forecasting

1. Add bank account/balance snapshots and source freshness controls.
2. Add dated forecast items only for gaps not represented by documents.
3. Build company position, aging, 30/60/90 forecast, and true-available-cash views.
4. Reconcile operational cash events to bank evidence.
5. Treat future Monzo imports as bank evidence with stable provider identity, lifecycle status, transferred cash amount/direction, and separate reviewed reconciliation links. Accepted balance snapshots determine account cash; transaction evidence must not be added on top as a second balance.

### Phase 5: Project control and legacy retirement

1. Build the project cost/revenue waterfall and margin alerts.
2. Review and bridge legacy `material_purchases`, `expenses`, `project_master`, and client payment data only with duplicate controls and human mapping.
3. Make weekly cashflow and dashboards consume the canonical views, then retire duplicate write paths.
4. Define the read-only Jarvis contract after the views and freshness controls are accepted; integration remains outside Phase 3A.

## 15. Key Risks And Decisions Required

- The deployed shape and duplicate population of legacy financial tables is unknown because this design did not access a database.
- Existing supplier invoice amounts have no confirmed net/gross/VAT basis.
- Existing routes and table definitions disagree, so route output cannot establish financial truth.
- One supplier cost may already appear in `material_purchases`, `expenses`, weekly snapshots, and canonical invoices.
- `clients` is not yet linked canonically to `jobs`; `project_master` is a competing root.
- Contractor CIS rules, VAT domestic reverse charge, VAT recoverability, retention terms, and tax-point policy need accountant approval.
- Awarded contractor commitment status and remeasurement/variation policy need a locked rule.
- HBXL original revision and which baseline resource types comprise the cost budget must be explicit per job.
- External Financeflow/bank data needs identity, timestamp, access, and reconciliation controls before use as bank truth.
- Due dates, unknown dates, disputes, partial allocations, credits, reversals, and mixed currencies can materially change every position calculation.

The first implementation should establish amount basis and canonical client/project commercial identity, then add supplier settlement and client receivable records. Without those foundations, company cash, tax, and profitability views would be precise-looking summaries of incomplete or duplicated facts.
