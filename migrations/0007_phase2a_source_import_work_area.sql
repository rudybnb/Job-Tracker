-- Phase 2A: immutable project source revisions and generic work areas.
-- Source evidence is append-only by application policy. A later source file creates a new revision.

CREATE TABLE project_source_import (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('DXF', 'PLANSEXPRESS_PXD', 'SMART_SCHEDULE_CSV', 'PDF', 'IFC', 'OTHER')),
  source_stream_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  source_hash VARCHAR(64) NOT NULL
    CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  supersedes_import_id UUID REFERENCES project_source_import(id) ON DELETE RESTRICT,
  is_current_revision BOOLEAN NOT NULL DEFAULT false,
  parser_version TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_metadata JSONB,
  status TEXT NOT NULL DEFAULT 'RECEIVED'
    CHECK (status IN ('RECEIVED', 'PARSING', 'IMPORTED', 'PARTIAL', 'FAILED', 'SUPERSEDED')),
  review_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE'
    CHECK (review_status IN ('MATCHED', 'REVIEW_REQUIRED', 'USER_CONFIRMED', 'UNRESOLVED', 'NOT_APPLICABLE')),
  reason_code TEXT,
  review_reason TEXT,
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  CONSTRAINT project_source_import_revision_unique
    UNIQUE (job_id, source_stream_key, revision_number),
  CONSTRAINT project_source_import_hash_unique
    UNIQUE (job_id, source_stream_key, source_hash),
  CONSTRAINT project_source_import_supersedes_other
    CHECK (supersedes_import_id IS NULL OR supersedes_import_id <> id),
  CONSTRAINT project_source_import_confirmation_guard
    CHECK (review_status <> 'USER_CONFIRMED' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX project_source_import_current_revision_unique
  ON project_source_import (job_id, source_stream_key)
  WHERE is_current_revision = true AND status = 'IMPORTED';
--> statement-breakpoint
CREATE INDEX project_source_import_job_source_idx
  ON project_source_import (job_id, source_type, source_stream_key);
--> statement-breakpoint
CREATE INDEX project_source_import_status_idx
  ON project_source_import (status, review_status);
--> statement-breakpoint
CREATE FUNCTION prevent_project_source_import_evidence_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.job_id IS DISTINCT FROM OLD.job_id
    OR NEW.source_type IS DISTINCT FROM OLD.source_type
    OR NEW.source_stream_key IS DISTINCT FROM OLD.source_stream_key
    OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
    OR NEW.source_hash IS DISTINCT FROM OLD.source_hash
    OR NEW.revision_number IS DISTINCT FROM OLD.revision_number
    OR NEW.supersedes_import_id IS DISTINCT FROM OLD.supersedes_import_id
    OR NEW.parser_version IS DISTINCT FROM OLD.parser_version
    OR NEW.imported_at IS DISTINCT FROM OLD.imported_at
    OR NEW.source_metadata IS DISTINCT FROM OLD.source_metadata
  THEN
    RAISE EXCEPTION 'project_source_import evidence fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER project_source_import_evidence_immutable
BEFORE UPDATE ON project_source_import
FOR EACH ROW
EXECUTE FUNCTION prevent_project_source_import_evidence_update();
--> statement-breakpoint
CREATE TABLE work_area (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  source_import_id UUID REFERENCES project_source_import(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  area_type TEXT NOT NULL
    CHECK (area_type IN ('ROOM', 'FOUNDATION', 'ROOF', 'ELEVATION', 'STRUCTURAL_ZONE', 'EXTERNAL_WORKS', 'FLOOR', 'OTHER')),
  parent_work_area_id UUID REFERENCES work_area(id) ON DELETE RESTRICT,
  level_name TEXT,
  level_index INTEGER,
  plansxpress_area_handle TEXT,
  plansxpress_area_id TEXT,
  geometry JSONB,
  coordinate_units TEXT,
  coordinate_system TEXT,
  source_origin_metadata JSONB,
  source TEXT NOT NULL
    CHECK (source IN ('PLANSEXPRESS_AREA', 'DXF', 'HBXL_PHASE', 'USER_DEFINED', 'DERIVED', 'OTHER')),
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
  CONSTRAINT work_area_confirmation_guard
    CHECK (review_status <> 'USER_CONFIRMED' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX work_area_source_handle_unique
  ON work_area (source_import_id, plansxpress_area_handle)
  WHERE source_import_id IS NOT NULL AND plansxpress_area_handle IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX work_area_root_identity_unique
  ON work_area (job_id, area_type, normalized_name, COALESCE(level_name, ''))
  WHERE parent_work_area_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX work_area_child_identity_unique
  ON work_area (job_id, parent_work_area_id, area_type, normalized_name, COALESCE(level_name, ''))
  WHERE parent_work_area_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX work_area_job_type_idx
  ON work_area (job_id, area_type);
--> statement-breakpoint
CREATE INDEX work_area_job_parent_idx
  ON work_area (job_id, parent_work_area_id);
--> statement-breakpoint
CREATE INDEX work_area_source_import_idx
  ON work_area (source_import_id);
--> statement-breakpoint
CREATE INDEX work_area_review_status_idx
  ON work_area (review_status);
