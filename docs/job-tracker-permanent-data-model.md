# Job Tracker Permanent Data Model Design

Status: Phase 2A design only. This document proposes a target structure and migration sequence. It does not authorize or implement schema, database, API, UI, assignment, deployment, or data changes.

## 1. Design Principles

Job Tracker must not recreate PlansXpress or EstimatorXpress.

The permanent model keeps three layers separate:

1. **HBXL commercial baseline**: imported Smart Schedule resources, original quantities, rates, dates, phases, and suppliers. This layer is immutable.
2. **PlansXpress/drawing evidence**: source files, physical objects, geometry, work areas, walls, surfaces, and openings. This layer preserves source identity and provenance.
3. **Job Tracker operations**: work items, contractor agreements, progress, claims, inspections, buying, approvals, and payments. This layer may evolve without rewriting either source layer.

Consequences:

- Never overwrite an HBXL baseline rate or quantity with a supplier quote or actual cost.
- Never duplicate a physical wall to represent its two finishable faces.
- Never turn every HBXL resource row into a contractor-facing work item.
- Never infer `EXISTING`, `PROPOSED`, or `DEMOLITION` from text alone.
- Never force source and operational quantities to match. Record the reconciliation result and reason.
- Source records are append-only. A re-import creates another import/version; it does not silently replace evidence.

## Locked Phase 2B Decisions

The following decisions are fixed for migration design unless later evidence demonstrates a concrete incompatibility.

### Canonical Project Root

`jobs` is the single canonical Job Tracker project root. Every new project-scoped table references `jobs.id`.

`project_master` is a legacy parallel root and must not receive new permanent-model relationships or capabilities. A future retirement process may:

1. inventory `project_master` rows and identify their corresponding `jobs` row using explicit mappings rather than project-name assumptions;
2. copy non-conflicting budget, contract, and date facts into typed project/financial structures with source provenance;
3. record conflicts for review instead of overwriting `jobs`;
4. redirect readers to `jobs` and normalized ledgers;
5. retain `project_master` read-only through a reconciliation period; and
6. archive or retire it only after row counts, values, and consumers are verified.

No `project_master` migration or retirement is part of Phase 2B.

### Client Identity And Project Snapshot

`clients` is selected as the future canonical client entity, but its current definition is not yet safe for an immediate mandatory relationship:

- it is created by bootstrap DDL rather than represented in the canonical Drizzle schema;
- it has no uniqueness rule suitable for resolving duplicate people/organisations;
- `total_spent` and `active_jobs` are derived counters, not identity fields; and
- current `jobs.client_name` values have not been reconciled to client rows.

The safest future design is:

- add nullable `jobs.client_id` referencing `clients.id` only after schema ownership and duplicate-client policy are resolved;
- backfill links through a reviewed mapping process; never match solely on a normalized name when ambiguous;
- retain `jobs.client_name` permanently as the project client-name snapshot;
- populate the snapshot when the client is linked or the project is created;
- do not cascade later edits to `clients.name` into historical job snapshots; and
- allow a snapshot correction only as an explicit audited project correction.

New code should use `client_id` for identity and `client_name` for historical/project display. Existing jobs remain valid with `client_id = null`.

### Assignment Coexistence

Current assignment structures remain operational during migration:

```text
jobs -> job_phases -> phase_assignments
jobs -> legacy job_assignments
```

The future measurable-work path coexists alongside them:

```text
jobs -> work_area -> measurable_work_item
     -> contract_package -> contract_package_work_item
     -> contractor_tender_rate / accepted contractor
```

Coexistence rules:

- Do not delete, rewrite, or reinterpret existing `phase_assignments` or `job_assignments` during source/drawing/work-item phases.
- New measurable work items may optionally reference an existing `job_phase_id`, but do not require an assignment.
- `contract_package` may initially hold nullable `legacy_phase_assignment_id` and `legacy_job_assignment_id` bridge references.
- Existing jobs continue to use legacy assignment/progress screens until explicitly migrated package by package.
- An accepted package becomes authoritative only for work items included in that package; legacy assignments remain authoritative for unmigrated scope.
- Do not dual-post progress, claims, or payments. Each package records an `operational_model` of `LEGACY` or `MEASURABLE_WORK` during coexistence.
- Historical legacy assignment snapshots remain unchanged after a package transition.

This permits gradual job-by-job migration without a flag day or assignment rewrite.

### Canonical Units

Quantitative records store both:

- `unit_code`: controlled lowercase Job Tracker code; and
- `source_unit_text`: the original HBXL/source text, unchanged.

Initial canonical codes are:

| Code | Meaning |
| --- | --- |
| `each` | Counted individual unit |
| `m` | Metre |
| `m2` | Square metre |
| `m3` | Cubic metre |
| `kg` | Kilogram |
| `tonne` | Metric tonne |
| `litre` | Litre |
| `bag` | Bag |
| `sheet` | Sheet |
| `day` | Day |
| `hour` | Hour |
| `item` | Source/contract item |
| `lot` | Lump lot |
| `other` | Unmapped source unit requiring source text/review |

