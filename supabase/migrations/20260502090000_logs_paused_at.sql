-- Migration: 20260502090000_logs_paused_at
-- Pause/resume support for ongoing sleep / pumping / DBF sessions.
-- paused_at NULL = running; paused_at SET = currently paused (frozen).
-- When ended-while-paused, end_timestamp = paused_at (excludes pause).
-- Server-side stale-pause sweeper auto-ends sessions paused > 10 min.

BEGIN;

ALTER TABLE public.logs ADD COLUMN paused_at timestamptz;

COMMIT;
