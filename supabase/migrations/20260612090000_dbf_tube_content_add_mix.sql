-- Migration: 20260612090000_dbf_tube_content_add_mix
-- Extend dbf_tube_content enum dengan 'mix' supaya bisa track ASIP +
-- Sufor bareng saat tube feeder dengan Mix content. Amounts dicatat
-- di separate bottle feed log yang dibuat oleh endOngoingDbfAction
-- (auto-catat saat user submit dengan ml > 0).

ALTER TABLE public.logs DROP CONSTRAINT IF EXISTS logs_dbf_tube_content_chk;
ALTER TABLE public.logs
  ADD CONSTRAINT logs_dbf_tube_content_chk CHECK (
    dbf_tube_content IS NULL
    OR dbf_tube_content IN ('asi', 'sufor', 'mix')
  );