No general conversion engine or unit catalogue table is required initially. Parsers map known text to a code and preserve the original text. Unknown or context-dependent units use `other` plus `REVIEW_REQUIRED`; they are not guessed. Quantity comparisons require compatible `unit_code` values.

### Money And Currency

- Monetary amounts use fixed-precision `numeric(18,2)` database values.
- Unit rates use `numeric(18,6)` to avoid losing fractional rates.
- Quantities use `numeric(18,6)`.
- Floating-point types are prohibited for money and rates.
- Currency is an explicit uppercase ISO 4217 code, stored as `char(3)` or equivalent checked text.
- New GBP projects/imports may default currency to `GBP`, but every commercial header/baseline/accepted snapshot remains capable of another currency.
- Multiplication and rounding policy must be centralized when implementation begins; persisted contract/order/claim totals are snapshots, not repeatedly recomputed historical values.
- HBXL baseline rates/values, supplier quote rates/values, accepted purchase-order rates/values, and actual purchase costs remain separate.

No automatic currency conversion is designed in this phase.

### Geometry Storage

Use PostgreSQL `jsonb`; do not introduce PostGIS initially.

The geometry value uses a small GeoJSON-compatible shape:

```json
{
  "type": "Point | LineString | Polygon",
  "coordinates": []
}
```

Every geometry-bearing record also stores:

- `coordinate_unit`: normally `mm` for native PlansXpress/DXF coordinates or the explicit source unit;
- `coordinate_system`: `PLANSEXPRESS_LOCAL`, `DXF_LOCAL`, a known CRS identifier, or `UNKNOWN`;
- `source_origin_metadata` JSONB when origin, scale, transform, level, or axis details are available; and
- `source_geometry` unchanged from the import interpretation.

Wall start/end points may be exposed as typed JSONB point fields on `physical_wall` for direct operational access while the full source geometry remains on `drawing_object`. Geometry-derived room/side conclusions store provenance and confidence, not duplicate polygons. PostGIS should be reconsidered only if indexed spatial querying, large-model performance, or CRS transformation becomes a proven requirement.

### Immutable HBXL Revisions

Every source import is an immutable revision. `project_source_import` therefore includes:

- `source_stream_key`: stable job-scoped identity such as `hbxl-smart-schedule`, `plansxpress-project`, or a document-specific key;
- `revision_number`: positive integer within that stream;
- `file_sha256`;
- `imported_at` and `imported_by`;
- `supersedes_import_id` self-FK;
- `parser_name` and `parser_version`;
- `is_current_revision`: mutable designation only, not mutable source evidence; and
- import/parse status.

Constraints:

- unique `(job_id, source_stream_key, revision_number)`;
- unique `(job_id, source_stream_key, file_sha256)` to prevent duplicate content in one stream; and
- at most one current successfully imported revision per `(job_id, source_stream_key)` via a partial unique constraint.

A new revision inserts new import, drawing, and baseline rows. It never updates old source rows. Switching the current revision is an audited designation change. Future comparison logic can compare immutable revisions to answer both "what did HBXL originally say?" and "what changed?"; comparison logic is not part of this phase.

### PlansXpress Estimating Status

The only PlansXpress estimating statuses are:

- `ESTIMATED`
- `NON_ESTIMATED_VISUAL_ONLY`
- `UNKNOWN_REVIEW`

`NON_ESTIMATED_VISUAL_ONLY` remains drawing/3D/reference evidence. It must not create procurement requirements, project cost, HBXL mismatch records, contractor quantities, or payment scope. Reclassification requires an audited user/source confirmation. Smart Schedule absence alone is not a classifier.

### Source Identity And Uniqueness

- PlansXpress entity: unique `(source_import_id, plansxpress_handle)` when Handle exists.
- PlansXpress fallback: unique `(source_import_id, source_entity_index)` when Handle is absent.
- Physical wall: one-to-one with its wall `drawing_object`; preserve `(source_import_id, plansxpress_handle)`.
- Opening/Area specialized records: preserve source import plus Handle; PXID is supporting identity and may be scoped/reused.
- HBXL resource baseline: unique `(source_import_id, source_row_number)` with a stored row hash. Product/resource code is indexed but never treated as globally or revision-unique.
- Work items and operational records use Job Tracker UUIDs; source IDs are never replaced by invented operational IDs.

### Provenance Chain

Traceability uses foreign-key links rather than copied source rows:

```text
measurable_work_item
  -> work_item_source_link
     -> drawing_object / physical_wall / wall_surface / opening
        -> project_source_import (PlansXpress/DXF)
  -> work_item_hbxl_resource_link
     -> hbxl_resource_baseline
        -> project_source_import (Smart Schedule)
```

Derived records store `derivation_method`, `derivation_version`, reconciliation status/reason, and actor/time where applicable. Raw source attributes stay on source-derived records; they are not copied into contractor, claim, or procurement records unless an immutable commercial snapshot is required.

### Review States

The shared reconciliation states are locked as:

