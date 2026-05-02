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
  /** Total milk intake (bottle + DBF estimate). 150-200 ml/kg/day for newborn. */
  milkMlMin: number;
  milkMlMax: number;
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
  // 0–1 month
  {
    ageDaysMin: 0,
    ageDaysMax: 30,
    milkMlMin: 600,
    milkMlMax: 800,
    sleepHoursMin: 14,
    sleepHoursMax: 17,
    peeMin: 6,
    peeMax: 8,
    poopMin: 1,
    poopMax: 4,
  },
  // 1–3 months
  {
    ageDaysMin: 30,
    ageDaysMax: 90,
    milkMlMin: 700,
    milkMlMax: 900,
    sleepHoursMin: 14,
    sleepHoursMax: 17,
    peeMin: 6,
    peeMax: 8,
    poopMin: 1,
    poopMax: 4,
  },
  // 3–6 months
  {
    ageDaysMin: 90,
    ageDaysMax: 180,
    milkMlMin: 800,
    milkMlMax: 1000,
    sleepHoursMin: 12,
    sleepHoursMax: 16,
    peeMin: 6,
    peeMax: 8,
    poopMin: 1,
    poopMax: 4,
  },
  // 6–12 months (MPASI dimulai, susu volume turun)
  {
    ageDaysMin: 180,
    ageDaysMax: 365,
    milkMlMin: 600,
    milkMlMax: 900,
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
  // Past 12 months: keep last bucket as fallback
  return DAILY_TARGETS[DAILY_TARGETS.length - 1]!;
}
