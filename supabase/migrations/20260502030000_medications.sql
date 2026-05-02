-- Migration: 20260502030000_medications
-- Per-household library of meds/supplements for the LogModal "med"
-- subtype dropdown. Each entry has a name, default dose value, and unit
-- (ml/drop/gr/tab/sachet). User picks an entry → form prefills med_name +
-- "default_dose unit" string into the existing logs.med_name / med_dose
-- columns. The medications table is just a reusable catalogue; logs stay
-- denormalized strings so historical entries survive list edits.

BEGIN;

CREATE TABLE public.medications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name         text NOT NULL,
  default_dose text,
  unit         text NOT NULL CHECK (unit IN ('ml','drop','gr','tab','sachet')),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, name)
);

CREATE INDEX medications_household_idx ON public.medications(household_id);

ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY medications_select_member ON public.medications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = medications.household_id
        AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY medications_insert_member ON public.medications
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = medications.household_id
        AND hm.user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

CREATE POLICY medications_delete_member ON public.medications
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = medications.household_id
        AND hm.user_id = auth.uid()
    )
  );

-- Seed Vitamin D for all existing households (created_by NULL = system seed)
INSERT INTO public.medications (household_id, name, default_dose, unit, created_by)
SELECT id, 'Vitamin D', '1', 'drop', NULL FROM public.households
ON CONFLICT (household_id, name) DO NOTHING;

COMMIT;
