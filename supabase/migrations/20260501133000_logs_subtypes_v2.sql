-- Migration: 20260501133000_logs_subtypes_v2
-- UX feedback dari Stephanus pasca-launch:
-- - Pipis + poop satu UI "ganti diaper" dengan flag pee/poop (bisa dua-duanya)
-- - Sufor + DBF satu UI "feeding" — entry punya ml ATAU durasi DBF
-- Pumping tetap subtype terpisah (mom expressing, bukan baby intake langsung).

BEGIN;

-- 1. Tambah kolom flag untuk diaper
ALTER TABLE public.logs ADD COLUMN has_pee  boolean;
ALTER TABLE public.logs ADD COLUMN has_poop boolean;

-- 2. Drop CHECK constraints yang reference subtype lama
ALTER TABLE public.logs DROP CONSTRAINT IF EXISTS logs_subtype_check;
ALTER TABLE public.logs DROP CONSTRAINT IF EXISTS logs_sufor_chk;
ALTER TABLE public.logs DROP CONSTRAINT IF EXISTS logs_dbf_chk;

-- 3. Migrate data
UPDATE public.logs
SET subtype = 'diaper', has_pee = true, has_poop = false
WHERE subtype = 'pipis';

UPDATE public.logs
SET subtype = 'diaper', has_pee = false, has_poop = true
WHERE subtype = 'poop';

UPDATE public.logs
SET subtype = 'feeding'
WHERE subtype IN ('sufor', 'dbf');

-- 4. Re-add CHECK dengan subtypes baru
ALTER TABLE public.logs
  ADD CONSTRAINT logs_subtype_check
  CHECK (subtype IN ('feeding','pumping','diaper','sleep','bath','temp','med'));

-- Feeding harus punya ml (sufor) ATAU durasi DBF (kiri / kanan)
ALTER TABLE public.logs
  ADD CONSTRAINT logs_feeding_chk
  CHECK (
    subtype <> 'feeding'
    OR amount_ml IS NOT NULL
    OR duration_l_min IS NOT NULL
    OR duration_r_min IS NOT NULL
  );

-- Diaper harus punya minimal salah satu flag true
ALTER TABLE public.logs
  ADD CONSTRAINT logs_diaper_chk
  CHECK (
    subtype <> 'diaper'
    OR has_pee = true
    OR has_poop = true
  );

-- Drop NOT NULL untuk has_pee/has_poop di non-diaper (sudah default null)
-- Tidak ada NOT NULL yang perlu dilonggarkan.

COMMIT;
