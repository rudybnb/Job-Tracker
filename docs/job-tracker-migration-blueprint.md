# Job Tracker Permanent Data Model Migration Blueprint

Status: Phase 2B blueprint only. This document contains no SQL migration, schema implementation, database access, API/UI change, production change, or deployment instruction.

This blueprint implements the locked decisions in `docs/job-tracker-permanent-data-model.md` through additive, reversible phases. `jobs` is the single project root. `project_master` is not expanded.

## 1. Migration Safety Rules

1. **Additive first:** create new tables and nullable bridge fields before changing any existing write path.
2. **No flag day:** legacy assignments, progress, inspections, buying, and payments continue to work until a specific job/package is migrated.
3. **Immutable source revisions:** every source revision inserts new import and child rows.
4. **No source overwrites:** no migration updates imported HBXL quantities/rates or PlansXpress identity/geometry in place.
5. **No destructive cascade for evidence or finance:** source, baseline, tender, claim, inspection, order, delivery, and cost FKs use `RESTRICT`/`NO ACTION`; operational status or supersession replaces deletion.
6. **Nullable bootstrap:** references to unreconciled legacy data start nullable and become required only after measured backfill and validation.
7. **Idempotent data backfill:** migration jobs record source IDs/checkpoints and can safely resume without duplicating data.
8. **Verification gate:** each phase requires row-count, FK, uniqueness, null-rate, and sample provenance checks before application code adopts it.
9. **Rollback means stop using new structures:** rollback initially removes new write/read paths, not evidence. Dropping populated permanent tables is not the normal rollback.
10. **No dual authority:** each operational package records whether legacy or measurable-work workflow is authoritative.

## 2. Locked Technical Conventions

### Identity

- New PKs: UUID.
- Existing project FK type must match `jobs.id` exactly during implementation.
- PlansXpress identity: `(source_import_id, plansxpress_handle)`.
- HBXL resource identity: `(source_import_id, source_row_number)` plus row hash; product code alone is never unique.

### Quantities And Units

- Quantity: `numeric(18,6)`.
- `unit_code`: controlled lowercase code (`each`, `m`, `m2`, `m3`, `kg`, `tonne`, `litre`, `bag`, `sheet`, `day`, `hour`, `item`, `lot`, `other`).
- `source_unit_text`: original source value, unchanged.
- No conversion subsystem in these phases.

### Money

- Amount/value: `numeric(18,2)`.
- Unit rate: `numeric(18,6)`.
- Currency: uppercase ISO 4217 code; default `GBP` may be applied at project/import creation but is always stored explicitly.
- No floating-point money and no automatic currency conversion.

### Geometry

- PostgreSQL `jsonb`, GeoJSON-compatible `Point`, `LineString`, or `Polygon`.
- Store `coordinate_unit`, `coordinate_system`, and `source_origin_metadata`.
- No PostGIS in these phases.

### Review

- States: `MATCHED`, `REVIEW_REQUIRED`, `USER_CONFIRMED`, `UNRESOLVED`, `NOT_APPLICABLE`.
- Applicable records include `reason_code`, `reason`, `confirmed_by`, and `confirmed_at`.

### Lifecycle

- Optional values: `UNKNOWN`, `EXISTING`, `PROPOSED`, `DEMOLITION`.
- Default `UNKNOWN`; no inference from text.

## 3. Proposed ER Relationship Diagram

```text
clients --< jobs
             |
             +--< project_source_import
             |       |
             |       +--< drawing_object
             |       |       |
             |       |       +--0..1 physical_wall --< wall_surface
             |       |       |          |
             |       |       |          +--< opening
             |       |       |
             |       |       +-- source visual/reference objects
             |       |
             |       +--< hbxl_resource_baseline
             |
             +--< work_area --< measurable_work_item >--0..1 job_phases
             |                       |
             |                       +--< work_item_source_link
             |                       |      +--> drawing_object
             |                       |      +--> physical_wall
             |                       |      +--> wall_surface
             |                       |      +--> opening
             |                       |
             |                       +--< work_item_hbxl_resource_link
             |                              +--> hbxl_resource_baseline
             |
             +--< contract_package --< contract_package_work_item
             |          |                         |
             |          |                         +--< contractor_tender_rate >-- contractors
             |          |
             |          +--0..1 legacy phase_assignments bridge
             |          +--< work_progress
             |          +--< contractor_claim --< contractor_claim_line
             |                                             |
             |                                             +--< inspection_decision
             |                                                      |
             |                                                      +--> contractor_payments
             |
             +--< procurement_requirement
                      +--< supplier_quote_line <--- supplier_quote
                      +--< purchase_order_line <--- purchase_order
                               +--< delivery_line <--- delivery
                               +--< actual_purchase_cost
```

