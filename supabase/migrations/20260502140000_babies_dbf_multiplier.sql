-- Migration: 20260502140000_babies_dbf_multiplier
-- Add a 2nd DBF estimation mode: multiplier of the auto-derived
-- pumping rate. Use case: baby may be more or less efficient than the
-- electric pump (lactation studies show baby ranges from 0.7x to 1.3x
-- of typical pump output). When set, dbf_pumping_multiplier overrides
-- both pumping-only and dbf_ml_per_min.
--
-- Mode resolution order (highest priority first):
--   1. multiplier × pumping rate (when both set)
--   2. fixed ml/min (dbf_ml_per_min)
--   3. auto pumping rate
--   4. literature default 4 ml/min

BEGIN;

ALTER TABLE public.babies
  ADD COLUMN dbf_pumping_multiplier numeric;

ALTER TABLE public.babies
  ADD CONSTRAINT babies_dbf_multiplier_chk
  CHECK (
    dbf_pumping_multiplier IS NULL
    OR (dbf_pumping_multiplier > 0 AND dbf_pumping_multiplier <= 5)
  );

COMMIT;
