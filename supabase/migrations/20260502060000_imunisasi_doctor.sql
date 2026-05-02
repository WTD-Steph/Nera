-- Migration: 20260502060000_imunisasi_doctor
-- Add a dedicated doctor_name column on immunization_progress so the form
-- can show a datalist autocomplete of previously-used doctor names.
-- The free-form "notes" field stays for additional notes (reactions, etc.).

BEGIN;

ALTER TABLE public.immunization_progress
  ADD COLUMN doctor_name text;

COMMIT;
