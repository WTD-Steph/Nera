-- Migration: 20260501073500_household_security_hardening
-- Address Supabase security advisor warnings dari migration sebelumnya.

-- Fix: set_updated_at mutable search_path
ALTER FUNCTION public.set_updated_at() SET search_path = public;

-- Helper RLS functions tidak perlu callable via /rest/v1/rpc/ —
-- mereka di-evaluate dari dalam policy (postgres role bypass GRANT).
-- Revoke EXECUTE dari semua role yang bisa hit PostgREST.
REVOKE EXECUTE ON FUNCTION public.is_household_member(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_household_owner(uuid)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_household_member_of_baby(uuid) FROM PUBLIC, anon, authenticated;

-- Note: create_household_with_owner & accept_household_invitation TETAP
-- exposed ke authenticated — itu memang flow yang dirancang. Advisor warning
-- untuk keduanya intentional dan diterima.
