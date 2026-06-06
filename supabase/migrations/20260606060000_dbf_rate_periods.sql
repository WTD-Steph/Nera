-- Migration: 20260606060000_dbf_rate_periods
-- Audit trail of DBF rate changes over time. Forward-only semantic
-- preserved: past DBF rows tetap pakai snapshot di logs.dbf_rate_override
-- yang di-set saat row dibuat. Table ini purely informational + audit
-- supaya user bisa lihat rate evolusi (mis. 1 → 2.5 → 4 ml/min seiring
-- bayi tumbuh).
--
-- Auto-insert period dilakukan di updateBabyAction saat user ubah Profile
-- DBF settings (mode/value). Backfill 1 period per existing baby dengan
-- effective_from = babies.created_at.

CREATE TABLE public.dbf_rate_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id uuid NOT NULL REFERENCES public.babies(id) ON DELETE CASCADE,
  effective_from timestamptz NOT NULL,
  mode text NOT NULL CHECK (mode IN ('fixed', 'multiplier', 'auto')),
  ml_per_min numeric,
  multiplier numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  CONSTRAINT dbf_rate_periods_value_chk CHECK (
    (mode = 'fixed' AND ml_per_min > 0 AND ml_per_min <= 30
       AND multiplier IS NULL)
    OR (mode = 'multiplier' AND multiplier > 0 AND multiplier <= 5
       AND ml_per_min IS NULL)
    OR (mode = 'auto' AND ml_per_min IS NULL AND multiplier IS NULL)
  )
);

CREATE INDEX dbf_rate_periods_baby_eff_idx
  ON public.dbf_rate_periods (baby_id, effective_from DESC);

ALTER TABLE public.dbf_rate_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY dbf_rate_periods_select_member
  ON public.dbf_rate_periods FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = dbf_rate_periods.baby_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY dbf_rate_periods_insert_member
  ON public.dbf_rate_periods FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = dbf_rate_periods.baby_id AND hm.user_id = auth.uid()
    ) AND created_by = auth.uid()
  );

CREATE POLICY dbf_rate_periods_delete_member
  ON public.dbf_rate_periods FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = dbf_rate_periods.baby_id AND hm.user_id = auth.uid()
    )
  );

INSERT INTO public.dbf_rate_periods (baby_id, effective_from, mode, ml_per_min, multiplier, notes, created_by)
SELECT
  b.id,
  b.created_at,
  CASE
    WHEN b.dbf_ml_per_min IS NOT NULL THEN 'fixed'
    WHEN b.dbf_pumping_multiplier IS NOT NULL THEN 'multiplier'
    ELSE 'auto'
  END,
  b.dbf_ml_per_min,
  b.dbf_pumping_multiplier,
  'Initial state (backfilled)',
  (SELECT hm.user_id FROM public.household_members hm
    WHERE hm.household_id = b.household_id AND hm.role = 'owner'
    ORDER BY hm.joined_at ASC LIMIT 1)
FROM public.babies b;
