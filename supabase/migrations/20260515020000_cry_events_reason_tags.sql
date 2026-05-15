-- Migration: 20260515020000_cry_events_reason_tags
-- Tier 1.5 cry categorization — Phase 1 (Path C heuristic + Path D
-- manual tag).
--
-- Schema additions ke cry_events:
-- - suggested_reason: heuristic output saat INSERT (frozen — snapshot
--   apa yang app thought di moment detection)
-- - suggested_confidence: 'high' | 'medium' | 'low'
-- - tagged_reason: parent manual tag (ground truth, editable anytime)
-- - tagged_at + tagged_by: audit + tracking siapa yang tag
--
-- Reason enum: hungry | tired | diaper | discomfort | unclear
-- (+ 'other' allowed di tagged_reason untuk catch-all category not
-- coverable by heuristic)
--
-- All columns nullable supaya backwards-compat dengan existing rows
-- + tolerant terhadap tag-after-fact UX.

BEGIN;

ALTER TABLE public.cry_events
  ADD COLUMN suggested_reason text,
  ADD COLUMN suggested_confidence text,
  ADD COLUMN tagged_reason text,
  ADD COLUMN tagged_at timestamptz,
  ADD COLUMN tagged_by uuid REFERENCES auth.users(id);

ALTER TABLE public.cry_events
  ADD CONSTRAINT cry_events_suggested_reason_chk CHECK (
    suggested_reason IS NULL
    OR suggested_reason IN ('hungry', 'tired', 'diaper', 'discomfort', 'unclear')
  ),
  ADD CONSTRAINT cry_events_suggested_confidence_chk CHECK (
    suggested_confidence IS NULL
    OR suggested_confidence IN ('high', 'medium', 'low')
  ),
  ADD CONSTRAINT cry_events_tagged_reason_chk CHECK (
    tagged_reason IS NULL
    OR tagged_reason IN ('hungry', 'tired', 'diaper', 'discomfort', 'unclear', 'other')
  );

COMMIT;
