-- Phase 3E-B — Rollback SQL (NOT EXECUTED)
-- Drops the four Phase 3E-B tables and the jobs.client_id column introduced on 2026-08-14.
-- Only safe if no post-execution feature has written to these tables/column.
-- If jobs.client_id has been populated or referenced, this rollback is NOT safe — restore from dump instead.

ALTER TABLE jobs DROP COLUMN IF EXISTS client_id;

DROP TABLE IF EXISTS financial_opening_position;
DROP TABLE IF EXISTS financial_opening_balance_set;
DROP TABLE IF EXISTS legacy_identity_crosswalk;
DROP TABLE IF EXISTS clients;