## 4. Phase A - Source Imports And Work Areas

### Goal

Establish immutable project evidence and universal work-area identity without changing current job or assignment behavior.

### New Tables

#### `project_source_import`

Core columns:

- UUID PK
- required `job_id`
- source type, stream key, revision number
- original filename/storage URI/hash/size/media type
- HBXL project/job references
- parser name/version
- import status and parse/error metadata
- imported actor/time
- supersedes self-FK
- current-revision designation

#### `work_area`

Core columns:

- UUID PK
- required `job_id`
- optional parent work area
- name, normalized name, work-area type
- level/floor
- optional source import and PlansXpress Area Handle/PXID
- JSONB geometry and coordinate metadata
- source kind, lifecycle status
- review/provenance fields

### Existing Tables Touched

- `jobs`: eventually add nullable `client_id` FK to `clients`; do not change/remove `client_name`.
- `csv_uploads`: no destructive change. Optionally add nullable `project_source_import_id` bridge after import table exists.
- `clients`: no initial destructive change. Resolve duplicate/identity policy before backfilling `jobs.client_id`.
- `project_master`: untouched.

### Foreign Keys

- `project_source_import.job_id -> jobs.id` (`RESTRICT`).
- `project_source_import.supersedes_import_id -> project_source_import.id` (`RESTRICT`).
- `work_area.job_id -> jobs.id` (`RESTRICT`).
- `work_area.parent_work_area_id -> work_area.id` (`RESTRICT`).
- `work_area.source_import_id -> project_source_import.id` (`RESTRICT`).
- Future nullable `jobs.client_id -> clients.id` (`SET NULL` or `RESTRICT`, never cascade project deletion).
- Optional `csv_uploads.project_source_import_id -> project_source_import.id` (`SET NULL`).

### Unique Constraints

- `project_source_import(job_id, source_stream_key, revision_number)`.
- `project_source_import(job_id, source_stream_key, file_sha256)`.
- Partial unique current successful revision on `(job_id, source_stream_key)`.
- Partial unique `work_area(source_import_id, plansxpress_area_handle)` where Handle exists.
- Operational work-area identity `(job_id, parent_work_area_id, work_area_type, normalized_name)`; confirm null-parent behavior in PostgreSQL before implementation.

### Indexes

- Imports by job/type/stream/current/status/imported time.
- Work areas by job/type/parent/level.
- GIN index on geometry only if measured query usage warrants it; not required for first migration.

### Nullable Bootstrap Fields

- `jobs.client_id` nullable indefinitely for unreconciled legacy jobs.
- `csv_uploads.project_source_import_id` nullable.
- Work-area source import, Handle, PXID, geometry, level, parent, and confirmation fields nullable for user/HBXL-phase areas.
- `supersedes_import_id` nullable for first revision.

### Data Migration Requirements

1. Inventory `clients` duplicates and define reviewed client mappings.
2. Preserve every current `jobs.client_name` exactly; optionally backfill unambiguous `client_id` links.
3. Create source-import bridge rows for historical `csv_uploads` only when original file/hash/provenance can be proven. Otherwise leave bridge null.
4. Seed no fake source imports to satisfy nullability.
5. Create work areas only from deterministic imported/user evidence; uncertain areas use review state.

### Dependencies

- Confirm actual live `jobs.id` type and `clients` ownership.
- Agree file storage URI and SHA-256 generation.
- Parser version identifiers must be available before production import.

### Rollback Considerations

- Stop writing/reading new imports/work areas; legacy jobs remain untouched.
- Do not remove `jobs.client_name` or historical source files.
- New tables can be dropped only if still empty/unreferenced; otherwise retain and disable.
- Clearing an incorrect current-revision designation is an audited correction, not source deletion.

### Exit Gate

- One pilot job has traceable imports and work areas.
- Duplicate-import constraints proven.
- Existing job/client behavior unchanged.
- Every work area traces to source or explicit user creation.

## 5. Phase B - Drawing Objects, Walls, Surfaces, And Openings

### Goal

Store source-faithful PlansXpress/DXF entities and specialized physical wall structures without creating operational work or buying records.

### New Tables

- `drawing_object`
- `physical_wall`
- `wall_surface`
- `opening`

### Existing Tables Touched

