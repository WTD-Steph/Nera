// Age-bucketed daily targets sourced from WHO / IDAI / AAP infant
// feeding + sleep guidelines. Values are conservative midpoint ranges
// suitable for healthy term infants. Always defer to the baby's
// pediatrician for medical decisions — these are reference ranges, not
// prescriptions.
//
// Sources:
// - WHO infant feeding (https://www.who.int/health-topics/breastfeeding)
// - AAP "Bright Futures" Guidelines for Infants
// - IDAI Rekomendasi pemberian ASI/sufor
// - National Sleep Foundation / AAP sleep duration recommendations
// - La Leche League stooling patterns

export type DailyTarget = {
  ageDaysMin: number;
  ageDaysMax: number;
  /** Fallback milk total when current weight is unknown. */
  milkMlMin: number;
  milkMlMax: number;
  /** Per-kg/day milk intake — preferred when current weight is known. */
  milkMlPerKgMin: number;
  milkMlPerKgMax: number;
  /** Total ml/day cap (max) — solids replace some milk volume after 6mo. */
  milkMlAbsoluteMax: number;
  /** Total sleep including naps. */
  sleepHoursMin: number;
  sleepHoursMax: number;
  /** Wet diapers / day. Hydration baseline. */
  peeMin: number;
  peeMax: number;
  /** Stools / day. Wide range — varies a lot by feeding type & age. */
  poopMin: number;
  poopMax: number;
};

export const DAILY_TARGETS: DailyTarget[] = [
  // 0–1 month: 150-200 ml/kg/day
  {
    ageDaysMin: 0,
    ageDaysMax: 30,
    milkMlMin: 600,
    milkMlMax: 800,
    milkMlPerKgMin: 150,
    milkMlPerKgMax: 200,
    milkMlAbsoluteMax: 1000,
    sleepHoursMin: 14,
    sleepHoursMax: 17,
    peeMin: 6,
    peeMax: 8,
    poopMin: 1,
    poopMax: 4,
  },
  // 1–3 months: 150-180 ml/kg/day
  {
    ageDaysMin: 30,
    ageDaysMax: 90,
    milkMlMin: 700,
    milkMlMax: 900,
    milkMlPerKgMin: 150,
    milkMlPerKgMax: 180,
    milkMlAbsoluteMax: 1100,
    sleepHoursMin: 14,
    sleepHoursMax: 17,
    peeMin: 6,
    peeMax: 8,
    poopMin: 1,
    poopMax: 4,
  },
  // 3–6 months: 130-150 ml/kg/day (efficiency naik, beberapa mulai turun)
  {
    ageDaysMin: 90,
    ageDaysMax: 180,
    milkMlMin: 800,
    milkMlMax: 1000,
    milkMlPerKgMin: 130,
    milkMlPerKgMax: 150,
    milkMlAbsoluteMax: 1100,
    sleepHoursMin: 12,
    sleepHoursMax: 16,
    peeMin: 6,
    peeMax: 8,
    poopMin: 1,
    poopMax: 4,
  },
  // 6–12 months: MPASI dimulai, susu volume turun (~600-900 ml, max 1000)
  {
    ageDaysMin: 180,
    ageDaysMax: 365,
    milkMlMin: 600,
    milkMlMax: 900,
    milkMlPerKgMin: 90,
    milkMlPerKgMax: 130,
    milkMlAbsoluteMax: 1000,
    sleepHoursMin: 12,
    sleepHoursMax: 16,
    peeMin: 6,
    peeMax: 8,
    poopMin: 1,
    poopMax: 4,
  },
];

export function getTargetForAge(dobIso: string): DailyTarget {
  const days = Math.floor(
    (Date.now() - new Date(dobIso).getTime()) / 86400000,
  );
  for (const t of DAILY_TARGETS) {
    if (days >= t.ageDaysMin && days < t.ageDaysMax) return t;
  }
  return DAILY_TARGETS[DAILY_TARGETS.length - 1]!;
}

/**
 * Compute milk target range using current weight when available.
 * Falls back to age-bucket totals when weight is unknown. Capped by
 * milkMlAbsoluteMax to avoid unrealistic volumes for big babies.
 */
export function computeMilkTarget(
  target: DailyTarget,
  currentWeightKg: number | null,
): { min: number; max: number; source: "weight" | "age" } {
  if (currentWeightKg && currentWeightKg > 0) {
    return {
      min: Math.round(currentWeightKg * target.milkMlPerKgMin),
      max: Math.min(
        target.milkMlAbsoluteMax,
        Math.round(currentWeightKg * target.milkMlPerKgMax),
      ),
      source: "weight",
    };
  }
  return {
    min: target.milkMlMin,
    max: target.milkMlMax,
    source: "age",
  };
}
