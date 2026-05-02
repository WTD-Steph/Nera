-- Migration: 20260502080000_logs_pumping_per_side
-- Allow recording different start + end times for left and right
-- breast pumps within a single pumping log. Existing timestamp +
-- end_timestamp stay as the overall session window (used by the
-- ongoing card and FIFO ASI batch ordering).
--
-- New columns are all nullable; old rows + ongoing card flows continue
-- to work without populating per-side timestamps.

BEGIN;

ALTER TABLE public.logs
  ADD COLUMN start_l_at timestamptz,
  ADD COLUMN end_l_at   timestamptz,
  ADD COLUMN start_r_at timestamptz,
  ADD COLUMN end_r_at   timestamptz;

ALTER TABLE public.logs
  ADD CONSTRAINT logs_pumping_l_window_chk
    CHECK (end_l_at IS NULL OR start_l_at IS NULL OR end_l_at >= start_l_at),
  ADD CONSTRAINT logs_pumping_r_window_chk
    CHECK (end_r_at IS NULL OR start_r_at IS NULL OR end_r_at >= start_r_at);

COMMIT;
