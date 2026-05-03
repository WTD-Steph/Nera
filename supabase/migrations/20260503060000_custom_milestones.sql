-- Migration: 20260503060000_custom_milestones
-- Ad-hoc / catatan khusus milestone table.
-- Untuk one-off event yang bukan dari KPSP/IDAI list (mis. puput tali pusat,
-- gigi pertama, jatuh, vaksin extra, dll). Setiap entry punya text bebas
-- dan tanggal kejadian.
-- RLS pattern: direct EXISTS subquery via babies → household_members.

BEGIN;

CREATE TABLE public.custom_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id uuid NOT NULL REFERENCES public.babies(id) ON DELETE CASCADE,
  text text NOT NULL,
  achieved_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_milestones_text_chk CHECK (length(text) BETWEEN 1 AND 200)
);

CREATE INDEX idx_custom_milestones_baby_achieved
  ON public.custom_milestones (baby_id, achieved_at DESC);

ALTER TABLE public.custom_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY custom_milestones_select ON public.custom_milestones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = custom_milestones.baby_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY custom_milestones_insert ON public.custom_milestones
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = custom_milestones.baby_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY custom_milestones_update ON public.custom_milestones
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = custom_milestones.baby_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY custom_milestones_delete ON public.custom_milestones
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = custom_milestones.baby_id AND hm.user_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.custom_milestones;

COMMIT;
