-- Migration: 20260520010000_household_members_update_policy
-- Fix: household_members tidak punya UPDATE policy. RLS bikin UPDATE
-- silent no-op (0 rows affected, no error returned). Akibatnya
-- setPerinatalRoleAction di /wellness/intro silently gagal → user klik
-- "Mulai" → redirect ke /wellness → /wellness check role NULL →
-- redirect balik ke /wellness/intro → loop "nothing happened".
--
-- Safe pattern: USING + WITH CHECK = (user_id = auth.uid()) — same model
-- dengan existing SELECT/DELETE self-only policy. Tidak cross-reference
-- household_members table dari sini → no 42P17 recursion risk (per
-- CLAUDE.md critical pitfall).
--
-- Caveat: user bisa UPDATE field role mereka sendiri (owner ↔ member).
-- Itu tidak ideal tapi affecting only their own row. Cross-member admin
-- ops tetap pakai SECURITY DEFINER RPC.

CREATE POLICY household_members_update_self
  ON public.household_members
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