- `MATCHED`
- `REVIEW_REQUIRED`
- `USER_CONFIRMED`
- `UNRESOLVED`
- `NOT_APPLICABLE`

Where applicable, records also preserve `reason_code`, human-readable `reason`, `confirmed_by`, and `confirmed_at`. `USER_CONFIRMED` requires actor, timestamp, and reason. Status changes must not erase the previous evidence or source-derived value.

## 2. Existing Schema Audit

The existing schema is split across canonical migrations, `shared/schema.ts`, bootstrap-created financial tables, and authentication bootstrap tables. Before implementation, the migration phase must establish one authoritative inventory. No live database was inspected during this design.

### Reuse As Permanent Roots

| Existing table | Decision | Permanent role / later extension |
| --- | --- | --- |
| `jobs` | Reuse and extend later | Canonical project/job root. Add a real `client_id`; retain legacy `client_name`, `phases`, and `phase_task_data` as migration-era fields, not new authoritative data. Clarify or retire the single `contractor_id` after normalized packages are available. |
| `clients` | Reuse and extend later | Canonical client. Link from `jobs`; review uniqueness and derived counters. |
| `contractors` | Reuse and extend later | Canonical contractor business entity. Do not put project-specific accepted rates on this table. |
| `job_phases` | Reuse and extend later | Project trade/build-phase/package hierarchy. Add per-job uniqueness/order rules and distinguish imported HBXL build phases from operational packages where needed. |
| `sub_phases` | Reuse cautiously | Optional package subdivision. Do not use it as a substitute for measurable work items. |
| `phase_assignments` | Reuse and extend later | Existing normalized contractor-to-phase assignment. It may reference an accepted `contract_package`; agreed-price fields become legacy summary fields once tender-rate lines are authoritative. |
| `contractor_types` | Reuse | Contractor payment basis/type reference. |
| `milestones` | Reuse cautiously | Contract milestone summaries where appropriate; not a substitute for quantity claims or inspection decisions. |
| `contractor_payments` | Reuse and extend later | Payment ledger. Future payment lines must reference approved claim quantities and locked tender rates. |
| `expenses` | Reuse and extend later | General posted actual-cost ledger. It may receive links from actual purchase costs; it must not overwrite HBXL baseline data. |
| `material_purchases` | Reuse/migrate later | Existing authentic invoice/purchase-line evidence. Add project, supplier, source-import, and document links; use numeric money types. |
| `materials_catalog` | Reuse cautiously | Supplier/catalog reference, not HBXL baseline and not accepted purchase price. |
| `budget_alerts` | Reuse | Derived operational alerts. |
| `integration_project_mapping` | Reuse, leave stable | Maps external integration project IDs to `jobs`. |
| `integration_shadow_receipts`, `integration_shadow_changes`, `integration_shadow_reviews`, `integration_change_order_applications` | Leave untouched | Existing append/audit ledgers. Do not repurpose as HBXL imports or operational claims. |
| `contractor_messages` | Leave audit semantics intact | Communication ledger; not part of the quantity model. |

### Extend Existing Workflow Tables Later

| Existing table | Decision | Reason |
| --- | --- | --- |
| `job_assignments` | Extend/migrate later | Preserve current records, then add `job_id` and `contractor_id` FKs. It currently duplicates names, contacts, location, and HBXL job text. New package agreements should use normalized contract structures. |
| `task_progress` | Extend/migrate later | Existing completion tracking can be linked to measurable work items, but boolean completion cannot represent completed, claimed, inspected, approved, held, and outstanding quantities. |
| `admin_inspections` | Reuse as inspection header | Add canonical job/assignment/inspector links later. Quantity decisions belong in a separate inspection-decision table. |
| `task_inspection_results` | Extend/migrate later | Retain legacy task inspection history; future quantity approvals should reference measurable work items and claims. |
| `inspection_notifications` | Reuse | Notification workflow, not inspection quantity authority. |
| `contractor_reports` | Reuse | Issue/report workflow; add normalized references later. |
| `work_sessions`, `temporary_departures` | Reuse and normalize later | Attendance/time evidence. Add contractor, job, and assignment FKs. Do not mix with measured-work progress. |
| `work_hours` | Consolidate later | Overlaps `work_sessions`; select one permanent time-entry model after data audit. |
| `project_cashflow_weekly` | Extend later | Reporting/forecast snapshot only, not a source financial ledger. |
| `csv_uploads` | Migrate into general source imports | Existing CSV batch metadata is too narrow. Preserve its IDs/history while introducing a source-neutral import model. |

### Leave Untouched

- `admin_settings`
- `calendar_events`
- `email_records`
- `meetings`
- `contractor_applications` during this phase; it requires a separate security/privacy redesign.

### Consolidate Or Replace Only Through Explicit Migration

| Existing table | Direction |
| --- | --- |
| `project_master` | Do not expand. It is a parallel project root. Migrate useful budget/contract attributes to `jobs` and normalized ledgers, then retire only after reconciliation. |
| `simple_users`, `staff` | Consolidate into one future account/role model in a separate authentication project. |
| `contractor_replies` | Migrate to the channel-neutral `contractor_messages` ledger if historical semantics permit. |
| `work_hours` | Consolidate with `work_sessions` rather than maintaining two permanent time roots. |

