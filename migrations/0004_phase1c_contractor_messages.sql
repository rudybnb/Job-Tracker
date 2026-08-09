-- Phase 1C Step 1A: outbound WhatsApp contractor message ledger.
-- Creates no operational jobs/tasks/assignments/payments/financial records.
CREATE TABLE IF NOT EXISTS contractor_messages (
  id UUID PRIMARY KEY,
  application_id UUID NOT NULL
    REFERENCES integration_change_order_applications(application_id),
  job_id VARCHAR REFERENCES jobs(id),
  change_order_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  contractor_id VARCHAR NOT NULL REFERENCES contractors(id),
  direction TEXT NOT NULL CHECK (direction = 'outbound'),
  channel TEXT NOT NULL CHECK (channel = 'whatsapp'),
  phone_e164 TEXT NOT NULL CHECK (phone_e164 ~ '^\+[0-9]{8,15}$'),
  body TEXT NOT NULL,
  preview_hash VARCHAR(64) NOT NULL CHECK (preview_hash ~ '^[0-9a-f]{64}$'),
  provider_message_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('previewed', 'queued', 'sent', 'failed')),
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  error_code TEXT,
  CONSTRAINT contractor_messages_sent_guard
    CHECK (status NOT IN ('queued', 'sent') OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))
);
