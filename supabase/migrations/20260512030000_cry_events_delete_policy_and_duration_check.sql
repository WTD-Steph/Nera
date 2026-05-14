-- Migration: 20260512030000_cry_events_delete_policy_and_duration_check
-- Amendment ke 20260512020000_cry_events (PR A review feedback).
--
-- (1) DELETE policy: user butuh cara hapus false-positive events dari
--     timeline (anjing tetangga, suara TV, sibling visiting). Mirror
--     pattern existing select/insert/update policies — household
--     members can delete events untuk babies di household mereka.
-- (2) ended_at >= started_at check constraint: cheap data integrity
--     guard supaya backwards interval tidak bisa di-write.

BEGIN;

CREATE POLICY cry_events_delete_member ON public.cry_events
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = cry_events.baby_id
        AND hm.user_id = auth.uid()
    )
  );

ALTER TABLE public.cry_events
  ADD CONSTRAINT cry_events_duration_valid
    CHECK (ended_at IS NULL OR ended_at >= started_at);

COMMIT;
