-- Migration: 20260502100000_logs_started_with_stopwatch
--
-- "Berlangsung" badge in Aktivitas Terbaru should only appear for
-- sessions started via Mulai Sekarang (stopwatch flow), not for manual
-- Catat entries that happen to leave end_timestamp NULL. New flag
-- explicitly distinguishes the two.
--
-- Backfill heuristic: existing rows with per-side start_X_at are from
-- the Mulai flow (only Mulai set those fields). Sleep rows with end_
-- NULL get the flag too — sleep had no per-side fields, but historic
-- ongoing-style sleeps were only reachable via Mulai. Manual sleeps
-- with end NULL are unusual but still preserved as ongoing-shaped data.
--
-- Cleanup: 3 stuck manual feeding entries (start_l/r_at NULL +
-- end_timestamp NULL) → end_timestamp = timestamp. These were point-
-- in-time logs (Catat Cepat → Feeding manual entry); end_timestamp was
-- never meaningful for them but its NULL was triggering the
-- "berlangsung" highlight per the previous logic.

BEGIN;

ALTER TABLE public.logs
  ADD COLUMN started_with_stopwatch boolean NOT NULL DEFAULT false;

-- Backfill: per-side start = stopwatch flow
UPDATE public.logs
SET started_with_stopwatch = true
WHERE start_l_at IS NOT NULL OR start_r_at IS NOT NULL;

-- Backfill: sleep rows with end NULL → treat as stopwatch
UPDATE public.logs
SET started_with_stopwatch = true
WHERE subtype = 'sleep' AND end_timestamp IS NULL;

-- Cleanup stuck manual feeding entries
UPDATE public.logs
SET end_timestamp = timestamp
WHERE subtype = 'feeding'
  AND end_timestamp IS NULL
  AND start_l_at IS NULL
  AND start_r_at IS NULL;

COMMIT;
