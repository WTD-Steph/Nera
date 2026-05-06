-- Migration: 20260506010000_logs_bottle_content_mix
-- Bug fix: PR #115 (mix feeding) tambah amount_asi_ml + amount_sufor_ml
-- columns + extend bottle_content union ke 'mix' di app code, tapi LUPA
-- update DB CHECK constraint. Akibatnya insert dengan bottle_content='mix'
-- gagal di DB level walaupun app validation lolos.
--
-- Fix: drop + recreate constraint to include 'mix'.

BEGIN;

ALTER TABLE public.logs DROP CONSTRAINT IF EXISTS logs_bottle_content_chk;
ALTER TABLE public.logs
  ADD CONSTRAINT logs_bottle_content_chk
  CHECK (
    bottle_content IS NULL
    OR bottle_content IN ('sufor', 'asi', 'mix')
  );

COMMIT;
