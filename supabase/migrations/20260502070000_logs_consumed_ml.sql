-- Migration: 20260502070000_logs_consumed_ml
-- ASI stock batching. Each pumping log is treated as a batch — the
-- "produced" amount is amount_l_ml + amount_r_ml. The new consumed_ml
-- column tracks how much of that batch has been fed back to baby via
-- ASI bottle feeds (subtype=feeding, bottle_content=asi). Remaining
-- stock per batch = produced - consumed_ml.
--
-- When a new ASI bottle feed is logged, the action allocates FIFO
-- (oldest batch first) and increments consumed_ml across one or more
-- batches as needed.

BEGIN;

ALTER TABLE public.logs
  ADD COLUMN consumed_ml numeric(6,1) NOT NULL DEFAULT 0;

ALTER TABLE public.logs
  ADD CONSTRAINT logs_consumed_ml_chk
  CHECK (consumed_ml >= 0);

COMMIT;
