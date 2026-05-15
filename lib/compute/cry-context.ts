// Context hint untuk cry event banner.
//
// Saat banner muncul ("Nera menangis · baru saja"), caregiver butuh
// quick-assess kemungkinan reason tanpa harus buka app penuh. Solusi
// sederhana: surface last feed / diaper / sleep-wake times dari
// existing logs. App provide facts, parent decides reason.
//
// 80% caregiver value dari Tier 2 ML classification tanpa investment
// ML model. Aligns dengan "treat as signal, not oracle" principle.

import type { LogRow } from "@/lib/compute/stats";

export type CryContextHint = {
  /** Minutes since most recent feeding (any type). Null kalau ngga ada. */
  lastFeedMin: number | null;
  /** Minutes since most recent diaper change. Null kalau ngga ada. */
  lastDiaperMin: number | null;
  /** Minutes since most recent sleep ENDED (= sejak bangun). Null
   *  kalau lagi tidur atau belum pernah tidur. */
  lastWakeMin: number | null;
  /** True kalau ada ongoing sleep saat ini — banner show "sedang tidur"
   *  kontekstual. */
  isCurrentlySleeping: boolean;
};

/**
 * Compute context hint dari logs array, relative ke reference time
 * (defaults ke now). Caller should pass logs sudah filtered by baby_id.
 */
export function computeCryContext(
  logs: LogRow[],
  referenceTimeMs: number = Date.now(),
): CryContextHint {
  let latestFeedMs: number | null = null;
  let latestDiaperMs: number | null = null;
  let latestSleepEndMs: number | null = null;
  let ongoingSleep = false;

  for (const l of logs) {
    const t = new Date(l.timestamp).getTime();
    if (t > referenceTimeMs) continue;
    if (l.subtype === "feeding") {
      // Counts both DBF + bottle feeds (any kind dari last "fed")
      if (latestFeedMs === null || t > latestFeedMs) latestFeedMs = t;
    } else if (l.subtype === "diaper") {
      if (latestDiaperMs === null || t > latestDiaperMs) latestDiaperMs = t;
    } else if (l.subtype === "sleep") {
      if (l.end_timestamp == null) {
        // Ongoing sleep — kalau started before refTime, baby is sleeping.
        if (t <= referenceTimeMs) ongoingSleep = true;
      } else {
        const endMs = new Date(l.end_timestamp).getTime();
        if (endMs <= referenceTimeMs) {
          if (latestSleepEndMs === null || endMs > latestSleepEndMs) {
            latestSleepEndMs = endMs;
          }
        }
      }
    }
  }

  return {
    lastFeedMin: latestFeedMs ? minutesBetween(latestFeedMs, referenceTimeMs) : null,
    lastDiaperMin: latestDiaperMs
      ? minutesBetween(latestDiaperMs, referenceTimeMs)
      : null,
    lastWakeMin: latestSleepEndMs
      ? minutesBetween(latestSleepEndMs, referenceTimeMs)
      : null,
    isCurrentlySleeping: ongoingSleep,
  };
}

function minutesBetween(earlierMs: number, laterMs: number): number {
  return Math.max(0, Math.round((laterMs - earlierMs) / 60_000));
}

/** Compact display format: "2j 30m" atau "45m" */
export function fmtMinAge(min: number | null): string {
  if (min === null) return "—";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}j` : `${h}j ${m}m`;
}
