-- Migration: 20260503030000_logs_dbf_rate_override
-- Per-row DBF rate override (ml/menit). Takes precedence over the
-- baby-level setting (multiplier × pumping rate / fixed) when set.
-- NULL = use baby-level computation.
--
-- Use case: user wants to record actual ml differently for specific
-- sessions — e.g. one feed was very productive (5 ml/min) vs another
-- that was comfort-only (1 ml/min). Per-row override gives precision
-- without messing with the global default.

BEGIN;

ALTER TABLE public.logs
  ADD COLUMN dbf_rate_override numeric;

ALTER TABLE public.logs
  ADD CONSTRAINT logs_dbf_rate_override_chk
  CHECK (
    dbf_rate_override IS NULL
    OR (dbf_rate_override > 0 AND dbf_rate_override <= 30)
  );

COMMIT;
