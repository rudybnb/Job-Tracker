-- Phase 1A: Jarvis shadow intake storage.
-- The tables are append-only through the shadow repository; no update or removal SQL is provided.
-- Database-level immutability controls are deferred to a later hardening phase.

CREATE TABLE IF NOT EXISTS integration_shadow_receipts (
  receipt_id UUID PRIMARY KEY,
  producer TEXT NOT NULL,
  event_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  change_order_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  project_integration_id TEXT NOT NULL,
  payload_sha256 VARCHAR(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  received_at TIMESTAMPTZ NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('accepted', 'duplicate', 'rejected')),
  rejection_code TEXT,
  CONSTRAINT integration_shadow_receipts_producer_event_unique
    UNIQUE (producer, event_id),
  CONSTRAINT integration_shadow_receipts_change_revision_unique
    UNIQUE (change_order_id, revision)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS integration_shadow_changes (
  id UUID PRIMARY KEY,
  receipt_id UUID NOT NULL UNIQUE
    REFERENCES integration_shadow_receipts(receipt_id),
  event_id TEXT NOT NULL,
  change_order_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  project_integration_id TEXT NOT NULL,
  approved_snapshot JSONB NOT NULL,
  payload_sha256 VARCHAR(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL
);
