-- Phase 3O — Monzo OAuth Connection Foundation
-- Status: additive-only. Contains zero DROP/TRUNCATE/DELETE/ALTER COLUMN TYPE.
-- Apply to live only after snapshot, restore-test, and scratch rehearsal.
--
-- Stores encrypted reusable Monzo OAuth tokens only. Never plaintext tokens.
-- Read-only banking: no payment, transfer, standing order, transaction mutation,
-- VAT activation or CIS submission capability is created here.

CREATE TABLE IF NOT EXISTS bank_provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'MONZO',
  status TEXT NOT NULL DEFAULT 'PENDING_AUTH',
  provider_user_id TEXT,
  provider_client_id_hash VARCHAR(64),
  selected_provider_account_id TEXT,
  encrypted_token_payload TEXT,
  token_key_version TEXT,
  token_expires_at TIMESTAMPTZ,
  authorized_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bank_provider_connections_provider_check CHECK (provider IN ('MONZO')),
  CONSTRAINT bank_provider_connections_status_check CHECK (status IN ('PENDING_AUTH', 'CONNECTED', 'DISCONNECTED', 'REAUTH_REQUIRED')),
  CONSTRAINT bank_provider_connections_hash_check CHECK (provider_client_id_hash IS NULL OR provider_client_id_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT bank_provider_connections_connected_token_guard CHECK (status <> 'CONNECTED' OR (encrypted_token_payload IS NOT NULL AND token_expires_at IS NOT NULL AND authorized_at IS NOT NULL)),
  CONSTRAINT bank_provider_connections_disconnect_guard CHECK (status <> 'DISCONNECTED' OR disconnected_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS bank_provider_connections_single_connected
  ON bank_provider_connections (provider)
  WHERE status = 'CONNECTED';

CREATE INDEX IF NOT EXISTS idx_bank_provider_connections_provider_status
  ON bank_provider_connections (provider, status);
