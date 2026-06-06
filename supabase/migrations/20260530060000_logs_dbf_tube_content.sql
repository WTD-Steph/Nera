-- Migration: 20260530060000_logs_dbf_tube_content
-- DBF + tube feeder (SNS = Supplemental Nursing System): tube taped near
-- nipple supaya baby dapat tambahan susu sambil tetap latch ke breast.
-- Content bisa ASIP (expressed breast milk) atau Sufor (formula).
--
-- v1: track tube_content saja (asi/sufor/NULL). Stock ASI deduction +
-- ml tracking defer ke v2 (perlu batch picker integration di DbfControls).
-- Untuk now, kalau pakai selang ASI, user manual track ml di notes.

ALTER TABLE public.logs
  ADD COLUMN dbf_tube_content text,
  ADD CONSTRAINT logs_dbf_tube_content_chk CHECK (
    dbf_tube_content IS NULL
    OR dbf_tube_content IN ('asi', 'sufor')
  );

COMMENT ON COLUMN public.logs.dbf_tube_content IS
  'DBF + tube feeder content: asi / sufor / NULL (no tube). Diisi saat user catat DBF dengan SNS aktif.';
