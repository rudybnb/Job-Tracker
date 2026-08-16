# Contractor Payment Reconciliation

## Scope And Safety

This document is the Phase 2J offline design for reconciling the legacy `contractor_payments` table with approved measurable-work valuations.

No database was queried, no migration was created or executed, and no API, UI, payment, assignment, or historical record was changed. Repository source establishes that payment definitions conflict, but it cannot prove which shape exists in any deployed database. A controlled schema inventory is therefore a mandatory prerequisite to a future payment migration.

Actual cash payment remains separate from:

- contractor progress;
- contractor claims;
- inspection decisions;
- approved valuations; and
- locked tender rates.

## Executive Decision

Retain and reconcile the existing `contractor_payments` table rather than create a replacement payment ledger.

The future strategy should be additive:

1. Inventory the deployed table before writing migration SQL.
2. Preserve its existing `SERIAL`/integer primary key and every historical column and row.
3. Add nullable measurable-work bridge columns, including `contractor_valuation_id`.
4. Standardize new code on one canonical set of payment column names.
5. Translate legacy API names at the service boundary instead of maintaining two writable amount/status/reference columns indefinitely.
6. Backfill only deterministic facts. Do not guess a job, valuation, phase, assignment, milestone, currency, or payment state.
7. Enforce cumulative payment limits only for new valuation-linked payments.

The table is reusable later as the actual-cash ledger, but it is not safe to connect to E2B valuations in its current repository state.

## Existing Definitions

### Financial Initializer Definition

`server/financial-tables-core.ts` is the only source that creates `contractor_payments` by name. It defines:

| Column | Type / default | Relationship / meaning |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | Existing payment identity |
| `contractor_id` | `VARCHAR` | FK to `contractors(id)`, `ON DELETE CASCADE` |
| `assignment_id` | `INTEGER` | FK to `phase_assignments(id)`, `ON DELETE CASCADE` |
| `milestone_id` | `INTEGER` | FK to `milestones(id)`, `ON DELETE SET NULL` |
| `payment_amount` | `DECIMAL(12,2) NOT NULL` | Actual cash amount |
| `payment_method` | `VARCHAR(50)` | Payment method |
| `payment_reference` | `VARCHAR(100)` | External/reference identifier |
| `period_start_date` | `DATE` | Legacy payment period |
| `period_end_date` | `DATE` | Legacy payment period |
| `hours_worked` | `DECIMAL(10,2)` | Legacy time basis |
| `days_worked` | `DECIMAL(10,2)` | Legacy time basis |
| `payment_status` | `VARCHAR(50) DEFAULT 'pending'` | Legacy free-text workflow state |
| `payment_date` | `DATE` | Actual payment date |
| `notes` | `TEXT` | Notes |
| `created_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | Audit timestamp |
| `updated_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | Audit timestamp |

It does not define `job_id`, `phase_id`, `amount`, `status`, `reference_number`, `currency_code`, or a valuation FK.

Indexes are created for `contractor_id`, `assignment_id`, and `milestone_id`.

`server/init-financial-tables.ts` wraps this initializer. Repository tests verify that it is additive/idempotent and keeps the table outside `shared/schema.ts`. Normal application startup does not call `initFinancialTables`; `tests/schema-bootstrap.test.ts` explicitly protects that behavior.

### Financial Route Assumption

`server/financial-routes.ts` mounts active payment routes and assumes a different table shape.

The GET route `/api/financial/contractors/:contractorId/payments` expects:

- `contractor_id`;
- `job_id` for `LEFT JOIN jobs`;
- `payment_date`; and
- all columns returned by `cp.*`.

The POST route `/api/financial/payments` accepts and inserts:

- `contractor_id`;
- `job_id`;
- `phase_id`;
- `amount`;
- `payment_date`;
- `payment_method`;
- `reference_number`;
- `notes`; and
- `status`, written as `completed`.

Only `contractor_id`, `payment_date`, `payment_method`, and `notes` overlap the initializer definition exactly.

`server/index.ts` mounts `setupFinancialRoutes(app)` during normal startup. It performs only a read-only schema health check before route setup and does not invoke `initFinancialTables`. Consequently, the routes are operational code, but repository source alone cannot establish the deployed table's actual columns.

### Other Repository Payment Fields

`shared-cashflow/schema.ts` contains `payment_status`, `payment_date`, and `payment_amount` fields on `expenses` and `client_payments`. It does not define or consume `contractor_payments`. These are separate cashflow/client-payment concepts and must not be treated as contractor payment aliases.

No `contractor_payments` consumer was found in `client/`, `client-cashflow/`, `server-cashflow/`, reports, or canonical SQL migrations. Client onboarding copy mentioning “payments” is informational and has no table-column contract.

