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
 * Returns ml/min from the most recent meaningful pumping session — one
 * with at least 5 ml total and 10 minutes duration. Tiny sessions
 * (test pumps, interrupted feeds) skew the rate unrealistically low
 * (e.g. 10 ml / 21 min = 0.5 ml/min) when they're not representative.
 * Returns null if no qualifying session exists yet.
 */
const MIN_PUMP_ML = 5;
const MIN_PUMP_MIN = 10;
export function pumpingMlPerMin(logs: LogRow[]): number | null {
  const candidates = [...logs]
    .filter((l) => l.subtype === "pumping" && l.end_timestamp != null)
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  for (const p of candidates) {
    const totalMl = (p.amount_l_ml ?? 0) + (p.amount_r_ml ?? 0);
    const totalMin = pumpSessionMinutes(p);
    if (totalMl >= MIN_PUMP_ML && totalMin >= MIN_PUMP_MIN) {
      return totalMl / totalMin;
    }
  }
  return null;
}

export function dbfEstimateMl(
  dbfMinutes: number,
  logs: LogRow[],
): { ml: number; mlPerMin: number; source: "pumping" | "default" } {
  const fromPump = pumpingMlPerMin(logs);
  const rate = fromPump ?? DEFAULT_DBF_ML_PER_MIN;
  return {
    ml: Math.round(dbfMinutes * rate),
    mlPerMin: rate,
    source: fromPump != null ? "pumping" : "default",
  };
}
