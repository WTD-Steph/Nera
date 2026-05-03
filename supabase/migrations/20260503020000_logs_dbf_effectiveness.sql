-- Migration: 20260503020000_logs_dbf_effectiveness
-- DBF effectiveness assessment per session, mirrors sleep_quality.
-- Used to scale ml estimate (multiplier × baseRate × effectivenessFactor)
-- and trigger top-up recommendation.
--
-- 3 levels per WHO/LLLI/IBCLC effectiveness markers:
-- - efektif (100%): audible rhythmic swallows, breast soft post-feed,
--   baby releases on own, content + relaxed
-- - sedang (80%): swallowing inconsistent, baby drifts, alternates
--   between active sucking and pausing too long
-- - kurang_efektif (60%): few/no audible swallows, shallow latch,
--   baby still hungry, breast still firm
--
-- Multiplier values are conservative (gentler than research range
-- 100/65/25) to avoid over-alerting. User can manually edit if a
-- session was truly comfort-only (force lower duration).
--
-- Sources:
-- - Hartmann PE, Geddes DT — milk transfer rate measurement
-- - Daly SE et al. (1992) Exp Physiol — short-term milk synthesis
-- - LLLI effectiveness assessment markers
-- - WHO/UNICEF Baby Friendly Hospital Initiative

BEGIN;

ALTER TABLE public.logs
  ADD COLUMN effectiveness text;

ALTER TABLE public.logs
  ADD CONSTRAINT logs_effectiveness_chk
  CHECK (
    effectiveness IS NULL
    OR effectiveness IN ('efektif', 'sedang', 'kurang_efektif')
  );

COMMIT;
