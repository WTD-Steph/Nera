-- Migration: 20260512020000_cry_events
-- Foundation untuk Tier 1 cry detection (PR A dari 3-PR split).
--
-- Audio capture + ML inference dilakukan client-side; tabel ini hanya
-- menyimpan event metadata (timestamp + confidence). Tidak ada audio
-- file storage — privacy by design.
--
-- Schema mirrors prompt spec. RLS policy pattern follows `logs` table
-- (direct EXISTS join babies + household_members, NO SECURITY DEFINER
-- helpers di policy expression — per Nera critical pitfalls, helper
-- SECURITY DEFINER memicu Postgres SEGV saat introspection).
--
-- device_id intent: client-set anonymous UUID di localStorage. Database
-- RLS scope ke household member (sama persis dengan insert/select)
-- karena custom JWT claim untuk device-id tidak supported by Supabase
-- natively. Same-device update enforcement dilakukan app-side (only
-- the device yang memegang event id di memory yang akan emit ended).
--
-- Realtime publication ditambah supaya cross-device sync (HP nursery
-- → HP living room) bisa pakai postgres_changes pattern existing
-- (lihat components/LogsRealtime.tsx).

BEGIN;

CREATE TABLE public.cry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  baby_id uuid NOT NULL REFERENCES public.babies(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  peak_confidence numeric(4, 3) NOT NULL CHECK (peak_confidence BETWEEN 0 AND 1),
  avg_confidence numeric(4, 3) CHECK (avg_confidence BETWEEN 0 AND 1),
  duration_seconds integer CHECK (duration_seconds >= 0),
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cry_events_baby_started_idx
  ON public.cry_events (baby_id, started_at DESC);

CREATE INDEX cry_events_household_started_idx
  ON public.cry_events (household_id, started_at DESC);

ALTER TABLE public.cry_events ENABLE ROW LEVEL SECURITY;

-- SELECT: household members can read events for babies in their household
CREATE POLICY cry_events_select_member ON public.cry_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = cry_events.baby_id
        AND hm.user_id = auth.uid()
    )
  );

-- INSERT: same condition — only household members can insert
CREATE POLICY cry_events_insert_member ON public.cry_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = cry_events.baby_id
        AND hm.user_id = auth.uid()
    )
  );

-- UPDATE: household members (app-level enforces same-device for end events)
CREATE POLICY cry_events_update_member ON public.cry_events
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = cry_events.baby_id
        AND hm.user_id = auth.uid()
    )
  );

-- Realtime: enable for cross-device subscription (HP nursery → HP living room).
ALTER PUBLICATION supabase_realtime ADD TABLE public.cry_events;

COMMIT;
