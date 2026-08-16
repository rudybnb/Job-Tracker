-- Phase QR-1 — Site QR + GPS Check-In Foundation (DESIGN SOURCE)
-- Status: additive-only. Contains zero DROP/TRUNCATE/DELETE/UPDATE/ALTER COLUMN TYPE.
-- NOT applied to any database. Dormant design file living outside migrations/
-- so the canonical migration loader never picks it up.
--
-- Business rules honoured:
--   1. A check-in is VALID only when BOTH QR resolves to the site AND the worker's
--      phone GPS is within the configured site radius.
--   2. The backend makes the final decision; client "GPS passed" flags are ignored.
--   3. Rejected attempts are audited and must NEVER become verified attendance.
--   4. Only an accepted QR+GPS check-in may create/link a work session.
--   5. The QR encodes only a secure random server-side token (never job/worker IDs,
--      coordinates, or predictable values). Tokens are stored hashed (SHA-256).
--   6. Radius, QR toggle and GPS toggle are per-site and editable by admins only.
-- No labour/payroll, CIS, settlement, client receivable, supplier or WhatsApp
-- behaviour is changed or created here.

-- 1. site_checkin_config: per-job/site check-in policy + secure token
CREATE TABLE IF NOT EXISTS site_checkin_config (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  site_name TEXT,
  site_latitude TEXT NOT NULL,
  site_longitude TEXT NOT NULL,
  allowed_radius_metres INTEGER NOT NULL DEFAULT 100,
  qr_enabled BOOLEAN NOT NULL DEFAULT true,
  gps_enabled BOOLEAN NOT NULL DEFAULT true,
  qr_token_hash VARCHAR(64) NOT NULL,
  qr_token_expires_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT site_checkin_config_radius_positive CHECK (allowed_radius_metres > 0),
  CONSTRAINT site_checkin_config_lat_range CHECK (
    site_latitude ~ '^-?([0-9]|[0-8][0-9]|90)(\.[0-9]+)?$'
  ),
  CONSTRAINT site_checkin_config_lng_range CHECK (
    site_longitude ~ '^-?([0-9]|[0-9]{1,2}|1[0-7][0-9]|180)(\.[0-9]+)?$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS site_checkin_config_job_unique
  ON site_checkin_config (job_id);

CREATE UNIQUE INDEX IF NOT EXISTS site_checkin_config_token_hash_unique
  ON site_checkin_config (qr_token_hash);

-- 2. site_checkin_attempt: append-only audit trail for every attempt
CREATE TABLE IF NOT EXISTS site_checkin_attempt (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id VARCHAR REFERENCES workers(id),
  contractor_id VARCHAR REFERENCES contractors(id),
  job_id VARCHAR REFERENCES jobs(id),
  site_checkin_config_id VARCHAR REFERENCES site_checkin_config(id),
  identity_label TEXT,
  attempt_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  qr_valid BOOLEAN NOT NULL,
  submitted_latitude TEXT,
  submitted_longitude TEXT,
  gps_accuracy_metres NUMERIC(14, 2),
  calculated_distance_metres NUMERIC(14, 2),
  permitted_radius_metres INTEGER,
  gps_valid BOOLEAN NOT NULL,
  accepted BOOLEAN NOT NULL,
  rejection_reason TEXT,
  work_session_id VARCHAR REFERENCES work_sessions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT site_checkin_attempt_reason_check CHECK (
    rejection_reason IS NULL
    OR rejection_reason IN (
      'WRONG_QR',
      'SITE_NOT_FOUND',
      'SITE_CHECKIN_DISABLED',
      'GPS_UNAVAILABLE',
      'INVALID_COORDINATES',
      'GPS_ACCURACY_UNACCEPTABLE',
      'GPS_OUTSIDE_RADIUS',
      'UNAUTHORISED_WORKER'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_site_checkin_attempt_job
  ON site_checkin_attempt (job_id);

CREATE INDEX IF NOT EXISTS idx_site_checkin_attempt_worker
  ON site_checkin_attempt (worker_id);

CREATE INDEX IF NOT EXISTS idx_site_checkin_attempt_time
  ON site_checkin_attempt (attempt_time);
