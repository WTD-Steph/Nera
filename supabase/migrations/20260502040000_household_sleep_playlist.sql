-- Migration: 20260502040000_household_sleep_playlist
-- Per-household configurable Spotify (or any URL) playlist for the
-- night-lamp 'Putar musik tidur' button. NULL = use the app default.

BEGIN;

ALTER TABLE public.households
  ADD COLUMN sleep_playlist_url text;

COMMIT;