The canonical `shared/schema.ts` deliberately does not own `contractor_payments`. `server/table-manifest.ts` assigns it to `financialTablesCore` ownership.

## Compatibility Matrix

Legend: `R` = read, `W` = write/create, `T` = test/assertion, `-` = not expected.

| Consumer | `id` | `contractor_id` | `job_id` | `assignment_id` | `phase_id` | `milestone_id` | `payment_amount` | `amount` | `payment_status` | `status` | `payment_date` | `payment_method` | `payment_reference` | `reference_number` | Period / hours / days | Valuation FK |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `server/financial-tables-core.ts` | W | W | - | W | - | W | W | - | W | - | W | W | W | - | W | - |
| GET payment route | R via `cp.*` | R/filter | R/join | R via `cp.*` | R via `cp.*` | R via `cp.*` | R via `cp.*` | R via `cp.*` | R via `cp.*` | R via `cp.*` | R/order | R via `cp.*` | R via `cp.*` | R via `cp.*` | R via `cp.*` | - |
| POST payment route | returned via `*` | W | W | - | W | - | - | W | - | W | W | W | - | W | - | - |
| `tests/financial-tables.test.ts` | T (`SERIAL`) | T (`VARCHAR` FK/index) | - | T (`INTEGER` FK/index) | - | T (`INTEGER` FK/index) | retained indirectly | - | retained indirectly | - | retained indirectly | retained indirectly | retained indirectly | - | retained indirectly | - |
| `tests/phase2e2b-migration.test.ts` | T | T | conflict assertion | T | conflict assertion | T | T | conflict assertion | T | conflict assertion | T | - | T | conflict assertion | - | confirms absent |
| `shared/schema.ts` | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| `shared-cashflow/schema.ts` | Separate tables | Separate tables | Separate tables | - | - | - | Client-payment field only | Expense/client tables | Expense/client tables | - | Expense/client tables | - | - | - | - | - |

The GET route's `cp.*` technically exposes whichever columns exist, but its explicit `cp.job_id` join means it fails against the initializer shape. The POST route fails against the initializer shape because six inserted column names do not exist there.

## Exact Conflicts

| Concept | Initializer | Financial route | Conflict |
|---|---|---|---|
| Job identity | No column | `job_id` required and queried | Route cannot join or insert against initializer shape |
| Legacy phase | Derivable through `assignment_id`, but no direct `phase_id` | Writes `phase_id` | Different relationship and type authority |
| Amount | `payment_amount` | `amount` | Different physical column name |
| Status | `payment_status` | `status` | Different physical column name and ungoverned values |
| Reference | `payment_reference` | `reference_number` | Different physical column name |
| Assignment | `assignment_id` | Not written | Route-created rows would not retain legacy assignment context |
| Milestone | `milestone_id` | Not written | Route-created rows would not retain legacy milestone context |
| Currency | No column | No column | Multi-currency identity is absent |
| Valuation | No column | No column | No approved-work provenance or overpayment protection |
| Deletion behavior | Contractor/assignment FKs cascade | Not addressed | Historical cash records could be deleted with legacy parents |

## Proposed Canonical Additive Shape

The deployed schema must be inventoried first. Subject to that inventory, retain the existing table and converge on this logical shape:

| Canonical column | Future type / nullability | Strategy |
|---|---|---|
| `id` | Existing `SERIAL`/integer PK | Reuse unchanged |
| `contractor_id` | Existing `VARCHAR`, nullable for historical anomalies if already nullable | Reuse; do not recreate contractor data |
| `job_id` | `VARCHAR NULL` FK to `jobs(id)` with `RESTRICT` for new records | Add nullable; deterministic backfill only |
| `contractor_valuation_id` | `UUID NULL` FK to `contractor_valuation(id)` with `RESTRICT` | Add nullable bridge; many payments may share one valuation |
| `payment_amount` | Existing `DECIMAL/NUMERIC(12,2)` or widen additively after inventory | Canonical amount name; preserve all historical values |
| `currency_code` | `VARCHAR(3) NULL` with uppercase format check | Add nullable so historical rows remain valid; require for new valuation-linked payments |
| `payment_date` | Existing `DATE NULL` | Reuse |
| `payment_status` | Existing `VARCHAR(50)` | Reuse physical column; govern new statuses in service policy before a DB check is added |
| `payment_reference` | Existing `VARCHAR(100) NULL` | Reuse physical column |
| `payment_method` | Existing `VARCHAR(50) NULL` | Reuse |
| `notes` | Existing `TEXT NULL` | Reuse |
| `assignment_id` | Existing `INTEGER NULL` FK | Preserve for legacy payments |
| `milestone_id` | Existing `INTEGER NULL` FK | Preserve for legacy payments |
| `phase_id` | `INTEGER NULL` FK only if deployed rows/routes prove it exists or a direct phase reference is still needed | Do not infer from assignment without deterministic proof |
| `period_start_date` | Existing `DATE NULL` | Preserve |
| `period_end_date` | Existing `DATE NULL` | Preserve |
| `hours_worked` | Existing decimal nullable | Preserve |
| `days_worked` | Existing decimal nullable | Preserve |
| `created_at` | Existing timestamp | Preserve |
| `updated_at` | Existing timestamp | Preserve |
| `source_metadata` | `JSONB NULL` | Optional additive audit/provenance field for new payment creation |