## 3. Common Types And Conventions

These are target-model conventions, not migration instructions.

### IDs And Data Types

- New primary keys: UUID.
- Existing `jobs.id` and `contractors.id`: retain their current string UUID-compatible type until a controlled normalization.
- Quantities: `numeric(18,6)`.
- Money: `numeric(18,2)`; unit rates: `numeric(18,6)`; explicit ISO currency. Do not use floating point.
- Dates: `date`; event timestamps: `timestamptz`.
- Geometry: JSONB/GeoJSON initially, with explicit units and coordinate system. PostGIS is optional and should only be introduced if operational spatial queries justify it.
- Source metadata: JSONB is allowed for faithful source attributes that are not operational columns.

### Common Statuses

Use a shared reconciliation vocabulary on records that compare or interpret evidence:

- `MATCHED`
- `REVIEW_REQUIRED`
- `USER_CONFIRMED`
- `UNRESOLVED`
- `NOT_APPLICABLE`

Each status-bearing record should also hold:

- `reason_code`
- `reason`
- `confidence` (optional numeric or controlled band)
- `confirmed_by`
- `confirmed_at`
- `created_at`, `created_by`
- `updated_at`, `updated_by` for operational records only

Source and baseline records should not have general-purpose update workflows. Corrections should be new imports or explicit supersession records.

### Optional Lifecycle Metadata

`lifecycle_status` is Job Tracker metadata with values:

- `UNKNOWN`
- `EXISTING`
- `PROPOSED`
- `DEMOLITION`

Default is `UNKNOWN`. PlansXpress text, calculator names, or layer names must not set it automatically. A future source parser may populate it only when a deterministic source field is proven; otherwise a user may confirm it with audit details.

## 4. Proposed Core Entities

The following tables are the minimum permanent source, drawing, baseline, and measurable-work model.

### 4.1 `project_source_import`

**Purpose:** immutable import/version record for every source file used by a job.

**Primary key:** `id UUID`.

**Important fields:**

- `job_id` FK to `jobs.id`, required
- `source_type`: `DXF`, `PLANSEXPRESS_PXD`, `SMART_SCHEDULE_CSV`, `PDF`, `IFC`, `OTHER`
- `original_filename`, `storage_uri`
- `file_sha256`
- `file_size_bytes`, `media_type`
- `hbxl_project_reference`, `hbxl_job_reference`
- `source_stream_key`, `revision_number`
- `parser_name`, `parser_version`
- `import_status`: `RECEIVED`, `PARSING`, `IMPORTED`, `PARTIAL`, `FAILED`, `SUPERSEDED`
- `imported_at`, `imported_by`
- `supersedes_import_id` nullable self-FK
- `is_current_revision`
- `source_metadata`, `parse_summary`, `error_summary` JSONB

**Unique constraints:**

- `(job_id, source_stream_key, revision_number)`.
- `(job_id, source_stream_key, file_sha256)` prevents duplicate content in one stream.
- Partial unique current-successful revision per `(job_id, source_stream_key)`.
- Do not make filename unique.

**Immutable fields:** job, source type, original filename, hash, file bytes/storage identity, source/parser versions, imported timestamp, provenance. Status may move through the import lifecycle but imported evidence is never rewritten.

**Existing-table strategy:** this is the target evolution of `csv_uploads`. Migrate/link old uploads; do not maintain two active generic import roots indefinitely.

### 4.2 `drawing_object`

**Purpose:** generic source-faithful PlansXpress/drawing entity. It is not automatically a work item.

**Primary key:** `id UUID`.

**Important fields:**

- `job_id` FK to `jobs.id`
- `source_import_id` FK to `project_source_import.id`
- `plansxpress_handle` nullable source identifier
- `plansxpress_entity_type`
- `object_category`: controlled values such as `WALL`, `DOOR`, `WINDOW`, `OPENING`, `AREA`, `ROOF`, `ELECTRICAL`, `PLUMBING`, `ANNOTATION`, `SYMBOL`, `OTHER`
- `canonical_name`
- `geometry` JSONB, `geometry_units`, `coordinate_system`
- `level_name`, `level_index`
- `estimating_status`: `ESTIMATED`, `NON_ESTIMATED_VISUAL_ONLY`, `UNKNOWN_REVIEW`
- `plansxpress_pxid`
- `cadx_spreadsheet`, `cadx_template`, `estimator_calculator_reference`
- `lifecycle_status`, default `UNKNOWN`
- `source_metadata` JSONB
- common reconciliation/audit fields

**Unique constraints:**

- Unique `(source_import_id, plansxpress_handle)` where handle is not null.
- Fallback source identity may use `(source_import_id, source_entity_index)` when no handle exists.

**Rules:**