- None required beyond FKs to `jobs` and Phase A imports/work areas.
- Current jobs, phase assignments, progress, inspections, and buying remain unchanged.

### Foreign Keys

- Drawing object -> job/import.
- Physical wall -> job/import/drawing object.
- Wall surface -> physical wall and nullable adjacent work area.
- Opening -> job/import/physical wall and optional drawing object.
- Use `RESTRICT` for source/physical evidence; unresolved adjacency is null, not a placeholder room.

### Unique Constraints

- Partial unique `drawing_object(source_import_id, plansxpress_handle)`.
- Unique fallback `(source_import_id, source_entity_index)` where Handle absent.
- Unique `physical_wall.drawing_object_id`.
- Partial unique `physical_wall(source_import_id, plansxpress_handle)`.
- Unique `wall_surface(physical_wall_id, side)`.
- Partial unique `opening(source_import_id, plansxpress_handle)`; fallback source-scoped opening key where no Handle exists.

### Check Constraints

- `wall_surface.side IN ('A','B')`.
- Estimating status uses the locked three values.
- Lifecycle uses locked optional values.
- Non-negative lengths, heights, areas, and deductions.
- Net area may differ from gross minus deduction only when source/confirmation reason is recorded.

### Indexes

- Drawing objects by job/category/estimating status/entity type.
- Handle and PXID lookup scoped by import.
- Physical walls by job/import/calculator.
- Surfaces by adjacent work area/review state.
- Openings by physical wall/type/estimating status.

### Nullable Bootstrap Fields

- Handle/PXID/calculator fields nullable when absent from source.
- Geometry nullable only for genuinely non-geometric reference entities; geometry review reason required.
- Wall-surface adjacent work area nullable.
- Opening drawing object nullable for nested PlansXpress wall openings.
- User confirmation fields nullable until confirmed.

### Data Migration Requirements

1. Parse each immutable source revision into new source-scoped entities.
2. Classify `ESTIMATED`, `NON_ESTIMATED_VISUAL_ONLY`, or `UNKNOWN_REVIEW` from deterministic PlansXpress evidence.
3. Store physical walls once and create at most two surfaces.
4. Prefer stored HBXL/PlansXpress estimator quantities; retain derived comparisons as provenance, not replacement.
5. Link surfaces to work areas only with deterministic evidence; leave unresolved sides nullable/review-required.
6. Verify import counts, Handles, wall totals, opening totals, and geometry before marking import successful/current.

### Dependencies

- Phase A imports and work areas.
- Stable parser output schemas and geometry convention.
- Known source entity-category mapping and status-classification version.

### Rollback Considerations

- Disable the parser/read path and mark failed import rather than mutating prior revisions.
- Delete only a wholly failed, unreferenced import transaction if policy permits; never partially delete current evidence.
- No operational scope depends on Phase B yet, making application rollback low risk.

### Exit Gate

- Pilot source counts reconcile.
- Every physical wall traces to one drawing object/import.
- Surface uniqueness and unresolved-side behavior proven.
- Visual-only entities create no cost/buying/mismatch output.

## 6. Phase C - Immutable HBXL Baseline

### Goal

Persist Smart Schedule resource rows exactly as an immutable commercial baseline.

### New Table

#### `hbxl_resource_baseline`

Stores source import, row identity/hash, product code, descriptions, resource type, quantity, canonical/source unit, original rate/value/currency, supplier text, build phase, dates, and raw metadata.

### Existing Tables Touched

- None required.
- `csv_uploads`, `jobs.phases`, `jobs.phase_task_data`, and `project_master.resource_breakdown` remain legacy data during coexistence.

### Foreign Keys

- `job_id -> jobs.id` (`RESTRICT`).
- `source_import_id -> project_source_import.id` (`RESTRICT`).

### Unique Constraints

- `(source_import_id, source_row_number)`.
- Optionally `(source_import_id, source_row_hash)` only if duplicate identical source rows must be prohibited; default is to preserve legitimate duplicate rows and use row number as identity.
- Product code is indexed, never unique.

### Check Constraints

- Non-negative imported quantity unless HBXL legitimately emits adjustment/credit rows; confirm fixtures before enforcing.
- Resource type includes `MATERIAL`, `LABOUR`, `PLANT`, and faithful `OTHER`.
- Currency format is three uppercase characters when rate/value is present.
- Unit code is controlled; source unit text retained.

### Indexes

- Job/import/build phase/resource type/product code.
- Required date and order date for scheduling queries.
- Description search only if a proven use case justifies it.

