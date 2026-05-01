-- Migration: 20260501123000_realtime_logs
-- PR #5 feature/realtime-foundation (brief PR #5)
--
-- Enable Supabase realtime publication untuk public.logs.
-- Client subscribe via channel "logs:{baby_id}" akan dapat INSERT/UPDATE/DELETE
-- events untuk row yang RLS allows (household member of baby).
--
-- RLS pada logs sudah ensure visibility per household; realtime respects RLS.

ALTER PUBLICATION supabase_realtime ADD TABLE public.logs;
