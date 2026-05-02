-- Migration: 20260502050000_logs_bottle_content
-- For bottle feeds (subtype=feeding + amount_ml set), distinguish whether
-- the bottle contains formula (sufor) or expressed breast milk (asi).
-- DBF entries (duration_l/r_min) are always ASI by definition → leave null.

BEGIN;

ALTER TABLE public.logs ADD COLUMN bottle_content text;

ALTER TABLE public.logs
  ADD CONSTRAINT logs_bottle_content_chk
  CHECK (bottle_content IS NULL OR bottle_content IN ('sufor', 'asi'));

COMMIT;
