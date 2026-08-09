-- Phase 1C Step 1B: delivery/read webhook and inbound reply support.
-- Creates no operational jobs/tasks/assignments/payments/financial records.
CREATE TABLE IF NOT EXISTS contractor_messages (
  id UUID PRIMARY KEY,
  application_id UUID
    REFERENCES integration_change_order_applications(application_id),
  job_id VARCHAR REFERENCES jobs(id),
  change_order_id TEXT,
  revision INTEGER CHECK (revision IS NULL OR revision > 0),
  contractor_id VARCHAR REFERENCES contractors(id),
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  channel TEXT NOT NULL CHECK (channel = 'whatsapp'),
  phone_e164 TEXT NOT NULL CHECK (phone_e164 ~ '^\+[0-9]{8,15}$'),
  body TEXT NOT NULL,
  preview_hash VARCHAR(64) CHECK (preview_hash IS NULL OR preview_hash ~ '^[0-9a-f]{64}$'),
  provider_message_id TEXT,
  reply_to_provider_message_id TEXT,
  inbound_provider_message_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('previewed', 'queued', 'sent', 'failed', 'received')),
  delivery_status TEXT NOT NULL DEFAULT 'none'
    CHECK (delivery_status IN ('none', 'sent', 'delivered', 'read', 'failed')),
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  error_code TEXT,
  unmatched_reason TEXT,
  CONSTRAINT contractor_messages_outbound_guard
    CHECK (
      direction <> 'outbound'
      OR (
        application_id IS NOT NULL
        AND change_order_id IS NOT NULL
        AND revision IS NOT NULL
        AND contractor_id IS NOT NULL
        AND preview_hash IS NOT NULL
      )
    ),
  CONSTRAINT contractor_messages_sent_guard
    CHECK (status NOT IN ('queued', 'sent') OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE contractor_messages
  ALTER COLUMN application_id DROP NOT NULL,
  ALTER COLUMN change_order_id DROP NOT NULL,
  ALTER COLUMN revision DROP NOT NULL,
  ALTER COLUMN contractor_id DROP NOT NULL,
  ALTER COLUMN preview_hash DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS reply_to_provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS inbound_provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unmatched_reason TEXT;
--> statement-breakpoint
ALTER TABLE contractor_messages
  DROP CONSTRAINT IF EXISTS contractor_messages_direction_check,
  DROP CONSTRAINT IF EXISTS contractor_messages_status_check,
  DROP CONSTRAINT IF EXISTS contractor_messages_delivery_status_check,
  DROP CONSTRAINT IF EXISTS contractor_messages_outbound_guard;
--> statement-breakpoint
ALTER TABLE contractor_messages
  ADD CONSTRAINT contractor_messages_direction_check
    CHECK (direction IN ('outbound', 'inbound')),
  ADD CONSTRAINT contractor_messages_status_check
    CHECK (status IN ('previewed', 'queued', 'sent', 'failed', 'received')),
  ADD CONSTRAINT contractor_messages_delivery_status_check
    CHECK (delivery_status IN ('none', 'sent', 'delivered', 'read', 'failed')),
  ADD CONSTRAINT contractor_messages_outbound_guard
    CHECK (
      direction <> 'outbound'
      OR (
        application_id IS NOT NULL
        AND change_order_id IS NOT NULL
        AND revision IS NOT NULL
        AND contractor_id IS NOT NULL
        AND preview_hash IS NOT NULL
      )
    );
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS contractor_messages_inbound_provider_message_id_unique
  ON contractor_messages (inbound_provider_message_id)
  WHERE inbound_provider_message_id IS NOT NULL;
