-- Migration: 20260512010000_logs_db_levels
-- Sound level tracking untuk sleep rows.
--
-- White noise digunakan untuk help baby sleep, tapi AAP recommend max
-- 50 dB(A) di telinga bayi. Banyak WN machine bisa >85 dB di volume
-- penuh — potential hearing risk. Untuk monitoring, app capture mic
-- saat sleep ongoing (di NightLamp dark mode) dan simpan avg/max.
--
-- Schema:
--   avg_db_a — average level selama session (rolling)
--   max_db_a — peak level selama session
--
-- Source: Hugh, Hassan, Smith. "Infant Sleep Machines and Hazardous
-- Sound Pressure Levels." Pediatrics. 2014;133(4):677-681.
--
-- CAVEAT: browser mic reading bukan calibrated SPL. Disclaimer di UI.

BEGIN;

ALTER TABLE public.logs
  ADD COLUMN avg_db_a numeric,
  ADD COLUMN max_db_a numeric;

ALTER TABLE public.logs
  ADD CONSTRAINT logs_avg_db_a_chk CHECK (
    avg_db_a IS NULL OR (avg_db_a >= 0 AND avg_db_a <= 140)
  ),
  ADD CONSTRAINT logs_max_db_a_chk CHECK (
    max_db_a IS NULL OR (max_db_a >= 0 AND max_db_a <= 140)
  );

COMMIT;
