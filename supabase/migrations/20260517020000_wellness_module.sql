-- Migration: 20260517020000_wellness_module
-- Maternal & paternal postpartum mental health screening module.
--
-- Privacy model breaks current "household-shared" pattern intentionally:
-- wellness_entries are PER-USER PRIVATE. Cross-user reads go via
-- SECURITY DEFINER RPC respecting wellness_shares.share_level. RLS
-- alone (without RPC) blocks all cross-user access.
--
-- Crisis pathway invariant: Q10 selection >0 commits to crisis flow
-- BEFORE total score computed. Audit trail preserved even if user
-- cancels rest of questionnaire.
--
-- Citations (docstring source):
-- - Cox, Holden, Sagovsky. BJP 1987;150:782-786 (original EPDS)
-- - Kusumadewi, Irawati, Elvira, Wibisono 1998 (Indonesian translation
--   lineage, foundational)
-- - Hutauruk IS 2012. Jurnal Psikologi, Universitas Gunadarma
--   (Indonesian validation, "kuatir" spelling preserved per pre-EYD)
-- - Mughal et al. Heliyon 2022 (paternal EPDS meta-analysis)
-- - Paternal cutoff 10/11 derived: two-points-lower applied to Indonesian
--   maternal 12/13.

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- 1. household_members.perinatal_role
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.household_members
  ADD COLUMN perinatal_role text
    CHECK (perinatal_role IS NULL
           OR perinatal_role IN ('mother', 'father', 'caregiver', 'other'));

-- ────────────────────────────────────────────────────────────────────
-- 2. wellness_entries — per-user PRIVATE
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE public.wellness_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  subject_role text NOT NULL CHECK (subject_role IN ('mother', 'father')),
  entry_type text NOT NULL
    CHECK (entry_type IN ('daily_mood', 'epds', 'gad2', 'phq9')),
  entry_date date NOT NULL,
  responses jsonb NOT NULL,
  total_score int,
  epds_q10_positive boolean,
  crisis_acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wellness_entries_user_date_idx
  ON public.wellness_entries (user_id, entry_date DESC);
CREATE INDEX wellness_entries_household_type_idx
  ON public.wellness_entries (household_id, entry_type, entry_date DESC);

ALTER TABLE public.wellness_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY wellness_entries_select_owner ON public.wellness_entries
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY wellness_entries_insert_owner ON public.wellness_entries
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY wellness_entries_update_owner_24h ON public.wellness_entries
  FOR UPDATE USING (
    user_id = auth.uid()
    AND created_at > now() - interval '24 hours'
  );
CREATE POLICY wellness_entries_delete_owner ON public.wellness_entries
  FOR DELETE USING (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────
-- 3. wellness_shares — granular per-pair share level
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE public.wellness_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_level text NOT NULL DEFAULT 'none'
    CHECK (share_level IN ('none', 'daily_mood_only', 'scores_only', 'full')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_user_id, shared_with_user_id)
);
ALTER TABLE public.wellness_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY wellness_shares_select_involved ON public.wellness_shares
  FOR SELECT USING (
    owner_user_id = auth.uid() OR shared_with_user_id = auth.uid()
  );
