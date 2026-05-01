-- Migration: 20260501113000_babies
-- PR #3 feature/baby-profile
--
-- Tabel babies + RLS pakai direct EXISTS (NOT SECURITY DEFINER helpers,
-- lihat docs/auth.md §SECURITY DEFINER + RLS policy = SEGV).

BEGIN;

CREATE TABLE public.babies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name            text NOT NULL,
  gender          text NOT NULL CHECK (gender IN ('female','male')),
  dob             date NOT NULL,
  birth_weight_kg numeric(4,2) NOT NULL CHECK (birth_weight_kg > 0),
  birth_height_cm numeric(4,1) NOT NULL CHECK (birth_height_cm > 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX babies_household_idx ON public.babies(household_id);

CREATE TRIGGER set_updated_at_babies
  BEFORE UPDATE ON public.babies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.babies ENABLE ROW LEVEL SECURITY;

-- RLS: visible/editable by household members; owner-only delete.
CREATE POLICY babies_select_member ON public.babies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = babies.household_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY babies_insert_member ON public.babies
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = babies.household_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY babies_update_member ON public.babies
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = babies.household_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY babies_delete_owner ON public.babies
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = babies.household_id
        AND hm.user_id = auth.uid()
        AND hm.role = 'owner'
    )
  );

COMMIT;
