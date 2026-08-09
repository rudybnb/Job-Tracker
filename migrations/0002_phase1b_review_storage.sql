-- Phase 1B Step 1: human review decisions for accepted Jarvis shadow changes.
-- Approval records the decision ONLY; it MUST NOT create or modify operational Job Tracker data.
-- The shadow intake tables (integration_shadow_receipts, integration_shadow_changes) are untouched and stay append-only.

CREATE TABLE IF NOT EXISTS integration_shadow_reviews (
  review_id UUID PRIMARY KEY,
  change_order_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  receipt_id UUID NOT NULL UNIQUE
    REFERENCES integration_shadow_receipts(receipt_id),
  review_status TEXT NOT NULL CHECK (review_status IN ('pending', 'approved', 'rejected', 'sent_back')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  note TEXT CHECK (note IS NULL OR char_length(note) <= 2000),
  CONSTRAINT integration_shadow_reviews_change_revision_unique
    UNIQUE (change_order_id, revision)
);
