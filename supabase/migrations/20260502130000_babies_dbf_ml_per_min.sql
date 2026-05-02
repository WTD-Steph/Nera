-- Migration: 20260502130000_babies_dbf_ml_per_min
-- Per-baby override for the DBF ml/min rate used to estimate milk
-- intake from direct breastfeeding sessions. NULL = derive
-- automatically (most recent meaningful pumping → fallback to
-- literature default 4 ml/min).
--
-- Why per-baby instead of per-household: rate depends on baby's
-- suckling efficiency + mom's letdown for that pair, which changes
-- between siblings.

BEGIN;

ALTER TABLE public.babies
  ADD COLUMN dbf_ml_per_min numeric;

ALTER TABLE public.babies
  ADD CONSTRAINT babies_dbf_ml_per_min_chk
  CHECK (dbf_ml_per_min IS NULL OR (dbf_ml_per_min > 0 AND dbf_ml_per_min <= 30));

COMMIT;
