-- Phase 1B Step 2A: mapping and application ledger storage.
-- The mapping table links a Jarvis project_integration_id to an EXISTING operational jobs.id.
-- The application ledger records one application attempt per approved change revision.
-- Step 2A creates NO operational jobs/tasks rows; application records stop at 'ready'.
-- The shadow intake/review tables are untouched and stay append-only.

CREATE TABLE IF NOT EXISTS integration_project_mapping (
  project_integration_id TEXT NOT NULL,
  job_id VARCHAR NOT NULL REFERENCES jobs(id),
  mapped_by TEXT NOT NULL,
  mapped_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT integration_project_mapping_project_unique
    UNIQUE (project_integration_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS integration_change_order_applications (
  application_id UUID PRIMARY KEY,
  change_order_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  receipt_id UUID NOT NULL
    REFERENCES integration_shadow_receipts(receipt_id),
  event_id TEXT NOT NULL,
  project_integration_id TEXT NOT NULL,
  applied_to_job_id VARCHAR REFERENCES jobs(id),
  applied_by TEXT,
  applied_at TIMESTAMPTZ,
  title TEXT NOT NULL,
  approved_amount_minor BIGINT NOT NULL CHECK (approved_amount_minor >= 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  approved_snapshot_hash VARCHAR(64) NOT NULL CHECK (approved_snapshot_hash ~ '^[0-9a-f]{64}$'),
  result TEXT NOT NULL CHECK (result IN ('pending_mapping', 'ready', 'applied', 'blocked_no_mapping', 'already_applied', 'not_approved')),
  records_touched JSONB,
  CONSTRAINT integration_change_order_applications_change_revision_unique
    UNIQUE (change_order_id, revision),
  CONSTRAINT integration_change_order_applications_applied_guard
    CHECK (result <> 'applied' OR (applied_to_job_id IS NOT NULL AND applied_by IS NOT NULL AND applied_at IS NOT NULL))
);
