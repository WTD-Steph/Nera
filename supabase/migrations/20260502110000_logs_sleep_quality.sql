-- Migration: 20260502110000_logs_sleep_quality
-- Optional sleep quality categorization for sleep logs:
-- - 'nyenyak'        : deep/quiet sleep (peaceful, regular breathing)
-- - 'gelisah'        : restless/active (twitches, fussy, fidgety)
-- - 'sering_bangun'  : fragmented (woke multiple times, hard to settle)
-- NULL = not categorized.

BEGIN;

ALTER TABLE public.logs
  ADD COLUMN sleep_quality text;

ALTER TABLE public.logs
  ADD CONSTRAINT logs_sleep_quality_chk
  CHECK (
    sleep_quality IS NULL
    OR sleep_quality IN ('nyenyak', 'gelisah', 'sering_bangun')
  );

COMMIT;
