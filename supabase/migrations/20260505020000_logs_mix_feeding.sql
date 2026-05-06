-- Migration: 20260505020000_logs_mix_feeding
-- Mix feeding: satu sesi botol berisi ASIP + Sufor combined.
--
-- Sebelumnya bottle_content cuma 'asi' OR 'sufor'. Tidak akomodasi
-- real-life: parent prep botol 50ml = 30ml ASIP + 20ml sufor.
--
-- Schema:
--   amount_asi_ml + amount_sufor_ml (nullable, breakdown saat mix)
--   bottle_content extend: 'asi' | 'sufor' | 'mix'
--
-- Validation: jika 'mix', minimal salah satu amount_X_ml > 0. Total =
-- amount_ml. Backwards compat:
--   - bottle_content='asi' → amount_asi_ml = amount_ml (auto via app
--     logic, no DB constraint untuk avoid migration friction)
--   - bottle_content='sufor' → amount_sufor_ml = amount_ml
--   - existing rows tidak di-backfill, dianggap legacy single-content.

BEGIN;

ALTER TABLE public.logs
  ADD COLUMN amount_asi_ml int,
  ADD COLUMN amount_sufor_ml int;

ALTER TABLE public.logs
  ADD CONSTRAINT logs_asi_ml_chk CHECK (
    amount_asi_ml IS NULL OR amount_asi_ml >= 0
  ),
  ADD CONSTRAINT logs_sufor_ml_chk CHECK (
    amount_sufor_ml IS NULL OR amount_sufor_ml >= 0
  );

COMMIT;
