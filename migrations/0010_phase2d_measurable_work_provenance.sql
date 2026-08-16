-- Phase 2D: operational measurable work and explicit drawing/HBXL provenance.
-- Resource components remain immutable baseline evidence, not contractor work items.

CREATE TABLE measurable_work_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  work_area_id UUID REFERENCES work_area(id) ON DELETE RESTRICT,
  trade_code TEXT,
  trade_name TEXT NOT NULL,
  package_code TEXT,
  package_name TEXT,
  item_code TEXT,
  description TEXT NOT NULL,
  item_type TEXT,
  planned_quantity NUMERIC(18,6) CHECK (planned_quantity IS NULL OR planned_quantity >= 0),
  canonical_unit_code TEXT,
  original_unit_text TEXT,
  quantity_source TEXT
    CHECK (quantity_source IS NULL OR quantity_source IN ('DRAWING', 'HBXL_BASELINE', 'USER_CONFIRMED', 'DERIVED', 'UNKNOWN')),
  reconciliation_status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED'
    CHECK (reconciliation_status IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')),
  confidence TEXT,
  confidence_metadata JSONB,
  reason_code TEXT,
  review_reason TEXT,
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  lifecycle_status TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (lifecycle_status IN ('UNKNOWN', 'EXISTING', 'PROPOSED', 'DEMOLITION')),
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT measurable_work_item_confirmation_guard
    CHECK (reconciliation_status <> 'USER_CONFIRMED' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX measurable_work_item_job_area_idx
  ON measurable_work_item (job_id, work_area_id);
--> statement-breakpoint
CREATE INDEX measurable_work_item_job_trade_idx
  ON measurable_work_item (job_id, trade_code, trade_name);
--> statement-breakpoint
CREATE INDEX measurable_work_item_job_package_idx
  ON measurable_work_item (job_id, package_code, package_name);
--> statement-breakpoint
CREATE INDEX measurable_work_item_job_item_code_idx
  ON measurable_work_item (job_id, item_code);
--> statement-breakpoint
CREATE INDEX measurable_work_item_reconciliation_idx
  ON measurable_work_item (job_id, reconciliation_status);
--> statement-breakpoint
CREATE TABLE work_item_source_link (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  measurable_work_item_id UUID NOT NULL REFERENCES measurable_work_item(id) ON DELETE RESTRICT,
  drawing_object_id UUID REFERENCES drawing_object(id) ON DELETE RESTRICT,
  physical_wall_id UUID REFERENCES physical_wall(id) ON DELETE RESTRICT,
  wall_surface_id UUID REFERENCES wall_surface(id) ON DELETE RESTRICT,
  opening_id UUID REFERENCES opening(id) ON DELETE RESTRICT,
  source_role TEXT NOT NULL
    CHECK (source_role IN ('QUANTITY_SOURCE', 'LOCATION_EVIDENCE', 'SCOPE', 'EXCLUSION', 'REFERENCE')),
  quantity_contribution NUMERIC(18,6)
    CHECK (quantity_contribution IS NULL OR quantity_contribution >= 0),
  canonical_unit_code TEXT,
  original_unit_text TEXT,
  confidence TEXT,
  confidence_metadata JSONB,
  reconciliation_status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED'
    CHECK (reconciliation_status IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')),
  reason_code TEXT,
  review_reason TEXT,
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_item_source_link_exactly_one_target
    CHECK (num_nonnulls(drawing_object_id, physical_wall_id, wall_surface_id, opening_id) = 1),
  CONSTRAINT work_item_source_link_confirmation_guard
    CHECK (reconciliation_status <> 'USER_CONFIRMED' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX work_item_source_link_drawing_unique
  ON work_item_source_link (measurable_work_item_id, drawing_object_id, source_role)
  WHERE drawing_object_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX work_item_source_link_wall_unique
  ON work_item_source_link (measurable_work_item_id, physical_wall_id, source_role)
  WHERE physical_wall_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX work_item_source_link_surface_unique
  ON work_item_source_link (measurable_work_item_id, wall_surface_id, source_role)
  WHERE wall_surface_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX work_item_source_link_opening_unique
  ON work_item_source_link (measurable_work_item_id, opening_id, source_role)
  WHERE opening_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX work_item_source_link_work_item_idx
  ON work_item_source_link (measurable_work_item_id);
--> statement-breakpoint
CREATE INDEX work_item_source_link_drawing_idx
  ON work_item_source_link (drawing_object_id);
--> statement-breakpoint
CREATE INDEX work_item_source_link_wall_idx
  ON work_item_source_link (physical_wall_id);
--> statement-breakpoint
CREATE INDEX work_item_source_link_surface_idx
  ON work_item_source_link (wall_surface_id);
--> statement-breakpoint
CREATE INDEX work_item_source_link_opening_idx
  ON work_item_source_link (opening_id);
--> statement-breakpoint
CREATE INDEX work_item_source_link_review_idx
  ON work_item_source_link (reconciliation_status);
--> statement-breakpoint
CREATE TABLE work_item_hbxl_resource_link (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  measurable_work_item_id UUID NOT NULL REFERENCES measurable_work_item(id) ON DELETE RESTRICT,
  hbxl_resource_baseline_id UUID NOT NULL REFERENCES hbxl_resource_baseline(id) ON DELETE RESTRICT,
  resource_role TEXT
    CHECK (resource_role IS NULL OR resource_role IN ('PRIMARY', 'MATERIAL_SUPPORT', 'LABOUR_SUPPORT', 'PLANT_SUPPORT', 'COMMERCIAL_REFERENCE')),
  allocation_quantity NUMERIC(18,6)
    CHECK (allocation_quantity IS NULL OR allocation_quantity >= 0),
  allocation_basis TEXT,
  allocation_metadata JSONB,
  confidence TEXT,
  confidence_metadata JSONB,
  reconciliation_status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED'
    CHECK (reconciliation_status IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')),
  reason_code TEXT,
  review_reason TEXT,
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_item_hbxl_resource_link_confirmation_guard
    CHECK (reconciliation_status <> 'USER_CONFIRMED' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX work_item_hbxl_resource_link_unique
  ON work_item_hbxl_resource_link (
    measurable_work_item_id,
    hbxl_resource_baseline_id,
    COALESCE(resource_role, '')
  );
--> statement-breakpoint
CREATE INDEX work_item_hbxl_resource_link_work_item_idx
  ON work_item_hbxl_resource_link (measurable_work_item_id);
--> statement-breakpoint
CREATE INDEX work_item_hbxl_resource_link_resource_idx
  ON work_item_hbxl_resource_link (hbxl_resource_baseline_id);
--> statement-breakpoint
CREATE INDEX work_item_hbxl_resource_link_review_idx
  ON work_item_hbxl_resource_link (reconciliation_status);
