-- Migration: 20260501120000_logs
-- PR #4 feature/logs (brief PR #4)
--
-- Logs table dengan partial CHECK per subtype + temp range CHECK.
-- RLS direct EXISTS via babies → household_members (no SECURITY DEFINER, sesuai pelajaran PR #2b).

BEGIN;

CREATE TABLE public.logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id         uuid NOT NULL REFERENCES public.babies(id) ON DELETE CASCADE,
  subtype         text NOT NULL CHECK (subtype IN (
                    'sufor','dbf','pumping','pipis','poop',
                    'sleep','bath','temp','med'
                  )),
  timestamp       timestamptz NOT NULL,
  end_timestamp   timestamptz,
  amount_ml       numeric(6,1),
  amount_l_ml     numeric(6,1),
  amount_r_ml     numeric(6,1),
  duration_l_min  int,
  duration_r_min  int,
  poop_color      text,
  poop_consistency text,
  temp_celsius    numeric(4,2),
  med_name        text,
  med_dose        text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT logs_sufor_chk        CHECK (subtype <> 'sufor'   OR amount_ml IS NOT NULL),
  CONSTRAINT logs_dbf_chk          CHECK (subtype <> 'dbf'     OR (duration_l_min IS NOT NULL OR duration_r_min IS NOT NULL)),
  CONSTRAINT logs_pumping_chk      CHECK (subtype <> 'pumping' OR (amount_l_ml IS NOT NULL OR amount_r_ml IS NOT NULL)),
  CONSTRAINT logs_temp_chk         CHECK (subtype <> 'temp'    OR temp_celsius IS NOT NULL),
  CONSTRAINT logs_temp_range_chk   CHECK (temp_celsius IS NULL OR (temp_celsius BETWEEN 30 AND 45)),
  CONSTRAINT logs_med_chk          CHECK (subtype <> 'med'     OR med_name IS NOT NULL),
  CONSTRAINT logs_sleep_end_chk    CHECK (end_timestamp IS NULL OR end_timestamp >= timestamp)
);

CREATE INDEX logs_baby_ts_idx         ON public.logs(baby_id, timestamp DESC);
CREATE INDEX logs_baby_subtype_ts_idx ON public.logs(baby_id, subtype, timestamp DESC);

CREATE TRIGGER set_updated_at_logs
  BEFORE UPDATE ON public.logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

-- RLS: visible/CRUD oleh member household yang own baby
CREATE POLICY logs_select_member ON public.logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = logs.baby_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY logs_insert_member ON public.logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = logs.baby_id AND hm.user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

CREATE POLICY logs_update_member ON public.logs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = logs.baby_id AND hm.user_id = auth.uid()
    )
  );

-- DELETE: created_by self OR owner of household
CREATE POLICY logs_delete_self_or_owner ON public.logs
  FOR DELETE USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = logs.baby_id AND hm.user_id = auth.uid() AND hm.role = 'owner'
    )
  );

COMMIT;
