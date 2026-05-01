-- Migration: 20260501140000_growth_measurements
-- PR #6 brief feature/growth
-- Tabel growth_measurements untuk tracking BB/PB/LK over time + WHO percentile chart.
-- RLS direct EXISTS (no SECURITY DEFINER, sesuai pelajaran PR #2b).
-- Realtime enabled supaya dua user di household sama lihat update otomatis.

BEGIN;

CREATE TABLE public.growth_measurements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id       uuid NOT NULL REFERENCES public.babies(id) ON DELETE CASCADE,
  measured_at   timestamptz NOT NULL,
  weight_kg     numeric(4,2) NOT NULL CHECK (weight_kg > 0),
  height_cm     numeric(4,1) NOT NULL CHECK (height_cm > 0),
  head_circ_cm  numeric(4,1) CHECK (head_circ_cm IS NULL OR head_circ_cm > 0),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX growth_baby_ts_idx ON public.growth_measurements(baby_id, measured_at DESC);

CREATE TRIGGER set_updated_at_growth
  BEFORE UPDATE ON public.growth_measurements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.growth_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY growth_select_member ON public.growth_measurements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = growth_measurements.baby_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY growth_insert_member ON public.growth_measurements
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = growth_measurements.baby_id AND hm.user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

CREATE POLICY growth_update_member ON public.growth_measurements
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = growth_measurements.baby_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY growth_delete_self_or_owner ON public.growth_measurements
  FOR DELETE USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = growth_measurements.baby_id
        AND hm.user_id = auth.uid()
        AND hm.role = 'owner'
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.growth_measurements;

COMMIT;
