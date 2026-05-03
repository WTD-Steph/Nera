-- Migration: 20260503070000_handovers
-- Shift istirahat handover untuk caregivers (parent + partner) yang ambil
-- shift bergantian malam hari. Salah satu memulai handover saat tidur,
-- partner-nya jadi caregiver aktif. Saat partner bangun (atau partner-nya
-- mengakhiri), handover ditutup → muncul ringkasan "selama kamu tidur".
--
-- Denormalized email columns supaya display di banner tidak perlu join
-- ke auth.users (RLS protect kita anyway).
--
-- Constraint: hanya 1 active handover per household (partial unique index
-- on ended_at IS NULL).

BEGIN;

CREATE TABLE public.handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  started_by uuid NOT NULL REFERENCES auth.users(id),
  started_by_email text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_by uuid REFERENCES auth.users(id),
  ended_by_email text,
  ended_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uniq_handover_active_per_household
  ON public.handovers (household_id)
  WHERE ended_at IS NULL;

CREATE INDEX idx_handovers_household_started
  ON public.handovers (household_id, started_at DESC);

ALTER TABLE public.handovers ENABLE ROW LEVEL SECURITY;

CREATE POLICY handovers_select ON public.handovers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = handovers.household_id
        AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY handovers_insert ON public.handovers
  FOR INSERT WITH CHECK (
    started_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = handovers.household_id
        AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY handovers_update ON public.handovers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = handovers.household_id
        AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY handovers_delete ON public.handovers
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = handovers.household_id
        AND hm.user_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.handovers;

COMMIT;