### Nullable Bootstrap Fields

- Product code, supplier, original rate/value, currency, and dates nullable when source omits them.
- Canonical unit may initially be `other`; source unit text remains required when source supplied one.

### Data Migration Requirements

1. Import Smart Schedule rows under one immutable source revision.
2. Store exact original descriptions/unit text and row reference.
3. Compute row hash from a documented canonical serialization.
4. Reconcile imported row count and source hash before success/current designation.
5. Do not backfill from `project_master.resource_breakdown` unless provenance to an original source file can be proven.

### Dependencies

- Phase A import revisions.
- Locked unit mappings, decimal parser, date parser, and currency default policy.

### Rollback Considerations

- Stop baseline reads and mark import failed/non-current.
- Never overwrite or merge into an earlier baseline.
- Retain rows for audit once accepted as an import revision.

### Exit Gate

- Exact source row count and hashes verified.
- Baseline values demonstrably unchanged by supplier/actual-price operations.
- Original and later revision questions can be answered by import IDs, even before diff logic exists.

## 7. Phase D - Measurable Work And Provenance Links

### Goal

Introduce operational measurable work without converting HBXL resource components into contractor tasks.

### New Tables

- `measurable_work_item`
- `work_item_source_link`
- `work_item_hbxl_resource_link`

### Existing Tables Touched

- `job_phases`: referenced as optional trade/package grouping; no rewrite required.
- `task_progress`: no initial FK/backfill; legacy progress remains authoritative for legacy assignments.
- `jobs.phase_task_data`: retained as legacy snapshot.

### Foreign Keys

- Work item -> job/work area/optional job phase/optional superseding work item.
- Source link -> work item and exactly one drawing object, physical wall, wall surface, or opening.
- HBXL link -> work item and immutable baseline resource.
- Use `RESTRICT` for source/baseline links.

### Unique Constraints

- Partial `(job_id, work_area_id, item_code)` when item code exists.
- Source-link uniqueness per work item/target/link role.
- `(measurable_work_item_id, hbxl_resource_baseline_id, relationship)`.

### Check Constraints

- Source link has exactly one target FK.
- Planned/source quantities are non-negative unless a documented adjustment item type is added later.
- Quantity comparisons require compatible unit codes.
- Visual-only drawing objects cannot have `QUANTITY_SOURCE` links unless status is audited `USER_CONFIRMED`/reclassified.

### Indexes

- Work item by job/work area/job phase/trade/status/item code.
- Source links by every target FK.
- HBXL links by work item and resource.
- Review-state indexes for operational queues.

### Nullable Bootstrap Fields

- `job_phase_id`, item code, source quantity, and supersession nullable.
- Source/HBXL links optional while a work item is draft; activation requires scope/provenance policy checks.
- Planned quantity may be nullable for package-only scope until user review, but such work cannot be tendered as measured quantity.

### Data Migration Requirements

1. Generate pilot work items from proven drawing/baseline evidence.
2. Preserve source and planned quantities separately.
3. Link physical construction to physical walls and finishes to wall surfaces.
4. Link HBXL resource build-up without creating one work item per resource row.
5. Do not migrate legacy `task_progress` until an explicit item mapping exists.

### Dependencies

- Phases A-C.
- Trade/package and item-code governance.
- Review workflow capable of retaining reasons and confirmations.

### Rollback Considerations

- Keep work items draft/inactive and retain legacy task behavior.
- Remove only unaccepted pilot operational rows if they have no tender/progress/claim references.
- Source and baseline evidence remains unaffected.

### Exit Gate

- End-to-end provenance from work item to both drawing and HBXL baseline demonstrated.
- No resource-row task explosion.
- Legacy job/assignment behavior unchanged.

## 8. Phase E - Contractor, Tender, Progress, Inspection, And Payment

### Goal

Migrate contractor scope package by package while legacy phase assignments coexist safely.

### New Tables

- `contract_package`
- `contract_package_work_item`
- `contractor_tender_rate`
- `work_progress`
- `contractor_claim`
- `contractor_claim_line`
- `inspection_decision`

### Existing Tables Touched

- `phase_assignments`: retained; optional bridge from package, no deletion/rewrite.
- `job_assignments`: retained; optional bridge from package.
- `admin_inspections`: reused as inspection header through nullable FK from decisions.
- `task_progress`, `task_inspection_results`: retained for legacy scope; optional mapping later.
- `contractor_payments`: later add nullable approved-valuation/claim reference; existing payments remain valid.
- `milestones`: retained; may coexist with measured lines but is not quantity authority.

