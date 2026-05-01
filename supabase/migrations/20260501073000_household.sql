-- Migration: 20260501073000_household
-- PR #2b feature/household
--
-- Tables: households, household_members, household_invitations
-- RLS policies + helper functions (is_household_member, is_household_owner)
-- Placeholder is_household_member_of_baby — akan di-replace di PR #3 saat babies table lahir
-- updated_at trigger generic
-- SECURITY DEFINER RPCs: create_household_with_owner, accept_household_invitation

BEGIN;

-- =====================================================================
-- Helper functions
-- =====================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
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
-- RLS helper functions (STABLE + SECURITY DEFINER agar reliable di policy)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_household_member(h_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = h_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_household_owner(h_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = h_id AND user_id = auth.uid() AND role = 'owner'
  );
$$;

-- Placeholder — PR #3 akan REPLACE function body untuk reference babies table.
-- Untuk PR #2b, function ada agar policy babies/logs/dst di PR berikutnya bisa
-- compile, tapi tidak ada baby data dulu jadi return false.
CREATE OR REPLACE FUNCTION public.is_household_member_of_baby(b_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- placeholder PR #2b; PR #3 akan replace dengan join ke public.babies
  SELECT false;
$$;

-- =====================================================================
-- RLS enable
-- =====================================================================

ALTER TABLE public.households            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_invitations ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- RLS policies — households
-- =====================================================================

CREATE POLICY households_select_member ON public.households
  FOR SELECT USING (public.is_household_member(id));

-- Direct INSERT denied — pakai create_household_with_owner RPC
-- (tidak ada policy INSERT → default deny)

CREATE POLICY households_update_owner ON public.households
  FOR UPDATE USING (public.is_household_owner(id));

CREATE POLICY households_delete_owner ON public.households
  FOR DELETE USING (public.is_household_owner(id));

-- =====================================================================
-- RLS policies — household_members
-- =====================================================================

CREATE POLICY household_members_select_co_members ON public.household_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_household_member(household_id)
  );

-- INSERT direct denied — pakai create_household_with_owner / accept_household_invitation RPC

CREATE POLICY household_members_update_owner ON public.household_members
  FOR UPDATE USING (public.is_household_owner(household_id));

-- DELETE: self-leave OR owner removes other member
CREATE POLICY household_members_delete ON public.household_members
  FOR DELETE USING (
    user_id = auth.uid()
    OR public.is_household_owner(household_id)
  );

-- =====================================================================
-- RLS policies — household_invitations
-- =====================================================================

-- SELECT: owner sees invites for household, OR invited email sees their own
CREATE POLICY household_invitations_select ON public.household_invitations
  FOR SELECT USING (
    public.is_household_owner(household_id)
    OR invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- INSERT: owner creates invites, dengan invited_by = self
CREATE POLICY household_invitations_insert_owner ON public.household_invitations
  FOR INSERT WITH CHECK (
    public.is_household_owner(household_id)
    AND invited_by = auth.uid()
  );

-- UPDATE: owner manages, atau invitee sets accepted_at via RPC
CREATE POLICY household_invitations_update ON public.household_invitations
  FOR UPDATE USING (
    public.is_household_owner(household_id)
    OR invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- DELETE: owner only
CREATE POLICY household_invitations_delete_owner ON public.household_invitations
  FOR DELETE USING (public.is_household_owner(household_id));

-- =====================================================================
-- SECURITY DEFINER RPCs (bypass RLS untuk bootstrap & accept flow)
-- =====================================================================

-- Bootstrap: dipakai di /setup. Buat household + masukkan caller sebagai owner.
CREATE OR REPLACE FUNCTION public.create_household_with_owner(household_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
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

REVOKE EXECUTE ON FUNCTION public.create_household_with_owner(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_household_with_owner(text) TO authenticated;

-- Accept invitation: dipakai di /invite/[token]. Insert membership + mark accepted.
CREATE OR REPLACE FUNCTION public.accept_household_invitation(invite_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv record;
  user_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();

  SELECT * INTO inv FROM public.household_invitations
  WHERE token = invite_token
    AND invited_email = user_email
    AND expires_at > now()
    AND accepted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_invalid_or_expired';
  END IF;

  -- Idempotent — kalau sudah jadi member (manual prior), tinggal mark accepted
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (inv.household_id, auth.uid(), inv.role)
  ON CONFLICT (household_id, user_id) DO NOTHING;

  UPDATE public.household_invitations
  SET accepted_at = now()
  WHERE id = inv.id;

  RETURN inv.household_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_household_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_household_invitation(text) TO authenticated;

COMMIT;
