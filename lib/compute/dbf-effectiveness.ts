// Comprehensive DBF effectiveness model + top-up recommendation.
//
// EFFECTIVENESS LEVELS (research-backed markers):
// Aligned with WHO/UNICEF Baby Friendly Hospital Initiative + La Leche
// League International + IBCLC clinical assessment frameworks (LATCH,
// IBFAT, Mother-Baby Assessment).
//
// - efektif: rhythmic deep sucking pattern, audible swallow every 1-3
//   sucks, baby relaxes during feed, breast feels softer post-feed,
//   baby releases on own + content + relaxed.
// - sedang: swallowing inconsistent, baby drifts off / alternates
//   active sucking with long pauses, breast partially softened.
// - kurang_efektif: few or no audible swallows, shallow latch, weak
//   suck pattern, baby still rooting/fussy post-feed, breast still firm.
//
// MULTIPLIER VALUES:
// User-configured 100/80/60. More lenient than literature range
// (100/65/25 from Hartmann et al milk transfer studies) — gentler
// nudges, user can manually edit duration if a session was comfort-only.
//
// PER-FEED EXPECTED ML:
// daily_target_min / typical_feeds_per_day for the age bucket.
// - 0-1 mo: 8-12 feeds (use 10)
// - 1-3 mo: 6-8 feeds (use 7)
// - 3-6 mo: 5-6 feeds (use 6)
// - 6-12 mo: 4-5 feeds + solids (use 5)
// Source: AAP feeding guidelines + IDAI rekomendasi.
//
// TOP-UP RULE:
// Suggest top-up when (effectiveMl < expectedPerFeed × 0.8) AND
// (shortfall ≥ 15 ml). Round to nearest 5 ml. Cap at 90 ml (typical
// max bottle for newborn — beyond that suggest split feed).

import type { DailyTarget } from "@/lib/constants/daily-targets";

export type EffectivenessLevel = "efektif" | "sedang" | "kurang_efektif";

export const EFFECTIVENESS_LABELS: Record<EffectivenessLevel, string> = {
  efektif: "Efektif",
  sedang: "Sedang",
  kurang_efektif: "Kurang efektif",
};

export const EFFECTIVENESS_EMOJIS: Record<EffectivenessLevel, string> = {
  efektif: "😊",
  sedang: "😐",
  kurang_efektif: "😟",
};

/**
 * Multiplier applied on top of the base DBF rate (ml/min) to estimate
 * actual milk transferred during the session. Conservative bracketing —
 * see file header for citation rationale.
 */
export const EFFECTIVENESS_FACTORS: Record<EffectivenessLevel, number> = {
  efektif: 1.0,
  sedang: 0.8,
  kurang_efektif: 0.6,
};

export function effectivenessFactor(
  level: EffectivenessLevel | null | undefined,
): number {
  if (!level) return 1.0;
  return EFFECTIVENESS_FACTORS[level];
}

/**
 * Effective ml transferred during a DBF session.
 * @param durationMins total minutes (kiri + kanan)
 * @param baseRate ml/min from priority chain (multiplier × pumping / fixed / default 4)
 * @param effectiveness assessed level, or null for default 100%
 */
export function effectiveDbfMl(
  durationMins: number,
  baseRate: number,
  effectiveness: EffectivenessLevel | null | undefined,
): number {
  const factor = effectivenessFactor(effectiveness);
  return Math.round(durationMins * baseRate * factor);
}

/**
 * Typical feeds-per-day count for the age bucket. Informs per-feed
 * expected volume calculation. Sources: AAP, IDAI feeding guidelines.
 */
export function typicalFeedsPerDay(target: DailyTarget): number {
  if (target.ageDaysMax <= 30) return 10;
  if (target.ageDaysMax <= 90) return 7;
  if (target.ageDaysMax <= 180) return 6;
  return 5;
}

export type TopUpSuggestion = {
  /** Recommended ml to top up via bottle (sufor or expressed ASI). */
  recommendMl: number;
  /** Effective ml estimated for THIS feed. */
  effectiveMl: number;
  /** Per-feed target for the age bucket. */
  expectedPerFeed: number;
  /** Shortfall mathematical (expected - effective). */
  shortfall: number;
};

const SHORTFALL_THRESHOLD_PCT = 0.2; // 20% — under this, no top-up suggested
const SHORTFALL_THRESHOLD_ML = 15; // also need >=15 ml gap for suggestion
const TOPUP_ROUND_TO_ML = 5;
const TOPUP_MAX_ML = 90; // cap suggestion — split feed if beyond

/**
 * Compute top-up suggestion for a completed DBF session.
 * Returns null when no top-up is recommended (effective enough or
 * shortfall too small).
 *
 * Logic:
 *   expectedPerFeed = milkTargetMin / typicalFeedsPerDay
 *   shortfall = expectedPerFeed - effectiveMl
 *   if shortfall < threshold → null (close enough)
 *   else recommendMl = clamp(round5(shortfall), 0, TOPUP_MAX_ML)
 */
export function suggestTopUp({
  durationMins,
  baseRate,
  effectiveness,
  milkTargetMin,
  target,
}: {
  durationMins: number;
  baseRate: number;
  effectiveness: EffectivenessLevel | null | undefined;
  milkTargetMin: number;
  target: DailyTarget;
}): TopUpSuggestion | null {
  if (durationMins <= 0) return null;
  const effectiveMl = effectiveDbfMl(durationMins, baseRate, effectiveness);
  const feedsPerDay = typicalFeedsPerDay(target);
  const expectedPerFeed = Math.round(milkTargetMin / feedsPerDay);
  const shortfall = expectedPerFeed - effectiveMl;

  if (shortfall < SHORTFALL_THRESHOLD_ML) return null;
  if (shortfall / expectedPerFeed < SHORTFALL_THRESHOLD_PCT) return null;

  const rounded =
    Math.round(shortfall / TOPUP_ROUND_TO_ML) * TOPUP_ROUND_TO_ML;
  const clamped = Math.max(0, Math.min(TOPUP_MAX_ML, rounded));
  if (clamped <= 0) return null;

  return {
    recommendMl: clamped,
    effectiveMl,
    expectedPerFeed,
    shortfall,
  };
}