### Foreign Keys

- Package -> job, optional job phase, accepted contractor, optional legacy assignments.
- Package work item -> package/work item.
- Tender rate -> package work item/contractor/source document.
- Progress -> package work item/contractor.
- Claim -> package/contractor/job.
- Claim line -> claim/package work item/locked tender rate.
- Inspection decision -> claim line or work item, optional admin inspection, inspector identity.
- Payment -> approved valuation/claim linkage added nullable after decisions exist.

### Unique Constraints

- Package version unique `(job_id, package_code, scope_version)`.
- Package work item `(contract_package_id, measurable_work_item_id)`.
- Tender submission/version unique per package item/contractor/version.
- At most one accepted rate per package work item via partial unique constraint.
- Claim number unique within package.
- One claim line per claim/package work item/accepted rate.
- Inspection decisions use version/supersession; at most one current decision per claim line.

### Check Constraints

- `operational_model IN ('LEGACY','MEASURABLE_WORK')`.
- Accepted package requires accepted contractor/time/actor.
- Accepted tender requires locked rate, currency, agreed quantity/unit/value, actor/time.
- Approved + rejected + held does not exceed inspected quantity.
- Paid/valued amount is based on approved quantity and locked rate snapshot.
- Accepted/paid financial snapshots cannot be updated in place.

### Indexes

- Packages by job/status/contractor/phase/model.
- Rates by contractor/package/status.
- Progress/claims by package/work item/date/status.
- Inspection decisions by claim line/work item/status/inspection.
- Payment linkage and outstanding approval queues.

### Nullable Bootstrap Fields

- Legacy bridge IDs nullable.
- Accepted contractor/rate/acceptance fields nullable while draft/tendered.
- Claim inspection/payment references nullable through workflow.
- Existing `contractor_payments` new link nullable for historical rows.

### Data Migration Requirements

1. Create packages initially as `LEGACY` bridges for selected existing assignments without changing authority.
2. Map legacy phase/task scope to measurable work items only after user review.
3. Switch one package to `MEASURABLE_WORK` through an explicit audited transition.
4. Freeze accepted tender rates and quantities before progress/claim intake.
5. Do not copy legacy boolean completion into approved quantity.
6. Preserve old inspections/payments; link only where deterministic.

### Dependencies

- Phase D active work items.
- Contractor identity reconciliation.
- Authentication/actor identity sufficient for acceptance and inspection audit.
- Agreed policies for tax/CIS, VAT, retention, and payment rounding before production payments.

### Rollback Considerations

- Before acceptance, cancel draft package and return to legacy authority.
- After accepted rates/claims/decisions, do not delete; cancel/supersede and retain audit.
- Legacy scope remains available for packages not transitioned.
- Never dual-post claims or payments during rollback.

### Exit Gate

- One package completes tender -> progress -> claim -> inspection -> approved valuation without changing legacy scope elsewhere.
- Payment basis is demonstrably approved quantity x locked rate.
- No accepted snapshot can be silently repriced.

## 9. Phase F - Procurement And Pricing

### Goal

Support requirement-to-actual-cost workflow while preserving HBXL baseline, current supplier offers, and actual purchase prices separately.

### New Tables

- `procurement_requirement`
- `supplier_quote`
- `supplier_quote_line`
- `purchase_order`
- `purchase_order_line`
- `delivery`
- `delivery_line`
- `actual_purchase_cost`

No canonical supplier table is required in the first procurement migration. Store supplier identity/contact snapshots and add a supplier master only when duplicate management and integration requirements are proven.

### Existing Tables Touched

- `material_purchases`: retain; add nullable links to actual purchase/source/order lines only after duplicate analysis.
- `expenses`: retain as posted general cost; optional nullable link from actual purchase cost.
- `materials_catalog`: optional reference, never price authority.
- `project_cashflow_weekly`: reporting consumer only; no source-of-truth role.
- `hbxl_resource_baseline`: read/link only, never updated.

### Foreign Keys

- Requirement -> job/work item/optional HBXL baseline/work area.
- Quote -> job/source import.
- Quote line -> quote/requirement/optional baseline resource.
- Purchase order -> job/accepted quote/source document.
- PO line -> order/requirement/accepted quote line.
- Delivery -> order/job.
- Delivery line -> delivery/PO line.
- Actual purchase cost -> job/PO line/optional delivery line/source import/optional legacy purchase/expense.

