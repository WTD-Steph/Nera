-- Migration: 20260502120000_logs_hiccup_subtype
-- Add 'hiccup' (cegukan) subtype. Stopwatch-only — no per-side, no amount,
-- no metadata. Just timestamp + end_timestamp. Used to track how long a
-- bout of hiccups lasts. Existing feeding/pumping/diaper constraints
-- already gate on subtype-equality, so hiccup rows pass through.

BEGIN;

ALTER TABLE public.logs DROP CONSTRAINT IF EXISTS logs_subtype_check;
ALTER TABLE public.logs
  ADD CONSTRAINT logs_subtype_check
  CHECK (subtype IN ('feeding','pumping','diaper','sleep','bath','temp','med','hiccup'));

COMMIT;
