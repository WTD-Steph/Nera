-- Migration: 20260502020000_logs_ongoing_chk
-- Allow "ongoing" log entries (end_timestamp IS NULL) for pumping + feeding
-- without requiring amount/duration data yet. Data is filled when user
-- taps "Stop" — same row is updated with end_timestamp = now() + amounts.
--
-- Sleep already supports ongoing (no constraint requires data).
-- Other subtypes (diaper, temp, med, bath) remain point-in-time only.

BEGIN;

-- Pumping: ongoing OK without amounts; finalized must have at least one
ALTER TABLE public.logs DROP CONSTRAINT IF EXISTS logs_pumping_chk;
ALTER TABLE public.logs
  ADD CONSTRAINT logs_pumping_chk
  CHECK (
    subtype <> 'pumping'
    OR end_timestamp IS NULL
    OR amount_l_ml IS NOT NULL
    OR amount_r_ml IS NOT NULL
  );

-- Feeding: ongoing OK without data; finalized must have ml or DBF duration
ALTER TABLE public.logs DROP CONSTRAINT IF EXISTS logs_feeding_chk;
ALTER TABLE public.logs
  ADD CONSTRAINT logs_feeding_chk
  CHECK (
    subtype <> 'feeding'
    OR end_timestamp IS NULL
    OR amount_ml IS NOT NULL
    OR duration_l_min IS NOT NULL
    OR duration_r_min IS NOT NULL
  );

COMMIT;