Do not retain `amount`, `status`, and `reference_number` as second writable facts if they exist only because of route assumptions. The preferred compatibility boundary is:

- API `amount` maps to database `payment_amount`;
- API `status` maps to database `payment_status`; and
- API `reference_number` maps to database `payment_reference`.

If deployed schema inventory proves that route-shaped columns already contain historical data, preserve them initially and run a controlled conflict report. Only deterministic equal/non-null values may be copied. Rows where both aliases are populated differently require human review. No column should be dropped until all consumers use canonical names and an archival backup has been verified.

## Historical Preservation Strategy

Historical records remain valid even when they have no job or valuation identity.

- New bridge columns are nullable.
- No historical row is deleted or replaced.
- No forced `job_id` backfill is permitted.
- A job may be backfilled only through an unambiguous assignment -> phase -> job chain verified against the same contractor and payment context.
- A valuation link must never be inferred from amount, date, contractor, description, assignment, phase, or milestone alone.
- Existing assignment, phase, milestone, hours, days, period, method, reference, notes, and timestamps remain available.
- Existing cascade behavior should not be changed blindly. A future migration should first inventory orphan risk, then prefer `RESTRICT` for new measurable-work links. Historical cascade FKs require a separate approved migration strategy.
- Historical rows with no valuation FK are classified as legacy actual payments, not unallocated measurable-work payments.

## Approved Valuation To Actual Payment

The future relationship is one-to-many:

```text
contractor_valuation (APPROVED)
  -> contractor_payments row 1
  -> contractor_payments row 2
  -> ...
```

Each actual payment row has at most one nullable `contractor_valuation_id`. One approved valuation may have zero, one, or many payment rows.

A new valuation-linked payment must match:

- valuation status `APPROVED`;
- valuation job;
- valuation contractor;
- valuation currency; and
- a positive payment amount.

`contractor_payments` records actual cash movement only. It must not copy claim quantities, inspection quantities, approved quantities, tender quantities, or tender rates.

## Partial Payments

Partial settlement is represented by multiple payment rows referencing the same approved valuation.

Example:

```text
Approved valuation gross value: GBP 495.00
Payment 1: GBP 200.00
Payment 2: GBP 295.00
Outstanding: GBP 0.00
```

Do not update Payment 1 from `200` to `495`. Payment 2 is a new cash transaction with its own date, method, reference, status, and audit metadata.

Failed, cancelled, void, or draft payment attempts must not consume payable value. The exact canonical status vocabulary must be approved before implementation; legacy free-text statuses need inventory and mapping first.

## Double-Payment Protection

For new valuation-linked payments:

```text
approved valuation value
- cumulative effective actual payments
= unpaid valuation value
```

The service/database transaction must:

1. Run at `SERIALIZABLE` isolation with retry on serialization failure.
2. Lock the approved `contractor_valuation` row using `FOR UPDATE`.
3. Re-read its immutable approved line total.
4. Sum existing effective payment rows for that valuation.
5. Exclude statuses explicitly defined as non-cash/non-effective.
6. Reject a new payment when cumulative effective payments plus the new amount exceed approved valuation value.
7. Insert the cash payment only after all job, contractor, currency, status, and amount checks pass.

The valuation total should be calculated from immutable `contractor_valuation_line.current_value` rows, not accepted from an API amount.

No overpayment, negative payment, refund, credit, or adjustment path should be improvised. Those require the future adjustment/credit model.

## Superseded Valuation Semantics

### Current E2B Behavior

Migration `0013_phase2e2b_approved_work_valuation.sql` treats both `APPROVED` and `SUPERSEDED` valuation-line quantities as previously valued:

```text
new valuation quantity
= current approved quantity
- all prior APPROVED/SUPERSEDED valued quantity
```

This is consumed-history, positive-delta semantics. A replacement valuation does not replace its predecessor's line value with a full fresh value. It may add only newly approved, previously unvalued quantity.

Example:

```text
Valuation 1 approved: 2 units, GBP 90
Valuation 1 later marked SUPERSEDED
Current approved quantity after reinspection: 3 units
Replacement valuation: 1 additional unit, GBP 45
Lifetime valued quantity: 3
Lifetime valued value: GBP 135
```

Summing `90 + 45` is correct because the replacement is a delta. Treating the replacement as another full `135` valuation would be incorrect and is blocked by the previously-valued calculation.

### Payment Interpretation

Superseded status does not erase an already approved economic event or its actual payments. Payment entitlement for the chain is the cumulative immutable values of its approved/superseded delta valuations, less effective payments linked to those individual valuations.

The future UI/service must display a supersession chain as one commercial history and must not present both the old value and a hypothetical full replacement value as independently payable.

### Downward Corrections

Current E2B does not support negative valuation lines. Therefore a downward correction cannot be represented by superseding an approved valuation and inserting a negative delta.

Until an explicit adjustment/credit-note model exists:

- block downward corrections that would reduce already valued or paid entitlement;
- do not rewrite approved valuation lines;
- do not reduce or delete historical payments;
- do not create a negative payment row; and
- route the case to commercial review.

This is a known limitation, not a reason to reinterpret `SUPERSEDED` as cancellation of historical value.

## Consumer Migration Strategy

### Stage 0: Controlled Inventory

Before SQL design is finalized, collect read-only metadata in an approved environment:

- exact columns, types, defaults, nullability, constraints, indexes, and sequences;
- row counts and null counts;
- distinct status values;
- counts populated under each alias (`payment_amount`/`amount`, etc.);
- conflicting alias values;
- orphan contractor/assignment/milestone/phase/job references; and
- whether any deployed migration outside this repository altered the table.

No application write should be enabled during reconciliation planning.

### Stage 1: Additive Schema

Create one reviewed migration based on the inventory:

- add only missing nullable canonical columns;
- add indexes for `job_id` and `contractor_valuation_id`;
- add new FKs using `NOT VALID` first if historical validation risk exists, then validate separately;
- preserve the existing primary key and legacy columns; and
- add no valuation links to historical rows automatically.

### Stage 2: Consumer Compatibility

Update payment repository/routes to use canonical physical names and explicit response DTO aliases. Do not use `SELECT cp.*` as the API contract.

The route should return named fields and map legacy/canonical naming deliberately. Creation of valuation-linked payments must use the transaction rule above. Legacy payment creation, if still needed, must be an explicit separate mode with authorization and audit controls.

### Stage 3: Deterministic Backfill

Produce a dry-run report before updates. Backfill only rows with provable relationships. Record method, evidence, actor, and timestamp. Leave ambiguous rows nullable.

### Stage 4: Constraint Tightening

After all consumers migrate and data is reviewed:

- validate new FKs;
- introduce checks for new valuation-linked rows without invalidating historical rows;
- govern canonical payment statuses; and
- retain deprecated columns through a documented compatibility period.

No destructive rename/drop belongs in the first reconciliation migration.

## Risks And Open Decisions

1. **Unknown deployed shape:** repository definitions conflict and normal startup does not initialize the table. Inventory is mandatory.
2. **Mounted broken routes:** active financial routes assume columns absent from the initializer definition.
3. **Free-text statuses:** effective-payment totals are unsafe until status semantics are governed.
4. **Cascade deletion:** existing contractor/assignment cascades are inappropriate for durable payment history but cannot be changed without historical risk analysis.
5. **Currency absence:** legacy rows have no currency. Do not assume GBP during backfill without project/payment evidence.
6. **Alias divergence:** deployed databases may contain both legacy and route-shaped columns with conflicting values.
7. **Missing job identity:** assignment-based job derivation may be possible for some rows but must be proven row by row.
8. **No valuation identity:** amount/date matching is insufficient to backfill valuation links.
9. **Supersession semantics:** current valuation replacements are positive deltas, not full replacements.
10. **Downward corrections:** require a future adjustment/credit mechanism before payment integration.
11. **Partial-payment concurrency:** requires serializable transactions and retry behavior.
12. **Tax policy deferred:** VAT, CIS, retention, credit notes, and deductions remain out of scope.

## Recommended Future Migration Exit Gates

A future contractor-payment migration should not be approved until:

- the deployed compatibility inventory is reviewed;
- every payment consumer uses an explicit column contract;
- legacy status values have a documented mapping;
- canonical amount/reference/status names are selected;
- historical rows remain queryable without forced backfills;
- one approved valuation can accept multiple partial payments;
- cumulative effective payments cannot exceed approved valuation value under concurrency;
- superseded delta valuations cannot be paid twice;
- downward corrections are blocked or have an approved adjustment model; and
- no VAT, CIS, retention, tax, or credit behavior is introduced accidentally.
