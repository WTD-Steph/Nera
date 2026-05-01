-- Migration: 20260501073000_household
-- PR #2b feature/household
--
-- Tables: households, household_members, household_invitations
-- RLS policies + SECURITY DEFINER RPCs untuk operasi yang butuh bypass RLS
-- (member listing, owner remove, household bootstrap, invitation accept).
--
-- ⚠️ Penting: SECURITY DEFINER functions TIDAK boleh dipakai dalam RLS policy
-- expression — pattern itu memicu Postgres backend SEGV (signal 11) saat
-- PostgREST schema introspection di Postgres 17.6.x. Lihat docs/auth.md
-- §"SECURITY DEFINER + RLS policy = SEGV".
--
-- Workaround: policies pakai direct EXISTS subquery. Untuk operasi yang
-- butuh bypass RLS (e.g., list co-members ketika household_members SELECT
-- policy adalah self-only), pakai SECURITY DEFINER RPC dipanggil dari app.

BEGIN;

-- =====================================================================
-- Helper functions
-- =====================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =====================================================================
-- Tables
-- =====================================================================

CREATE TABLE public.households (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TRIGGER set_updated_at_households
  BEFORE UPDATE ON public.households
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.household_members (
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);
CREATE INDEX household_members_user_idx ON public.household_members(user_id);

CREATE TABLE public.household_invitations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  invited_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role          text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  token         text UNIQUE NOT NULL,
  expires_at    timestamptz NOT NULL,
  accepted_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX household_invitations_email_idx
  ON public.household_invitations(invited_email)
  WHERE accepted_at IS NULL;
CREATE INDEX household_invitations_household_idx
  ON public.household_invitations(household_id)
  WHERE accepted_at IS NULL;

-- =====================================================================
-- RLS enable
-- =====================================================================

ALTER TABLE public.households            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_invitations ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- RLS policies — direct EXISTS, NO SECURITY DEFINER helpers
-- =====================================================================

-- households: visible kalau user adalah member household ini
CREATE POLICY households_select_member ON public.households
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = households.id AND hm.user_id = auth.uid()
    )
  );

-- households: owner-only update/delete
CREATE POLICY households_update_owner ON public.households
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = households.id
        AND hm.user_id = auth.uid()
        AND hm.role = 'owner'
    )
  );

CREATE POLICY households_delete_owner ON public.households
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = households.id
        AND hm.user_id = auth.uid()
        AND hm.role = 'owner'
    )
  );

-- INSERT direct ke households denied — paksa lewat create_household_with_owner RPC

-- household_members: SELF-ONLY untuk SELECT/DELETE (anti-recursion).
-- Listing co-members dilakukan via list_household_members() RPC.
CREATE POLICY household_members_select_self ON public.household_members
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY household_members_delete_self ON public.household_members
  FOR DELETE USING (user_id = auth.uid());

-- INSERT ke household_members denied — paksa lewat create_household_with_owner /
-- accept_household_invitation RPC.
-- Owner remove member: lewat remove_household_member() RPC.
-- UPDATE belum dipakai di v1.

-- household_invitations: owner sees semua untuk household-nya, OR invitee sees own
CREATE POLICY household_invitations_select ON public.household_invitations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = household_invitations.household_id
        AND hm.user_id = auth.uid()
        AND hm.role = 'owner'
    )
    OR invited_email = (auth.jwt() ->> 'email')
  );

CREATE POLICY household_invitations_insert_owner ON public.household_invitations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = household_invitations.household_id
        AND hm.user_id = auth.uid()
        AND hm.role = 'owner'
    ) AND invited_by = auth.uid()
  );

CREATE POLICY household_invitations_update ON public.household_invitations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = household_invitations.household_id
        AND hm.user_id = auth.uid()
        AND hm.role = 'owner'
    )
    OR invited_email = (auth.jwt() ->> 'email')
  );

CREATE POLICY household_invitations_delete_owner ON public.household_invitations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = household_invitations.household_id
        AND hm.user_id = auth.uid()
        AND hm.role = 'owner'
    )
  );

-- =====================================================================
-- SECURITY DEFINER RPCs — bypass RLS untuk bootstrap & cross-membership ops.
-- Tidak boleh direferensikan dari RLS policy expression (pemicu SEGV).
-- =====================================================================

-- Bootstrap household (dipakai /setup)
CREATE OR REPLACE FUNCTION public.create_household_with_owner(household_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE h_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF household_name IS NULL OR length(trim(household_name)) = 0 THEN
    RAISE EXCEPTION 'household_name_required';
  END IF;
  INSERT INTO public.households (name, created_by)
  VALUES (trim(household_name), auth.uid())
  RETURNING id INTO h_id;
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (h_id, auth.uid(), 'owner');
  RETURN h_id;
END;
$$;

-- Accept invitation (dipakai /invite/[token])
CREATE OR REPLACE FUNCTION public.accept_household_invitation(invite_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE inv record; user_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();
  SELECT * INTO inv FROM public.household_invitations
  WHERE token = invite_token
    AND invited_email = user_email
    AND expires_at > now()
    AND accepted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_invalid_or_expired'; END IF;
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (inv.household_id, auth.uid(), inv.role)
  ON CONFLICT (household_id, user_id) DO NOTHING;
  UPDATE public.household_invitations SET accepted_at = now() WHERE id = inv.id;
  RETURN inv.household_id;
END;
$$;

-- List members of household — bypass RLS self-only limitation
CREATE OR REPLACE FUNCTION public.list_household_members(h_id uuid)
RETURNS TABLE (user_id uuid, role text, joined_at timestamptz, email text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.household_id = h_id AND hm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  RETURN QUERY
  SELECT hm.user_id, hm.role, hm.joined_at, u.email::text
  FROM public.household_members hm
  LEFT JOIN auth.users u ON u.id = hm.user_id
  WHERE hm.household_id = h_id
  ORDER BY hm.joined_at;
END;
$$;

-- Owner removes a member (other than self)
CREATE OR REPLACE FUNCTION public.remove_household_member(h_id uuid, target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.household_id = h_id AND hm.user_id = auth.uid() AND hm.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'not_an_owner';
  END IF;
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_remove_self_use_leave';
  END IF;
  DELETE FROM public.household_members
  WHERE household_id = h_id AND user_id = target_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_household_with_owner(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_household_invitation(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_household_members(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.remove_household_member(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_household_with_owner(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_household_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_household_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_household_member(uuid, uuid) TO authenticated;

COMMIT;
