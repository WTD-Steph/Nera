-- Migration: 20260503080000_handovers_on_behalf
-- Allow household member to start a handover ON BEHALF of partner.
-- Use case: husband marks wife as sleeping while she's already in bed
-- (or vice versa). Previous policy hardcoded started_by = auth.uid()
-- which only allowed self-attribution.
--
-- New policy still verifies:
--   1. Inserter is a member of the target household
--   2. The named started_by user is also a member of that household
-- — so cross-household attribution is impossible.

BEGIN;

DROP POLICY IF EXISTS handovers_insert ON public.handovers;

CREATE POLICY handovers_insert ON public.handovers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = handovers.household_id
        AND hm.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.household_members hm2
      WHERE hm2.household_id = handovers.household_id
        AND hm2.user_id = handovers.started_by
    )
  );

COMMIT;