- PlansXpress Handle remains the original source identifier; Job Tracker UUID is separate.
- `ESTIMATED` requires deterministic PlansXpress estimating evidence, not Smart Schedule presence alone.
- `NON_ESTIMATED_VISUAL_ONLY` remains queryable/renderable but cannot generate buying, cost, or mismatch records.
- `UNKNOWN_REVIEW` contributes nothing operationally until confirmed.

### 4.3 `work_area`

**Purpose:** universal operational location/package zone. `room_id` is deliberately not the core abstraction.

**Primary key:** `id UUID`.

**Important fields:**

- `job_id` FK to `jobs.id`
- `parent_work_area_id` nullable self-FK
- `name`
- `work_area_type`: `ROOM`, `FOUNDATION`, `ROOF`, `ELEVATION`, `STRUCTURAL_ZONE`, `EXTERNAL_WORKS`, `FLOOR`, `OTHER`
- `level_name`, `level_index`
- `plansxpress_area_handle`, `plansxpress_area_pxid`
- `source_import_id` nullable FK
- `geometry` JSONB, units/coordinate system
- `source_kind`: `PLANSEXPRESS_AREA`, `DXF`, `HBXL_PHASE`, `USER_DEFINED`, `DERIVED`
- `lifecycle_status`
- common confidence/review/audit fields

**Unique constraints:**

- `(job_id, parent_work_area_id, work_area_type, normalized_name)` for operational identity.
- Unique `(source_import_id, plansxpress_area_handle)` when present.

### 4.4 `physical_wall`

**Purpose:** one record per physical wall. Construction quantities and buying use this once.

**Primary key:** `id UUID`.

**Relationships:**

- `job_id` FK to `jobs.id`
- `drawing_object_id` FK to `drawing_object.id`, required and unique
- `source_import_id` FK to `project_source_import.id`

**Important fields:**

- `plansxpress_handle` (copied indexed source identity for operational lookup)
- start/end point JSONB or numeric x/y/z columns
- `geometry_units`
- `raw_centreline_length`
- `estimator_length`
- `wall_height`
- `wall_type`
- `external_leaf_construction`, `internal_leaf_construction`
- `external_leaf_thickness`, `internal_leaf_thickness`, `cavity_thickness`
- `estimator_calculator_reference`
- `gross_construction_area`
- `opening_deduction_area`
- `net_construction_area`
- `estimating_status`, `lifecycle_status`
- `quantity_source`: normally `HBXL_STORED`, otherwise explicit `DERIVED` or `USER_CONFIRMED`
- common review/provenance fields

**Unique constraints:**

- `drawing_object_id` unique.
- `(source_import_id, plansxpress_handle)` unique.

**Immutable source fields:** handle, source geometry, stored Estimator length/height/areas, calculator and construction attributes. A new import creates a new source version; it does not mutate history.

**Rule:** prefer stored HBXL/PlansXpress estimating quantities. Derived calculations may be retained as comparison evidence but must not silently replace stored values.

### 4.5 `wall_surface`

**Purpose:** independently addressable face of a physical wall for plastering, painting, tiling, and other finishes.

**Primary key:** `id UUID`.

**Important fields:**

- `physical_wall_id` FK to `physical_wall.id`
- `side`: `A`, `B`
- `adjacent_work_area_id` nullable FK to `work_area.id`
- `gross_surface_area`
- `opening_deduction_area`
- `net_available_surface_area`
- `area_source`: `HBXL_STORED`, `PLANSEXPRESS_DERIVED`, `USER_CONFIRMED`
- common location confidence/review fields

**Unique constraint:** `(physical_wall_id, side)`.

**Rules:**

- A physical wall has at most two surface rows.
- A partition may have two room-facing surfaces; an external wall may have one room face and one exterior work area.
- Surface rows never duplicate wall construction quantities or resources.
- Unresolved adjacency is represented by a null work area plus `REVIEW_REQUIRED`, not a guessed room.

### 4.6 `opening`

**Purpose:** door, window, structural opening, or other void associated with a physical wall.

**Primary key:** `id UUID`.

**Important fields:**

- `job_id` FK to `jobs.id`
- `source_import_id` FK
- `drawing_object_id` nullable FK to `drawing_object.id`
- `physical_wall_id` FK to `physical_wall.id`
- `plansxpress_handle`, `plansxpress_pxid`
- `opening_type`: `DOOR`, `WINDOW`, `OPENING`, `OTHER`
- width, height, stored area
- position/distance along wall and geometry JSONB
- `estimating_status`, `lifecycle_status`
- `deduction_source`, common review/provenance fields

**Unique constraints:**

- Unique `(source_import_id, plansxpress_handle)` when handle exists.
- Otherwise unique source-scoped key such as `(physical_wall_id, plansxpress_pxid, source_entity_index)`.

**Rule:** wall deductions use stored source opening area where available. Face-specific deduction differences belong on `wall_surface`; the opening itself remains one physical object.

### 4.7 `hbxl_resource_baseline`

**Purpose:** immutable Smart Schedule project baseline resource rows.

**Primary key:** `id UUID`.

**Important fields:**

