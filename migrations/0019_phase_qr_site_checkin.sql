-- Phase QR-7 — QR Attendance System SAFE ADDITIVE production migration.
--
-- Additive only: creates only if missing; adds only missing columns and
-- constraints. No existing table, column, or row is ever removed or altered.
-- Phase 3F finance/payroll tables (workers, suppliers, payees, agencies, etc.)
-- are NOT recreated here — they are handled by their own separate migration.
-- All foreign keys on those tables are therefore conditional and fail-safe:
-- they are added only when the referenced table AND the referenced column exist.

-- 1. site_checkin_config: per-job/site check-in policy + secure token
CREATE TABLE IF NOT EXISTS site_checkin_config (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR,
  site_name TEXT,
  site_latitude TEXT,
  site_longitude TEXT,
  allowed_radius_metres INTEGER NOT NULL DEFAULT 100,
  qr_enabled BOOLEAN NOT NULL DEFAULT true,
  gps_enabled BOOLEAN NOT NULL DEFAULT true,
  qr_token_hash VARCHAR(64) NOT NULL,
  qr_token_expires_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT site_checkin_config_radius_positive CHECK (allowed_radius_metres > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS site_checkin_config_job_unique
  ON site_checkin_config (job_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS site_checkin_config_token_hash_unique
  ON site_checkin_config (qr_token_hash);
--> statement-breakpoint
-- 2. site_checkin_attempt: append-only audit trail for every attempt
CREATE TABLE IF NOT EXISTS site_checkin_attempt (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id VARCHAR,
  contractor_id VARCHAR,
  job_id VARCHAR,
  site_checkin_config_id VARCHAR,
  identity_label TEXT,
  attempt_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  qr_valid BOOLEAN NOT NULL DEFAULT false,
  submitted_latitude TEXT,
  submitted_longitude TEXT,
  gps_accuracy_metres NUMERIC(14, 2),
  calculated_distance_metres NUMERIC(14, 2),
  permitted_radius_metres INTEGER,
  gps_valid BOOLEAN NOT NULL DEFAULT false,
  accepted BOOLEAN NOT NULL DEFAULT false,
  rejection_reason TEXT,
  work_session_id VARCHAR,
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
      'UNAUTHORISED_WORKER',
      'NO_ACTIVE_SESSION'
    )
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_site_checkin_attempt_job
  ON site_checkin_attempt (job_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_site_checkin_attempt_worker
  ON site_checkin_attempt (worker_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_site_checkin_attempt_time
  ON site_checkin_attempt (attempt_time);
--> statement-breakpoint
-- 3. work_sessions: additive QR columns (nullable, backwards compatible)
ALTER TABLE work_sessions
  ADD COLUMN IF NOT EXISTS job_id VARCHAR;
--> statement-breakpoint
ALTER TABLE work_sessions
  ADD COLUMN IF NOT EXISTS worker_id VARCHAR;
--> statement-breakpoint
ALTER TABLE work_sessions
  ADD COLUMN IF NOT EXISTS contractor_id VARCHAR;
--> statement-breakpoint
ALTER TABLE work_sessions
  ADD COLUMN IF NOT EXISTS supplier_id VARCHAR;
--> statement-breakpoint
ALTER TABLE work_sessions
  ADD COLUMN IF NOT EXISTS payee_id VARCHAR;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_work_sessions_job_id
  ON work_sessions (job_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_work_sessions_worker_id
  ON work_sessions (worker_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_work_sessions_contractor_id
  ON work_sessions (contractor_id);
--> statement-breakpoint
-- 4. Foreign keys — all conditional and fail-safe.
-- site_checkin_config.job_id -> jobs(id): jobs always exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_checkin_config_job_id_jobs_id_fk'
  ) THEN
    ALTER TABLE site_checkin_config
      ADD CONSTRAINT site_checkin_config_job_id_jobs_id_fk
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE RESTRICT;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('workers') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_checkin_attempt_worker_id_workers_id_fk'
  ) THEN
    ALTER TABLE site_checkin_attempt
      ADD CONSTRAINT site_checkin_attempt_worker_id_workers_id_fk
      FOREIGN KEY (worker_id) REFERENCES workers(id);
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('contractors') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_checkin_attempt_contractor_id_contractors_id_fk'
  ) THEN
    ALTER TABLE site_checkin_attempt
      ADD CONSTRAINT site_checkin_attempt_contractor_id_contractors_id_fk
      FOREIGN KEY (contractor_id) REFERENCES contractors(id);
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('jobs') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_checkin_attempt_job_id_jobs_id_fk'
  ) THEN
    ALTER TABLE site_checkin_attempt
      ADD CONSTRAINT site_checkin_attempt_job_id_jobs_id_fk
      FOREIGN KEY (job_id) REFERENCES jobs(id);
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('site_checkin_config') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_checkin_attempt_site_checkin_config_id_site_checkin_config_fk'
  ) THEN
    ALTER TABLE site_checkin_attempt
      ADD CONSTRAINT site_checkin_attempt_site_checkin_config_id_site_checkin_config_fk
      FOREIGN KEY (site_checkin_config_id) REFERENCES site_checkin_config(id);
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('work_sessions') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_checkin_attempt_work_session_id_work_sessions_fk'
  ) THEN
    ALTER TABLE site_checkin_attempt
      ADD CONSTRAINT site_checkin_attempt_work_session_id_work_sessions_fk
      FOREIGN KEY (work_session_id) REFERENCES work_sessions(id);
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('jobs') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a  ON a.attrelid = c.conrelid  AND a.attnum  = c.conkey[1]
    JOIN pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attnum = c.confkey[1]
    WHERE c.contype = 'f'
      AND c.conrelid = 'work_sessions'::regclass
      AND a.attname  = 'job_id'
      AND c.confrelid = 'jobs'::regclass
      AND fa.attname = 'id'
  ) THEN
    ALTER TABLE work_sessions
      ADD CONSTRAINT work_sessions_job_id_jobs_id_fk
      FOREIGN KEY (job_id) REFERENCES jobs(id);
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('workers') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a  ON a.attrelid = c.conrelid  AND a.attnum  = c.conkey[1]
    JOIN pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attnum = c.confkey[1]
    WHERE c.contype = 'f'
      AND c.conrelid = 'work_sessions'::regclass
      AND a.attname  = 'worker_id'
      AND c.confrelid = 'workers'::regclass
      AND fa.attname = 'id'
  ) THEN
    ALTER TABLE work_sessions
      ADD CONSTRAINT work_sessions_worker_id_workers_id_fk
      FOREIGN KEY (worker_id) REFERENCES workers(id);
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('contractors') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a  ON a.attrelid = c.conrelid  AND a.attnum  = c.conkey[1]
    JOIN pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attnum = c.confkey[1]
    WHERE c.contype = 'f'
      AND c.conrelid = 'work_sessions'::regclass
      AND a.attname  = 'contractor_id'
      AND c.confrelid = 'contractors'::regclass
      AND fa.attname = 'id'
  ) THEN
    ALTER TABLE work_sessions
      ADD CONSTRAINT work_sessions_contractor_id_contractors_id_fk
      FOREIGN KEY (contractor_id) REFERENCES contractors(id);
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('suppliers') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a  ON a.attrelid = c.conrelid  AND a.attnum  = c.conkey[1]
    JOIN pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attnum = c.confkey[1]
    WHERE c.contype = 'f'
      AND c.conrelid = 'work_sessions'::regclass
      AND a.attname  = 'supplier_id'
      AND c.confrelid = 'suppliers'::regclass
      AND fa.attname = 'id'
  ) THEN
    ALTER TABLE work_sessions
      ADD CONSTRAINT work_sessions_supplier_id_suppliers_id_fk
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('payees') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a  ON a.attrelid = c.conrelid  AND a.attnum  = c.conkey[1]
    JOIN pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attnum = c.confkey[1]
    WHERE c.contype = 'f'
      AND c.conrelid = 'work_sessions'::regclass
      AND a.attname  = 'payee_id'
      AND c.confrelid = 'payees'::regclass
      AND fa.attname = 'id'
  ) THEN
    ALTER TABLE work_sessions
      ADD CONSTRAINT work_sessions_payee_id_payees_id_fk
      FOREIGN KEY (payee_id) REFERENCES payees(id);
  END IF;
END $$;