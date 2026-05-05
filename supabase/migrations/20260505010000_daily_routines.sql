-- Migration: 20260505010000_daily_routines
-- Daily routines checklist (vitamin D, jemur, dll). User-defined per
-- baby. Two types: simple checklist (just done/not), atau dengan
-- duration_min (jemur ~5-15 menit).
--
-- routines table = definisi (one-time setup di /more/profile)
-- routine_logs table = catatan harian (per-tap entry)
--
-- 'Done today' check = exists routine_log dengan logged_at >= today_start
-- (Jakarta calendar). Uncheck = delete the log row.

BEGIN;

CREATE TABLE public.routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id uuid NOT NULL REFERENCES public.babies(id) ON DELETE CASCADE,
  name text NOT NULL,
  emoji text,
  needs_duration boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT routines_name_chk CHECK (length(name) BETWEEN 1 AND 80),
  CONSTRAINT routines_emoji_chk CHECK (
    emoji IS NULL OR length(emoji) BETWEEN 1 AND 8
  )
);

CREATE INDEX idx_routines_baby ON public.routines (baby_id, display_order);

CREATE TABLE public.routine_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id uuid NOT NULL REFERENCES public.routines(id) ON DELETE CASCADE,
  baby_id uuid NOT NULL REFERENCES public.babies(id) ON DELETE CASCADE,
  logged_at timestamptz NOT NULL DEFAULT now(),
  duration_min int,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT routine_logs_dur_chk CHECK (
    duration_min IS NULL OR (duration_min >= 0 AND duration_min <= 480)
  )
);

CREATE INDEX idx_routine_logs_routine_time
  ON public.routine_logs (routine_id, logged_at DESC);

CREATE INDEX idx_routine_logs_baby_time
  ON public.routine_logs (baby_id, logged_at DESC);

-- RLS
ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY routines_select ON public.routines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = routines.baby_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY routines_insert ON public.routines
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = routines.baby_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY routines_update ON public.routines
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = routines.baby_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY routines_delete ON public.routines
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = routines.baby_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY routine_logs_select ON public.routine_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = routine_logs.baby_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY routine_logs_insert ON public.routine_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = routine_logs.baby_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY routine_logs_update ON public.routine_logs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = routine_logs.baby_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY routine_logs_delete ON public.routine_logs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = routine_logs.baby_id AND hm.user_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.routines;
ALTER PUBLICATION supabase_realtime ADD TABLE public.routine_logs;

COMMIT;
