-- Add structured client name storage to operational jobs.
-- Nullable for backward compatibility with existing jobs.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS client_name TEXT;
