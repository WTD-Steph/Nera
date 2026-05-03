-- Migration: 20260503050000_logs_bath_checklist
-- Optional checklist for bath logs:
-- - bath_pijat_ilu        : pijat I-L-U (gentle abdominal massage for
--                           digestion / kentut release)
-- - bath_clean_tali_pusat : umbilical cord cleaning ritual (relevant
--                           sampai puput tali pusat ~7-21 hari)
-- Both default false, user-toggleable di Catat Mandi modal.

BEGIN;

ALTER TABLE public.logs
  ADD COLUMN bath_pijat_ilu boolean,
  ADD COLUMN bath_clean_tali_pusat boolean;

COMMIT;