### Unique Constraints

- Requirement UUID is authoritative; optional external requirement code unique per job.
- Supplier quote reference/version unique within job and supplier snapshot identity.
- Quote-line source index unique within quote.
- PO number/version unique within job.
- PO line number unique within order.
- Delivery reference unique within order when supplied.
- Invoice/source line unique by source import and row/line reference; protect against duplicate actual cost posting.

### Check Constraints

- Quantities and values non-negative, with explicit credit-note type for negative actual cost adjustments.
- Issued PO requires currency and locked ordered quantity/rate/value.
- Delivery accepted + rejected quantity does not exceed delivered quantity.
- Actual cost currency/value/source required.
- Baseline, quote, PO, and actual values remain separate columns/tables.

### Indexes

- Requirements by job/work item/status/required date.
- Quotes by job/supplier/status/validity.
- Orders by job/status/supplier/order date.
- Deliveries by order/date/status.
- Actual costs by job/supplier/invoice/date/PO line.
- Baseline comparison links.

### Nullable Bootstrap Fields

- Baseline resource/work item links nullable for manually identified requirements.
- Quote-to-requirement and PO-to-quote links nullable only for documented manual workflows.
- Legacy purchase/expense links nullable.
- Delivery link nullable for invoice lines received before delivery matching.

### Data Migration Requirements

1. Inventory duplicate invoices/lines across `material_purchases` and `expenses`.
2. Link historical records only when supplier, invoice, line, amount, and project evidence is deterministic.
3. Do not synthesize HBXL resource links from description similarity without review.
4. Begin new workflow with requirements and immutable quote/order snapshots.
5. Verify comparison reporting reads three independent price layers.

### Dependencies

- Phases A, C, and D; Phase E only where procurement is package-driven.
- File/document import support for quotes/invoices.
- Supplier snapshot policy, VAT/credit-note policy, and approval permissions.

### Rollback Considerations

- Before PO issue, cancel draft quote/requirement workflows.
- Issued orders, deliveries, and actual costs are retained and reversed/superseded, never deleted.
- Existing material-purchase/expense workflows remain available until explicitly transitioned.
- HBXL baseline remains unaffected under every rollback path.

### Exit Gate

- One requirement traces to work item and optional HBXL baseline, through quote, order, delivery, and actual cost.
- Reports show baseline vs current quote vs actual cost without mutation.
- Duplicate invoice/order safeguards verified.

## 10. Cross-Phase Data Verification

Every phase should produce a signed/reviewed verification report containing:

- source and target row counts;
- orphan FK count;
- duplicate-key count;
- required-field null count;
- status counts and review reasons;
- import/source hashes and parser versions;
- representative end-to-end provenance chains;
- commercial totals where applicable, compared without forced equality;
- legacy/new authority mode by job/package; and
- rollback readiness and known exceptions.

## 11. `project_master` Retirement Blueprint

This is not assigned to Phases A-F and must not be bundled into HBXL intake.

Future controlled steps:

1. Freeze new feature development against `project_master`.
2. Inventory rows, consumers, and all text/JSON financial fields.
3. Create an explicit reviewed mapping from each row to `jobs.id`; never rely on unique project name alone.
4. Classify every field as duplicate, source snapshot, operational fact, derived report, or unresolved.
5. Copy only non-conflicting operational facts to typed canonical structures with provenance.
6. Reconcile totals and dates; preserve conflicts for review.
7. Move application reads to `jobs`/normalized ledgers.
8. Keep `project_master` read-only for a defined audit period.
9. Archive/retire only after no consumers remain and rollback/export is proven.

## 12. Remaining Decisions Before SQL Design

The core model decisions are locked. These implementation/policy details remain:

1. Live database inventory and authoritative schema ownership.
2. Duplicate-client resolution policy and whether clients represent people, organisations, or both.
3. Exact PostgreSQL type compatibility for existing string IDs.
4. File storage service and retention policy.
5. Unit-text parser mappings and fixture coverage.
6. Commercial rounding, VAT, CIS, retention, credit-note, and payment authorization policy.
7. Actor/account identity consolidation for audit FKs.
8. Trade/package and measurable item-code governance.
9. Operational meaning of each later HBXL revision: informational update, superseding scope, or variation.
10. Whether spatial query volume ever justifies PostGIS; current answer is no.

## 13. Scope Boundary

This blueprint stops before SQL or implementation. It creates no migration files, schema changes, database access, API/UI changes, assignment rewrite, production changes, commit, push, or deployment.