- `job_id` FK to `jobs.id`
- `source_import_id` FK to the Smart Schedule import
- `source_row_number`, `source_row_hash`
- `hbxl_product_code`
- `description`, `description_with_price`
- `resource_type`: `MATERIAL`, `LABOUR`, `PLANT`, optionally `OTHER` for faithful import
- quantity, canonical `unit_code`, immutable `source_unit_text`
- `original_rate`, `original_value`, `currency`
- supplier name/reference as supplied
- `build_phase`
- `order_date`, `required_date`
- `source_metadata` JSONB
- import/provenance timestamps

**Unique constraint:** `(source_import_id, source_row_number)`; optionally verify row hash.

**Immutable fields:** all baseline commercial fields. Corrections require a new import/version. No supplier quote, purchase order, invoice, or actual cost may update this table.

### 4.8 `measurable_work_item`

**Purpose:** contractor-facing operational unit of measurable work, not an HBXL resource component.

**Primary key:** `id UUID`.

**Important fields:**

- `job_id` FK to `jobs.id`
- `work_area_id` FK to `work_area.id`
- `job_phase_id` nullable FK to reused `job_phases.id` for trade/package grouping
- `trade_package_name` snapshot/canonical label
- `item_code` optional stable Job Tracker code
- `description`
- `planned_quantity`, canonical `unit_code`
- `source_quantity`, `source_unit_code`, `source_unit_text`
- `quantity_source`: `HBXL_STORED`, `DRAWING_DERIVED`, `USER_DEFINED`, `USER_CONFIRMED`
- `lifecycle_status`
- common reconciliation/review/audit fields
- `is_active`, `superseded_by_work_item_id` nullable self-FK

**Unique constraint:** avoid over-constraining natural descriptions. Prefer `(job_id, work_area_id, item_code)` where an item code exists; otherwise use a generated UUID and duplicate-review logic.

**Rules:**

- The hierarchy is Job -> Work Area -> Trade/Package -> Measurable Work Item.
- Planned, source, completed, claimed, inspected, and approved quantities are separate facts.
- Resource build-up stays in links to `hbxl_resource_baseline`.

### 4.9 `work_item_source_link`

**Purpose:** one compact many-to-many link from a measurable work item to its physical drawing evidence.

**Primary key:** `id UUID`.

**Important fields:**

- `measurable_work_item_id` FK
- exactly one of:
  - `drawing_object_id` FK
  - `physical_wall_id` FK
  - `wall_surface_id` FK
  - `opening_id` FK
- `link_role`: `QUANTITY_SOURCE`, `LOCATION_EVIDENCE`, `SCOPE`, `EXCLUSION`, `REFERENCE`
- `linked_quantity` optional
- common confidence/review/provenance fields

**Constraints:** check exactly one target FK is non-null. Unique work-item/target/link-role constraints prevent duplicate links.

**Examples:** socket work item to three socket drawing objects; brickwork to physical walls; painting to wall surfaces.

### 4.10 `work_item_hbxl_resource_link`

**Purpose:** many-to-many resource build-up supporting a measurable work item.

**Primary key:** `id UUID`.

**Important fields:**

- `measurable_work_item_id` FK
- `hbxl_resource_baseline_id` FK
- `relationship`: `DIRECT`, `SUPPORTING`, `ALLOWANCE`, `LABOUR_BUILDUP`, `PLANT_BUILDUP`, `REVIEW`
- `allocation_quantity` and `allocation_basis` only when explicitly proven
- common review/provenance fields

**Unique constraint:** `(measurable_work_item_id, hbxl_resource_baseline_id, relationship)`.

**Rule:** links do not alter the immutable resource row and do not expose every resource as a separate contractor task.

## 5. Contractor And Tender Layer

These structures are a later operational phase.

### 5.1 `contract_package`

**Purpose:** project scope offered/awarded to a contractor. It groups measurable work, not HBXL resource rows.

**Primary key:** `id UUID`.

**Fields:** job FK, optional `job_phase_id`, package name, scope version, status (`DRAFT`, `ISSUED`, `TENDERED`, `ACCEPTED`, `CANCELLED`, `COMPLETED`), currency, issued/accepted timestamps, accepted contractor FK, audit fields.

**Relationship to existing tables:** an accepted package may link one-to-one or one-to-many with `phase_assignments`. Do not delete existing assignments.

### 5.2 `contract_package_work_item`

**Purpose:** package-to-work-item join and tender scope snapshot.

**Fields:** package FK, work-item FK, tender quantity, unit, scope notes, included/excluded status.

**Unique constraint:** `(contract_package_id, measurable_work_item_id)`.

### 5.3 `contractor_tender_rate`

**Purpose:** contractor's offered and accepted rate for one package work item.

**Primary key:** `id UUID`.

**Fields:** package-work-item FK, contractor FK, agreed quantity, unit, offered rate, accepted/locked rate, currency, agreed contract value, status, submitted/accepted timestamps, accepted by, source document/import, audit fields.

**Immutable after acceptance:** contractor, scope item, agreed quantity/unit, locked rate, currency, accepted contract value, acceptance actor/time. Corrections require a superseding rate/version, never in-place repricing.

