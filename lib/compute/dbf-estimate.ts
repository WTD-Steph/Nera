// Estimate ml transferred during DBF (direct breastfeeding) sessions.
// Pre/post weighing is the only accurate measurement at home, so this is
// strictly a rough estimate. Strategy:
//
// 1. Look at the most recent completed pumping with both ml + per-side
//    duration data. Compute totalMl / totalMinutes → ml/min for this
//    specific mom. Personal rate is more useful than a generic constant.
// 2. Fallback to literature default 4 ml/min for newborn–6mo when no
//    pumping baseline exists yet.
//
// DBF efficiency may differ from pump efficiency (baby can be either
// more or less efficient than a pump). This is acknowledged in the UI
// via the "≈" prefix — never displayed as a precise number.

import type { LogRow } from "@/lib/compute/stats";

export const DEFAULT_DBF_ML_PER_MIN = 4;

function pumpSessionMinutes(p: LogRow): number {
  let total = 0;
  if (p.start_l_at && p.end_l_at) {
    total +=
      (new Date(p.end_l_at).getTime() - new Date(p.start_l_at).getTime()) /
      60000;
  }
  if (p.start_r_at && p.end_r_at) {
    total +=
      (new Date(p.end_r_at).getTime() - new Date(p.start_r_at).getTime()) /
      60000;
  }
  return total;
}

/**
 * Returns ml/min as the **median** of up to N most-recent meaningful
 * pumping sessions (≥5 ml AND ≥10 min). Median (vs single-most-recent)
 * is robust against outlier sessions — e.g. a single low-yield 10 ml /
 * 20 min session technically passes the threshold but isn't
 * representative; median across 5 sessions ignores it gracefully.
 * Returns null if no qualifying session exists yet.
 */
const MIN_PUMP_ML = 5;
const MIN_PUMP_MIN = 10;
const SAMPLE_COUNT = 5;
export function pumpingMlPerMin(logs: LogRow[]): number | null {
  const candidates = [...logs]
    .filter((l) => l.subtype === "pumping" && l.end_timestamp != null)
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  const rates: number[] = [];
  for (const p of candidates) {
    const totalMl = (p.amount_l_ml ?? 0) + (p.amount_r_ml ?? 0);
    const totalMin = pumpSessionMinutes(p);
    if (totalMl >= MIN_PUMP_ML && totalMin >= MIN_PUMP_MIN) {
      rates.push(totalMl / totalMin);
      if (rates.length >= SAMPLE_COUNT) break;
    }
  }
  if (rates.length === 0) return null;
  rates.sort((a, b) => a - b);
  const mid = Math.floor(rates.length / 2);
  if (rates.length % 2 === 0) {
    const a = rates[mid - 1] ?? 0;
    const b = rates[mid] ?? 0;
    return (a + b) / 2;
  }
  return rates[mid] ?? 0;
}

export type DbfEstimateOverrides = {
  /** Fixed ml/min override (highest priority after multiplier). */
  fixedMlPerMin?: number | null;
  /** Multiplier applied to pumping rate. Highest priority when both
   *  multiplier and a usable pumping rate exist. */
  pumpingMultiplier?: number | null;
  /** Per-row override (highest priority of all). When set on a specific
   *  DBF row, takes precedence over baby-level setting. */
  rowOverride?: number | null;
};

/**
 * Resolve DBF rate using priority chain:
 *   1. row-level override (per-aktivitas)
 *   2. baby multiplier × pumping rate
 *   3. baby fixed ml/min
 *   4. auto pumping rate
 *   5. literature default 4 ml/min
 */
export function dbfEstimateMl(
  dbfMinutes: number,
  logs: LogRow[],
  overrides: DbfEstimateOverrides = {},
): {
  ml: number;
  mlPerMin: number;
  source: "row" | "multiplier" | "fixed" | "pumping" | "default";
  pumpingRate: number | null;
} {
  const fromPump = pumpingMlPerMin(logs);
  const { fixedMlPerMin, pumpingMultiplier, rowOverride } = overrides;

  if (typeof rowOverride === "number" && rowOverride > 0) {
    return {
      ml: Math.round(dbfMinutes * rowOverride),
      mlPerMin: rowOverride,
      source: "row",
      pumpingRate: fromPump,
    };
  }

  if (
    typeof pumpingMultiplier === "number" &&
    pumpingMultiplier > 0 &&
    fromPump != null
  ) {
    const rate = fromPump * pumpingMultiplier;
    return {
      ml: Math.round(dbfMinutes * rate),
      mlPerMin: rate,
      source: "multiplier",
      pumpingRate: fromPump,
    };
  }

  if (typeof fixedMlPerMin === "number" && fixedMlPerMin > 0) {
    return {
      ml: Math.round(dbfMinutes * fixedMlPerMin),
      mlPerMin: fixedMlPerMin,
      source: "fixed",
      pumpingRate: fromPump,
    };
  }

  const rate = fromPump ?? DEFAULT_DBF_ML_PER_MIN;
  return {
    ml: Math.round(dbfMinutes * rate),
    mlPerMin: rate,
    source: fromPump != null ? "pumping" : "default",
    pumpingRate: fromPump,
  };
}
