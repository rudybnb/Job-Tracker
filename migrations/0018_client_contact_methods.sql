-- Minimum reusable client contact methods for source-of-truth identity resolution.
-- This migration is intentionally not applied by this change.
CREATE TABLE IF NOT EXISTS client_contact_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  contact_name TEXT,
  method_type TEXT NOT NULL,
  value_normalized TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  verified_at TIMESTAMPTZ,
  verified_by TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  source TEXT,
  evidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_contact_methods_type_check CHECK (method_type IN ('PHONE', 'WHATSAPP')),
  CONSTRAINT client_contact_methods_verification_check CHECK (verification_status IN ('UNVERIFIED', 'VERIFIED')),
  CONSTRAINT client_contact_methods_e164_check CHECK (value_normalized ~ '^\+[0-9]{8,15}$'),
  CONSTRAINT client_contact_methods_verified_guard CHECK (
    verification_status <> 'VERIFIED'
    OR (verified_at IS NOT NULL AND NULLIF(BTRIM(verified_by), '') IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_client_contact_methods_client
  ON client_contact_methods (client_id);

CREATE INDEX IF NOT EXISTS idx_client_contact_methods_lookup
  ON client_contact_methods (method_type, value_normalized, is_active, verification_status);