## 6. Progress, Claims, Inspection, And Payment

### 6.1 `work_progress`

**Purpose:** append-only measured progress entries for a work item/package.

**Fields:** work item FK, package FK, contractor FK, progress date, completed quantity delta, cumulative completed quantity snapshot, unit, evidence/document links, submitted by/at, review status.

Do not overwrite `measurable_work_item.planned_quantity`.

### 6.2 `contractor_claim` and `contractor_claim_line`

**Purpose:** claim header and line-level quantities submitted by a contractor.

**Claim fields:** job, package, contractor, claim number/period, submitted status/time, currency, notes.

**Line fields:** claim FK, work item FK, tender-rate FK, claimed quantity this period, cumulative claimed quantity, unit, claimed value snapshot.

**Unique constraints:** `(contract_package_id, claim_number)` and one line per claim/work-item/rate version.

Claimed quantity is never automatically approved.

### 6.3 `inspection_decision`

**Purpose:** authoritative line-level inspection outcome.

**Fields:** claim line FK or work item FK, optional `admin_inspection_id`, inspector identity, inspected quantity, approved quantity, rejected quantity, held quantity, reason, evidence, decision status/time, supersedes decision FK.

**Constraint:** approved + rejected + held must not exceed inspected quantity for the decision basis.

Existing `admin_inspections` remains the inspection header/report; `inspection_decision` provides measured approval detail.

### 6.4 Payment Rule

Payment valuation must use:

`approved quantity x accepted locked tender rate`

Never use contractor claimed quantity automatically. `contractor_payments` should later reference approved claim/decision valuation lines. Outstanding quantity is derived from planned/agreed quantity less cumulative approved quantity; rejected and held quantities remain separately visible.

## 7. Buying And Pricing Layer

This is a later phase and deliberately separate from `hbxl_resource_baseline`.

### 7.1 `procurement_requirement`

Material/plant requirement derived from an approved operational need. Fields include job, work item, optional baseline-resource link, required quantity/unit/date, delivery work area, status, and provenance.

### 7.2 `supplier_quote` and `supplier_quote_line`

Quote header and immutable supplier-offer lines. Fields include supplier identity, quote reference/version, validity, currency, quoted quantity/unit/rate/value, delivery charge/date, baseline comparison link, and source document.

### 7.3 `purchase_order` and `purchase_order_line`

Accepted buying commitment. Store locked ordered quantity/rate/value and accepted quote-line reference. Later quote/catalog changes cannot alter an issued order.

### 7.4 `delivery` and `delivery_line`

Delivery/receipt evidence against order lines: delivered quantity, accepted/rejected quantity, date, location, note, and document/photo references.

### 7.5 `actual_purchase_cost`

Invoice/credit line for actual paid/payable cost. Link to purchase-order line, delivery, supplier, invoice source import, and optionally existing `material_purchases`/`expenses` during migration.

The three commercial values remain independent:

1. HBXL allowance/rate in `hbxl_resource_baseline`.
2. Current supplier quote in `supplier_quote_line`.
3. Actual purchase price in `actual_purchase_cost`.

Comparisons are queries/reporting outputs, not updates to the baseline.

## 8. Audit And Provenance Requirements

- Every source-derived record references `project_source_import` directly or through a source-derived parent.
- Preserve PlansXpress Handle, PXID, entity type, spreadsheet, template, source row, and parser version where applicable.
- Store raw source attributes in JSONB when needed to prove interpretation, but promote operationally queried fields into typed columns.
- Record classification rule/version for `estimating_status`.
- `NON_ESTIMATED_VISUAL_ONLY` objects cannot be linked with a quantity-generating role unless a user explicitly reclassifies them with an audited decision.
- User confirmations record previous value/status, new value/status, actor, timestamp, and reason. A lightweight audit-event table can be added when implementation begins if the application has no common audit mechanism.
- Financial acceptance records and source baselines are append-only/superseded, never silently edited.
- Deletion of source, tender, claim, inspection, order, delivery, or cost records should be restricted; use status/supersession rather than cascade deletion.

## 9. Readable ER Diagram

```text
clients
  1
  |
  *
jobs ---------------------------------------------------------------+
  | 1                                                              |
  |                                                                |
  +--< project_source_import                                       |
  |       | 1                                                      |
  |       +--< drawing_object                                      |
  |       |       | 0..1                                           |
  |       |       +---- physical_wall ----< wall_surface           |
  |       |       |           |                                    |
  |       |       |           +----< opening                       |
  |       |       +---- optional specialized objects               |
  |       |                                                        |
  |       +--< hbxl_resource_baseline                              |
  |                                                                |
  +--< work_area                                                    |
  |       |                                                        |
  |       +--< measurable_work_item >-- optional job_phases        |
  |                    |                                           |
  |                    +--< work_item_source_link >-- drawing_object
  |                    |                         >-- physical_wall   |
  |                    |                         >-- wall_surface    |
  |                    |                         >-- opening         |
  |                    |                                           |
  |                    +--< work_item_hbxl_resource_link            |
  |                              >-- hbxl_resource_baseline         |
  |                                                                |
  +--< contract_package --< contract_package_work_item              |
  |          |                         |                            |
  |          |                         +--< contractor_tender_rate >-- contractors
  |          |                                                      |
  |          +--< work_progress                                     |
  |          +--< contractor_claim --< contractor_claim_line        |
  |                                            |                    |
  |                                            +--< inspection_decision
  |                                                     |
  |                                                     +--> contractor_payments
  |                                                                |
  +--< procurement_requirement >-- measurable_work_item             |
           |                                                       |
           +--< supplier_quote_line <--- supplier_quote             |
           +--< purchase_order_line <--- purchase_order             |
                    +--< delivery_line <--- delivery                |
                    +--< actual_purchase_cost                       |
```

