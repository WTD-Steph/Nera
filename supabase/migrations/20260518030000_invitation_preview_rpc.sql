-- Migration: 20260518030000_invitation_preview_rpc
-- Public anonymous lookup: token → invited_email + household name.
-- Token sendiri adalah capability (UUID-hex 32 char). Anyone yang punya
-- token sudah entitled tau email + household — sama model dengan Slack/
-- Notion invite. Pakai SECURITY DEFINER supaya bypass RLS strict yang
-- block anonymous.
--
-- Dipakai oleh /invite/[token] page saat user belum login: redirect ke
-- /signup?email={invited_email}&next=/invite/{token} untuk prefill email
-- supaya nggak typo + nggak perlu copy-paste dari WA.

CREATE OR REPLACE FUNCTION public.get_invitation_preview(p_token text)
RETURNS TABLE(
  invited_email text,
  household_name text,
  role text,
  expires_at timestamptz,
  accepted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT hi.invited_email, h.name, hi.role, hi.expires_at, hi.accepted_at
  FROM household_invitations hi
  JOIN households h ON h.id = hi.household_id
  WHERE hi.token = p_token
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_preview(text) TO anon, authenticated;
