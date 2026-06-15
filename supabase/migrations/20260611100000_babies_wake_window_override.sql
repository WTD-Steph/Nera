-- Migration: 20260611100000_babies_wake_window_override
-- Wake window override per-baby. Default = NULL → fallback ke age-bucket
-- di lib/constants/wake-window.ts. Saat ada override, getWakeWindow pakai
-- (min_min, max_min) ini. Update via /more/profile.

ALTER TABLE public.babies
  ADD COLUMN wake_window_min_min int,
  ADD COLUMN wake_window_max_min int,
  ADD CONSTRAINT babies_wake_window_chk CHECK (
    (wake_window_min_min IS NULL AND wake_window_max_min IS NULL)
    OR (
      wake_window_min_min IS NOT NULL
      AND wake_window_max_min IS NOT NULL
      AND wake_window_min_min > 0
      AND wake_window_min_min <= wake_window_max_min
      AND wake_window_max_min <= 600
    )
  );