CREATE POLICY wellness_shares_manage_owner ON public.wellness_shares
  FOR ALL USING (owner_user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────
-- 4. wellness_alert_preferences — per-user opt-in flags
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE public.wellness_alert_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_partner_on_high_score boolean NOT NULL DEFAULT false,
  alert_partner_on_q10_positive boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wellness_alert_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY wellness_alert_prefs_owner_only ON public.wellness_alert_preferences
  FOR ALL USING (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────
-- 5. wellness_access_log — RPC audit trail
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE public.wellness_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accessor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_level_at_access text NOT NULL,
  fields_returned text NOT NULL,
  accessed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wellness_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY wellness_access_log_select_involved ON public.wellness_access_log
  FOR SELECT USING (
    accessor_user_id = auth.uid() OR target_user_id = auth.uid()
  );

-- ────────────────────────────────────────────────────────────────────
-- 6. wellness_alerts — partner notifications (Q10 / high-score opt-in)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE public.wellness_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_entry_id uuid REFERENCES public.wellness_entries(id) ON DELETE CASCADE,
  alert_kind text NOT NULL CHECK (alert_kind IN ('q10_positive', 'high_score')),
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wellness_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY wellness_alerts_select_involved ON public.wellness_alerts
  FOR SELECT USING (
    source_user_id = auth.uid() OR target_user_id = auth.uid()
  );
CREATE POLICY wellness_alerts_ack_target ON public.wellness_alerts
  FOR UPDATE USING (target_user_id = auth.uid());
CREATE POLICY wellness_alerts_delete_source ON public.wellness_alerts
  FOR DELETE USING (source_user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.wellness_alerts;

-- ────────────────────────────────────────────────────────────────────
-- 7. Trigger: emit wellness_alerts on opt-in + Q10/high-score
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.maybe_emit_wellness_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  partner_id uuid;
  prefs record;
  is_high boolean;
BEGIN
  SELECT user_id INTO partner_id
  FROM household_members
  WHERE household_id = NEW.household_id
    AND user_id <> NEW.user_id
  LIMIT 1;
  IF partner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT alert_partner_on_high_score, alert_partner_on_q10_positive
  INTO prefs
  FROM wellness_alert_preferences
  WHERE user_id = NEW.user_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.epds_q10_positive, false) AND prefs.alert_partner_on_q10_positive THEN
    INSERT INTO wellness_alerts (source_user_id, target_user_id, source_entry_id, alert_kind)
    VALUES (NEW.user_id, partner_id, NEW.id, 'q10_positive');
  END IF;

  is_high := (
    (NEW.subject_role = 'mother' AND COALESCE(NEW.total_score, 0) >= 13) OR
    (NEW.subject_role = 'father' AND COALESCE(NEW.total_score, 0) >= 12)
  );
  IF is_high AND prefs.alert_partner_on_high_score THEN
    INSERT INTO wellness_alerts (source_user_id, target_user_id, source_entry_id, alert_kind)
    VALUES (NEW.user_id, partner_id, NEW.id, 'high_score');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER wellness_entries_alert_trigger
  AFTER INSERT ON public.wellness_entries
  FOR EACH ROW EXECUTE FUNCTION public.maybe_emit_wellness_alert();

-- ────────────────────────────────────────────────────────────────────
-- 8. get_partner_wellness RPC — SECURITY DEFINER cross-user read
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_partner_wellness(
  p_target_user_id uuid
)
RETURNS TABLE (
  entry_id uuid,
  entry_type text,
  entry_date date,
  subject_role text,
  mood int,
  score_band text,
  full_responses jsonb,
  full_total_score int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid uuid := auth.uid();
  effective_level text;
  same_household boolean;
BEGIN
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM household_members hm_caller
    JOIN household_members hm_target
      ON hm_target.household_id = hm_caller.household_id
    WHERE hm_caller.user_id = caller_uid
      AND hm_target.user_id = p_target_user_id
  ) INTO same_household;
  IF NOT same_household THEN
    RAISE EXCEPTION 'Not in same household';
  END IF;

  SELECT share_level INTO effective_level
  FROM wellness_shares
  WHERE owner_user_id = p_target_user_id
    AND shared_with_user_id = caller_uid;
  IF effective_level IS NULL OR effective_level = 'none' THEN
    RETURN;
  END IF;

  INSERT INTO wellness_access_log (
    accessor_user_id, target_user_id, share_level_at_access, fields_returned
  ) VALUES (
    caller_uid, p_target_user_id, effective_level,
    CASE effective_level
      WHEN 'daily_mood_only' THEN 'entry_date,subject_role,mood'
      WHEN 'scores_only' THEN 'entry_date,entry_type,subject_role,score_band'
      WHEN 'full' THEN 'all_except_crisis_ack'
    END
  );

  IF effective_level = 'daily_mood_only' THEN
    RETURN QUERY
    SELECT w.id, w.entry_type, w.entry_date, w.subject_role,
      (w.responses->>'mood')::int,
      NULL::text, NULL::jsonb, NULL::int
    FROM wellness_entries w
    WHERE w.user_id = p_target_user_id
      AND w.entry_type = 'daily_mood'
    ORDER BY w.entry_date DESC
    LIMIT 30;
  ELSIF effective_level = 'scores_only' THEN
    RETURN QUERY
    SELECT w.id, w.entry_type, w.entry_date, w.subject_role,
      NULL::int,
      CASE
        WHEN w.total_score IS NULL THEN NULL
        WHEN w.subject_role = 'mother' AND w.total_score < 10 THEN 'low'
        WHEN w.subject_role = 'mother' AND w.total_score < 13 THEN 'mid'
        WHEN w.subject_role = 'mother' THEN 'high'
        WHEN w.subject_role = 'father' AND w.total_score < 10 THEN 'low'
        WHEN w.subject_role = 'father' AND w.total_score < 12 THEN 'mid'
        ELSE 'high'
      END,
      NULL::jsonb, NULL::int
    FROM wellness_entries w
    WHERE w.user_id = p_target_user_id
    ORDER BY w.entry_date DESC
    LIMIT 30;
  ELSIF effective_level = 'full' THEN
    RETURN QUERY
    SELECT w.id, w.entry_type, w.entry_date, w.subject_role,
      (w.responses->>'mood')::int,
      CASE
        WHEN w.total_score IS NULL THEN NULL
        WHEN w.subject_role = 'mother' AND w.total_score < 10 THEN 'low'
        WHEN w.subject_role = 'mother' AND w.total_score < 13 THEN 'mid'
        WHEN w.subject_role = 'mother' THEN 'high'
        WHEN w.subject_role = 'father' AND w.total_score < 10 THEN 'low'
        WHEN w.subject_role = 'father' AND w.total_score < 12 THEN 'mid'
        ELSE 'high'
      END,
      w.responses, w.total_score
    FROM wellness_entries w
    WHERE w.user_id = p_target_user_id
    ORDER BY w.entry_date DESC
    LIMIT 50;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_partner_wellness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_partner_wellness(uuid) TO authenticated;

COMMIT;
