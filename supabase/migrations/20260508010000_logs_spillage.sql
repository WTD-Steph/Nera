-- Migration: 20260508010000_logs_spillage
-- Spillage tracking for feeding rows.
--
-- Real-life kasus: caregiver siapin botol/cup 60ml ASI, tapi bayi
-- minum cuma 50ml karena 10ml tumpah / kena kain / sisa di cup yang
-- ngga termimum. Stock ASI harus tetap nge-deduct 60ml (yang keluar
-- dari freezer), tapi intake bayi cuma 50ml.
--
-- Schema:
--   amount_spilled_ml — total ml tumpah (di luar amount_ml yang
--     diminum). Stock ASI deduct sebesar amount_asi_ml + portion
--     spilled yang diatribusi ke ASI.
--   spilled_attribution — untuk content='mix', user pilih tumpahnya
--     dari sisi mana: 'asi' | 'sufor' | 'proporsional'. Untuk content
--     'asi' / 'sufor' single, kolom ini abaikan (semua tumpah pasti
--     dari content yang sama).
--
-- Tidak modify amount_ml: tetap = ml yang sampai ke bayi.

BEGIN;

ALTER TABLE public.logs
  ADD COLUMN amount_spilled_ml int,
  ADD COLUMN spilled_attribution text;

ALTER TABLE public.logs
  ADD CONSTRAINT logs_spilled_ml_chk CHECK (
    amount_spilled_ml IS NULL OR amount_spilled_ml >= 0
  ),
  ADD CONSTRAINT logs_spilled_attribution_chk CHECK (
    spilled_attribution IS NULL
    OR spilled_attribution IN ('asi', 'sufor', 'proporsional')
  );

COMMIT;
