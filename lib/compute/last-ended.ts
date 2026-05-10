// "Selesai X lalu" — when the most recent ENDED session of each
// stopwatch-able subtype finished. Used on Mulai Sekarang buttons
// (so caregiver knows the awake/gap duration before starting a new
// session) and on OngoingCard (to show gap from previous → current).

import type { LogRow } from "@/lib/compute/stats";

export type LastEndedKey = "sleep" | "dbf" | "pumping" | "hiccup" | "tummy";

export type LastEnded = Record<LastEndedKey, number | null>;

/**
 * Most recent end_timestamp per subtype. Returns ms since epoch or null.
 * - DBF = feeding with duration_l/r (NOT bottle amount_ml).
 * - Bottle feeds tidak masuk DBF gap (botol biasanya masih bisa cluster
 *   sama DBF; user mostly care soal "kapan terakhir nyusu di payudara").
 */
export function computeLastEnded(logs: LogRow[]): LastEnded {
  const out: LastEnded = {
    sleep: null,
    dbf: null,
    pumping: null,
    hiccup: null,
    tummy: null,
  };
  for (const l of logs) {
    if (l.end_timestamp == null) continue;
    const t = new Date(l.end_timestamp).getTime();
    let key: LastEndedKey | null = null;
    if (l.subtype === "sleep") key = "sleep";
    else if (l.subtype === "pumping") key = "pumping";
    else if (l.subtype === "hiccup") key = "hiccup";
    else if (l.subtype === "tummy") key = "tummy";
    else if (
      l.subtype === "feeding" &&
      (l.duration_l_min != null || l.duration_r_min != null)
    ) {
      key = "dbf";
    }
    if (!key) continue;
    const cur = out[key];
    if (cur == null || cur < t) out[key] = t;
  }
  return out;
}

/**
 * "selesai 1j 30m lalu" / "selesai 12m lalu" / "baru saja". `refMs`
 * default Date.now() — saat dihitung di server, akan static ke render
 * time (no client tick, deemed acceptable: kasih ballpark, bukan jam
 * presisi).
 */
export function fmtSelesaiLalu(
  lastEndedMs: number | null,
  refMs: number = Date.now(),
): string | null {
  if (lastEndedMs == null) return null;
  const diffMin = Math.round((refMs - lastEndedMs) / 60000);
  if (diffMin < 0) return null;
  if (diffMin < 1) return "baru saja";
  if (diffMin < 60) return `${diffMin}m lalu`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m === 0 ? `${h}j lalu` : `${h}j ${m}m lalu`;
}

/** Same as `fmtSelesaiLalu` but tanpa kata "lalu" — for inline gap. */
export function fmtGap(diffMin: number): string {
  if (diffMin < 1) return "<1m";
  if (diffMin < 60) return `${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m === 0 ? `${h}j` : `${h}j ${m}m`;
}
