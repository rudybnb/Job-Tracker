-- Phase 2B: source-faithful drawing objects and specialized wall structures.
-- This migration creates drawing evidence only. It creates no HBXL baseline,
-- measurable work, contractor, payment, or procurement structures.

CREATE TABLE drawing_object (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  source_import_id UUID NOT NULL REFERENCES project_source_import(id) ON DELETE RESTRICT,
  work_area_id UUID REFERENCES work_area(id) ON DELETE RESTRICT,
  source_entity_index INTEGER,
  plansxpress_handle TEXT,
  entity_type TEXT NOT NULL,
  object_category TEXT NOT NULL
    CHECK (object_category IN ('WALL', 'DOOR', 'WINDOW', 'OPENING', 'AREA', 'ROOF', 'ELECTRICAL', 'PLUMBING', 'ANNOTATION', 'SYMBOL', 'OTHER')),
  canonical_name TEXT,
  geometry JSONB,
  coordinate_units TEXT,
  coordinate_system TEXT,
  level_name TEXT,
  level_index INTEGER,
  estimating_status TEXT NOT NULL DEFAULT 'UNKNOWN_REVIEW'
    CHECK (estimating_status IN ('ESTIMATED', 'NON_ESTIMATED_VISUAL_ONLY', 'UNKNOWN_REVIEW')),
  plansxpress_pxid TEXT,
  cadx_spreadsheet TEXT,
  cadx_template TEXT,
  estimator_calculator TEXT,
  source_metadata JSONB,
  confidence TEXT,
  review_status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED'
    CHECK (review_status IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')),
  reason_code TEXT,
  review_reason TEXT,
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  lifecycle_status TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (lifecycle_status IN ('UNKNOWN', 'EXISTING', 'PROPOSED', 'DEMOLITION')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT drawing_object_source_identity_required
    CHECK (plansxpress_handle IS NOT NULL OR source_entity_index IS NOT NULL),
  CONSTRAINT drawing_object_source_entity_index_nonnegative
    CHECK (source_entity_index IS NULL OR source_entity_index >= 0),
  CONSTRAINT drawing_object_confirmation_guard
    CHECK (review_status <> 'USER_CONFIRMED' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX drawing_object_source_handle_unique
  ON drawing_object (source_import_id, plansxpress_handle)
  WHERE plansxpress_handle IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX drawing_object_source_index_unique
  ON drawing_object (source_import_id, source_entity_index)
  WHERE source_entity_index IS NOT NULL;
--> statement-breakpoint
CREATE INDEX drawing_object_job_category_idx
  ON drawing_object (job_id, object_category);
--> statement-breakpoint
CREATE INDEX drawing_object_source_import_idx
  ON drawing_object (source_import_id);
--> statement-breakpoint
CREATE INDEX drawing_object_work_area_idx
  ON drawing_object (work_area_id);
--> statement-breakpoint
CREATE INDEX drawing_object_estimation_review_idx
  ON drawing_object (estimating_status, review_status);
--> statement-breakpoint
CREATE TABLE physical_wall (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_object_id UUID NOT NULL UNIQUE REFERENCES drawing_object(id) ON DELETE RESTRICT,
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  source_import_id UUID NOT NULL REFERENCES project_source_import(id) ON DELETE RESTRICT,
  plansxpress_handle TEXT NOT NULL,
  start_point JSONB NOT NULL,
  end_point JSONB NOT NULL,
  coordinate_units TEXT,
  coordinate_system TEXT,
  raw_centreline_length NUMERIC(18,6) NOT NULL CHECK (raw_centreline_length >= 0),
  estimator_length NUMERIC(18,6) NOT NULL CHECK (estimator_length >= 0),
  wall_height NUMERIC(18,6) NOT NULL CHECK (wall_height >= 0),
  wall_type TEXT,
  external_leaf_construction TEXT,
  internal_leaf_construction TEXT,
  external_leaf_thickness NUMERIC(18,6) CHECK (external_leaf_thickness IS NULL OR external_leaf_thickness >= 0),
  internal_leaf_thickness NUMERIC(18,6) CHECK (internal_leaf_thickness IS NULL OR internal_leaf_thickness >= 0),
  cavity_thickness NUMERIC(18,6) CHECK (cavity_thickness IS NULL OR cavity_thickness >= 0),
  justification TEXT,
  internal_side_metadata JSONB,
  external_side_metadata JSONB,
  estimator_calculator TEXT,
  gross_construction_area NUMERIC(18,6) NOT NULL CHECK (gross_construction_area >= 0),
  opening_deduction_area NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (opening_deduction_area >= 0),
  net_construction_area NUMERIC(18,6) NOT NULL CHECK (net_construction_area >= 0),
  estimating_status TEXT NOT NULL DEFAULT 'UNKNOWN_REVIEW'
    CHECK (estimating_status IN ('ESTIMATED', 'NON_ESTIMATED_VISUAL_ONLY', 'UNKNOWN_REVIEW')),
  quantity_source TEXT NOT NULL DEFAULT 'HBXL_STORED'
    CHECK (quantity_source IN ('HBXL_STORED', 'PLANSEXPRESS_STORED', 'DERIVED', 'USER_CONFIRMED')),
  source_metadata JSONB,
  confidence TEXT,
  review_status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED'
    CHECK (review_status IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')),
  reason_code TEXT,
  review_reason TEXT,
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  lifecycle_status TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (lifecycle_status IN ('UNKNOWN', 'EXISTING', 'PROPOSED', 'DEMOLITION')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT physical_wall_confirmation_guard
    CHECK (review_status <> 'USER_CONFIRMED' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX physical_wall_source_handle_unique
  ON physical_wall (source_import_id, plansxpress_handle);
--> statement-breakpoint
CREATE INDEX physical_wall_job_idx
  ON physical_wall (job_id);
--> statement-breakpoint
CREATE INDEX physical_wall_source_import_idx
  ON physical_wall (source_import_id);
--> statement-breakpoint
CREATE INDEX physical_wall_estimator_calculator_idx
  ON physical_wall (estimator_calculator);
--> statement-breakpoint
CREATE INDEX physical_wall_review_status_idx
  ON physical_wall (review_status);
--> statement-breakpoint
CREATE TABLE wall_surface (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  physical_wall_id UUID NOT NULL REFERENCES physical_wall(id) ON DELETE RESTRICT,
  adjacent_work_area_id UUID REFERENCES work_area(id) ON DELETE RESTRICT,
  side TEXT NOT NULL CHECK (side IN ('A', 'B')),
  gross_surface_area NUMERIC(18,6) NOT NULL CHECK (gross_surface_area >= 0),
  opening_deduction_area NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (opening_deduction_area >= 0),
  net_available_surface_area NUMERIC(18,6) NOT NULL CHECK (net_available_surface_area >= 0),
  allocation_source TEXT NOT NULL
    CHECK (allocation_source IN ('PLANSEXPRESS_AREA', 'DXF_GEOMETRY', 'EXTERIOR_SIDE', 'USER_CONFIRMED', 'UNRESOLVED')),
  source_metadata JSONB,
  confidence TEXT,
  review_status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED'
    CHECK (review_status IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')),
  reason_code TEXT,
  review_reason TEXT,
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wall_surface_wall_side_unique UNIQUE (physical_wall_id, side),
  CONSTRAINT wall_surface_confirmation_guard
    CHECK (review_status <> 'USER_CONFIRMED' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX wall_surface_work_area_idx
  ON wall_surface (adjacent_work_area_id);
--> statement-breakpoint
CREATE INDEX wall_surface_review_status_idx
  ON wall_surface (review_status);
--> statement-breakpoint
CREATE TABLE opening (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_object_id UUID REFERENCES drawing_object(id) ON DELETE RESTRICT,
  physical_wall_id UUID REFERENCES physical_wall(id) ON DELETE RESTRICT,
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  source_import_id UUID NOT NULL REFERENCES project_source_import(id) ON DELETE RESTRICT,
  source_entity_index INTEGER,
  plansxpress_handle TEXT,
  plansxpress_pxid TEXT,
  opening_type TEXT NOT NULL
    CHECK (opening_type IN ('DOOR', 'WINDOW', 'OPENING', 'OTHER')),
  width NUMERIC(18,6) CHECK (width IS NULL OR width >= 0),
  height NUMERIC(18,6) CHECK (height IS NULL OR height >= 0),
  area NUMERIC(18,6) CHECK (area IS NULL OR area >= 0),
  position_geometry JSONB,
  coordinate_units TEXT,
  coordinate_system TEXT,
  estimating_status TEXT NOT NULL DEFAULT 'UNKNOWN_REVIEW'
    CHECK (estimating_status IN ('ESTIMATED', 'NON_ESTIMATED_VISUAL_ONLY', 'UNKNOWN_REVIEW')),
  source_metadata JSONB,
  confidence TEXT,
  review_status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED'
    CHECK (review_status IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')),
  reason_code TEXT,
  review_reason TEXT,
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  lifecycle_status TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (lifecycle_status IN ('UNKNOWN', 'EXISTING', 'PROPOSED', 'DEMOLITION')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT opening_source_identity_required
    CHECK (plansxpress_handle IS NOT NULL OR source_entity_index IS NOT NULL),
  CONSTRAINT opening_source_entity_index_nonnegative
    CHECK (source_entity_index IS NULL OR source_entity_index >= 0),
  CONSTRAINT opening_evidence_link_required
    CHECK (drawing_object_id IS NOT NULL OR physical_wall_id IS NOT NULL),
  CONSTRAINT opening_confirmation_guard
    CHECK (review_status <> 'USER_CONFIRMED' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX opening_source_handle_unique
  ON opening (source_import_id, plansxpress_handle)
  WHERE plansxpress_handle IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX opening_source_index_unique
  ON opening (source_import_id, source_entity_index)
  WHERE source_entity_index IS NOT NULL;
--> statement-breakpoint
CREATE INDEX opening_physical_wall_idx
  ON opening (physical_wall_id);
--> statement-breakpoint
CREATE INDEX opening_drawing_object_idx
  ON opening (drawing_object_id);
--> statement-breakpoint
CREATE INDEX opening_job_type_idx
  ON opening (job_id, opening_type);
--> statement-breakpoint
CREATE INDEX opening_source_import_idx
  ON opening (source_import_id);
--> statement-breakpoint
CREATE INDEX opening_estimation_review_idx
  ON opening (estimating_status, review_status);