## 10. Key Invariants

1. `jobs` is the only permanent project aggregate root.
2. A source import belongs to exactly one job and is immutable evidence.
3. PlansXpress Handle is unique only within its source import, not globally.
4. One `physical_wall` corresponds to one wall drawing object.
5. One physical wall has at most two wall surfaces.
6. Construction scope links to `physical_wall`; finish scope links to `wall_surface`.
7. One opening belongs to one physical wall; face deductions may differ but do not duplicate the opening.
8. HBXL baseline rows are immutable and versioned by source import.
9. Work items are operational scope, not resource rows.
10. Accepted tender rates are locked snapshots.
11. Claims, progress, inspections, approvals, and payments are separate facts.
12. Payment is based on approved quantity and locked rate.
13. Supplier quotes and actual costs never update HBXL baseline prices.
14. Review status always retains a reason; unresolved data is not forced to match.
15. Lifecycle status defaults to `UNKNOWN` and is never inferred from free text.

## 11. Suggested Phased Migration Order

No migration is included in this design. The implementation-level sequence, constraints, nullable bootstrap strategy, dependencies, and rollback considerations are locked in `docs/job-tracker-migration-blueprint.md`.

### Phase A: Source Imports And Work Areas

Add immutable imports and universal work areas. Add a nullable client relationship only after client reconciliation; preserve `jobs.client_name`.

### Phase B: Drawing Objects, Walls, Surfaces, And Openings

Add source-faithful drawing identity and specialized physical geometry. Do not create operational scope or buying records.

### Phase C: Immutable HBXL Baseline

Add Smart Schedule resource rows under immutable source revisions. Preserve source unit text and original commercial values.

### Phase D: Measurable Work And Link Tables

Add operational work items and links to drawing evidence and HBXL resource build-up. Legacy assignments and progress remain authoritative unless explicitly transitioned.

### Phase E: Contractor, Tender, Progress, Inspection, And Payment

Add package-by-package measurable-work contracting with locked rates, separate claims and inspection decisions, and approved-quantity payment valuation. Coexist with legacy `phase_assignments` and `job_assignments`.

### Phase F: Procurement And Pricing

Add requirements, quotes, orders, deliveries, and actual cost lines while retaining separate HBXL baseline, supplier offer, and actual purchase values.

Legacy consolidation, including `project_master` retirement, is a separate later programme after these phases and is not an HBXL intake dependency.

## 12. Risks And Open Questions

1. **Schema ownership:** canonical migrations, bootstrap DDL, and Drizzle schema are not currently one complete source of truth.
2. **Legacy project mapping:** `jobs` is canonical, but `project_master`, free-text `hbxl_job`, and non-FK `project_id` values still require reviewed migration mappings.
3. **Assignment identity:** `jobs.contractor_id`, `job_assignments`, and `phase_assignments` overlap.
4. **Client data quality:** `clients` is the future identity root and `jobs.client_name` remains a snapshot, but duplicate-client and backfill rules require live-data review.
5. **Authentication identity:** `simple_users`, `staff`, contractor application credentials, and contractor records overlap.
6. **Financial deletion rules:** existing cascade deletes are unsafe for permanent accepted rates, claims, inspections, payments, and actual costs.
7. **Unit mappings:** the canonical codes are locked, but parser-specific source-text mappings still need fixtures and review rules.
8. **Geometry performance:** JSONB is locked for initial implementation; only measured future query/performance requirements can reopen PostGIS consideration.
9. **HBXL revision intent:** immutable revision mechanics are locked; users still need an operational choice describing whether a new revision is informational, superseding scope, or a contract variation.
10. **Trade/package taxonomy:** decide which `job_phases` values are canonical operational packages versus imported HBXL phase labels.
11. **Suppliers:** the current schema lacks a canonical supplier entity. Add one only when procurement implementation begins, not during source-model migration.
12. **Claims and retention:** retention, tax/CIS, VAT, credit notes, and client valuations need financial policy before implementation.
13. **Non-estimated 3D objects:** preserve them as drawing objects, but do not create operational quantities unless explicitly confirmed.
14. **Lifecycle metadata:** existing/proposed/demolition remains optional and user/source-confirmed only.

## 13. Scope Boundary

This design ends before implementation. It creates no migration, database access, API, UI, assignment rewrite, import, commit, push, or deployment.
