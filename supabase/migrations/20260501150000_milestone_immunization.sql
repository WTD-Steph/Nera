-- Migration: 20260501150000_milestone_immunization
-- PR #7 brief feature/milestone-imunisasi
-- Tabel progress untuk KPSP/IDAI milestone + IDAI imunisasi schedule.
-- RLS direct EXISTS via babies → household_members.

BEGIN;

CREATE TABLE public.milestone_progress (
  baby_id       uuid NOT NULL REFERENCES public.babies(id) ON DELETE CASCADE,
  milestone_key text NOT NULL,
  achieved_at   timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (baby_id, milestone_key)
);
CREATE INDEX milestone_progress_baby_idx ON public.milestone_progress(baby_id);

CREATE TABLE public.immunization_progress (
  baby_id     uuid NOT NULL REFERENCES public.babies(id) ON DELETE CASCADE,
  vaccine_key text NOT NULL,
  given_at    date NOT NULL,
  facility    text,
  notes       text,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (baby_id, vaccine_key)
);
CREATE INDEX immunization_progress_baby_idx ON public.immunization_progress(baby_id);

ALTER TABLE public.milestone_progress     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.immunization_progress  ENABLE ROW LEVEL SECURITY;

-- milestone_progress: any household member can CRUD
CREATE POLICY milestone_select_member ON public.milestone_progress
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = milestone_progress.baby_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY milestone_insert_member ON public.milestone_progress
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = milestone_progress.baby_id AND hm.user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

CREATE POLICY milestone_delete_member ON public.milestone_progress
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = milestone_progress.baby_id AND hm.user_id = auth.uid()
    )
  );

-- immunization_progress: same
CREATE POLICY immunization_select_member ON public.immunization_progress
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = immunization_progress.baby_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY immunization_insert_member ON public.immunization_progress
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = immunization_progress.baby_id AND hm.user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

CREATE POLICY immunization_update_member ON public.immunization_progress
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = immunization_progress.baby_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY immunization_delete_member ON public.immunization_progress
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = immunization_progress.baby_id AND hm.user_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.milestone_progress;
ALTER PUBLICATION supabase_realtime ADD TABLE public.immunization_progress;

COMMIT;
