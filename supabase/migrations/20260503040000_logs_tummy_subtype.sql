-- Migration: 20260503040000_logs_tummy_subtype
-- Add 'tummy' (tummy time) subtype. Stopwatch-only — no metadata,
-- just timestamp + end_timestamp. Tummy time = bayi tengkurap
-- supervised, important for motor development (kepala lift,
-- shoulder strength). Newborn 0-3mo: 3-5 mnt × beberapa sesi/hari;
-- older: 10-30 mnt/sesi (AAP/IDAI).

BEGIN;

ALTER TABLE public.logs DROP CONSTRAINT IF EXISTS logs_subtype_check;
ALTER TABLE public.logs
  ADD CONSTRAINT logs_subtype_check
  CHECK (subtype IN (
    'feeding','pumping','diaper','sleep','bath','temp','med','hiccup','tummy'
  ));

COMMIT;
