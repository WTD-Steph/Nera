// Shared log detail formatter — used by home page (Aktivitas Terbaru)
// AND /history page. Single source of truth supaya display konsisten.
//
// Sebelumnya tiap page punya logDetail sendiri, /history miss banyak
// detail (mix breakdown, pumping rate, DBF effectiveness emoji,
// bath checklist, hiccup/tummy label, wake-before-sleep).

import type { LogRow } from "@/lib/compute/stats";
import {
  fmtSleepRange,
  pumpDur,
} from "@/lib/compute/format";
import {
  EFFECTIVENESS_EMOJIS,
  type EffectivenessLevel,
} from "@/lib/compute/dbf-effectiveness";

/** Threshold untuk merge sleeps jadi 1 cluster. Sleep dengan gap antar
 *  ≤ 30 menit dianggap satu sesi tidur (catnap + recall back to sleep,
 *  atau brief wake yang tidak fully alert). 30 menit konservatif —
 *  bayi yang awake >30m biasanya mostly alert + reset wake clock. */
const SLEEP_CLUSTER_GAP_MIN = 30;

/**
 * Group sleeps ke clusters: sleep dengan gap antar end → next.start
 * ≤ SLEEP_CLUSTER_GAP_MIN dianggap satu cluster. Returns sorted asc.
 */
function buildSleepClusters(
  allLogs: LogRow[],
  includeOngoingId?: string,
): { firstStart: number; lastEnd: number; ids: Set<string> }[] {
  const sleeps = allLogs
    .filter((x) => {
      if (x.subtype !== "sleep") return false;
      // Include ongoing only if it's the row being assessed
      if (x.end_timestamp == null) {
        return includeOngoingId === x.id;
      }
      return true;
    })
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  const clusters: {
    firstStart: number;
    lastEnd: number;
    ids: Set<string>;
  }[] = [];
  for (const s of sleeps) {
    const start = new Date(s.timestamp).getTime();
    // For ongoing sleep being assessed, treat lastEnd = start (wake-before
    // is computed from start anyway; ongoing doesn't have a real end yet).
    const end = s.end_timestamp ? new Date(s.end_timestamp).getTime() : start;
    const last = clusters[clusters.length - 1];
    if (last && (start - last.lastEnd) / 60000 <= SLEEP_CLUSTER_GAP_MIN) {
      last.lastEnd = Math.max(last.lastEnd, end);
      last.ids.add(s.id);
    } else {
      clusters.push({ firstStart: start, lastEnd: end, ids: new Set([s.id]) });
    }
  }
  return clusters;
}

/**
 * Compute wake duration sebelum sleep ini. Pakai cluster logic — catnap
 * yang berdekatan (≤30m gap) dengan sleep ini di-merge jadi satu cluster.
 * Wake-before = thisCluster.firstStart − prevCluster.lastEnd.
 *
 * Contoh: catnap 16:47→16:54 + main sleep 17:11→sekarang → 1 cluster
 * mulai 16:47. Prev cluster end 15:43 → wake-before = 1j 4m.
 *
 * Cap 12h gap (filter outlier — first sleep of day).
 */
export function wakeBeforeSleepText(l: LogRow, allLogs: LogRow[]): string {
  if (l.subtype !== "sleep") return "";
  const clusters = buildSleepClusters(allLogs, l.id);
  // Find cluster containing this sleep
  const myIdx = clusters.findIndex((c) => c.ids.has(l.id));
  if (myIdx < 0) return "";
  const myCluster = clusters[myIdx]!;
  const prevCluster = clusters[myIdx - 1];
  if (!prevCluster) return "";
  const gapMin = Math.round(
    (myCluster.firstStart - prevCluster.lastEnd) / 60000,
  );
  if (gapMin <= 0 || gapMin > 12 * 60) return "";
  const h = Math.floor(gapMin / 60);
  const m = gapMin % 60;
  const fmt = h === 0 ? `${m}m` : m === 0 ? `${h}j` : `${h}j ${m}m`;
  return ` · awake ${fmt} sebelum tidur`;
}

/**
 * Format compact log detail untuk Aktivitas Terbaru / History row.
 * dbfRate: ml/menit dari priority chain (untuk DBF estimate).
 * allLogs: needed untuk wake-before-sleep lookup; pass empty array
 *   kalau tidak available (will skip wake-before).
 */
export function logDetail(
  l: LogRow,
  dbfRate: number,
  allLogs: LogRow[] = [],
): string {
  const isOngoing = l.end_timestamp === null;

  if (l.subtype === "feeding") {
    if (l.amount_ml != null) {
      const spillSuffix = (() => {
        const spilled = l.amount_spilled_ml ?? 0;
        if (spilled <= 0) return "";
        const label = (() => {
          if (l.bottle_content === "asi") return "ASI";
          if (l.bottle_content === "sufor") return "Sufor";
          if (l.bottle_content === "mix") {
            if (l.spilled_attribution === "asi") return "ASI";
            if (l.spilled_attribution === "sufor") return "Sufor";
            return "Mix";
          }
          return null;
        })();
        return label
          ? ` · ${spilled}ml tumpah ${label}`
          : ` · ${spilled}ml tumpah`;
      })();
      // Mix: tampil breakdown ASIP + Sufor
      if (
        l.bottle_content === "mix" &&
        (l.amount_asi_ml ?? 0) > 0 &&
        (l.amount_sufor_ml ?? 0) > 0
      ) {
        return `🍼 Mix · ASI ${l.amount_asi_ml} + Sufor ${l.amount_sufor_ml} = ${l.amount_ml} ml${spillSuffix}`;
      }
      const src =
        l.bottle_content === "asi"
          ? "ASI"
          : l.bottle_content === "sufor"
            ? "Sufor"
            : null;
      return src
        ? `🍼 ${src} ${l.amount_ml} ml${spillSuffix}`
        : `🍼 ${l.amount_ml} ml${spillSuffix}`;
    }
    if (isOngoing && (l.start_l_at || l.start_r_at)) {
      const lActive = !!l.start_l_at && !l.end_l_at;
      const rActive = !!l.start_r_at && !l.end_r_at;
      if (lActive && rActive) return `🤱 Dua sisi aktif`;
      if (lActive) return `🤱 Kiri aktif`;
      if (rActive) return `🤱 Kanan aktif`;
      return `🤱 berlangsung`;
    }
    const fmtSide = (
      mins: number | null,
      startAt: string | null,
      endAt: string | null,
    ): string | null => {
      if (mins == null && !startAt) return null;
      const m = mins ?? 0;
      if (m === 0 && startAt && endAt) {
        const sec = Math.round(
          (new Date(endAt).getTime() - new Date(startAt).getTime()) / 1000,
        );
        if (sec >= 1 && sec < 60) return `${sec}s (≈0 ml)`;
      }
      const ml = Math.round(m * dbfRate);
      return `${m}m (≈${ml} ml)`;
    };
    const lFmt = fmtSide(l.duration_l_min, l.start_l_at, l.end_l_at);
    const rFmt = fmtSide(l.duration_r_min, l.start_r_at, l.end_r_at);
    const effSuffix = l.effectiveness
      ? ` · ${EFFECTIVENESS_EMOJIS[l.effectiveness as EffectivenessLevel]}`
      : "";
    if (!lFmt && !rFmt) return `🤱 (kosong)${effSuffix}`;
    if (!lFmt) return `🤱 R ${rFmt}${effSuffix}`;
    if (!rFmt) return `🤱 L ${lFmt}${effSuffix}`;
    return `🤱 L ${lFmt} | R ${rFmt}${effSuffix}`;
  }

  if (l.subtype === "pumping") {
    if (isOngoing) {
      const lActive = !!l.start_l_at && !l.end_l_at;
      const rActive = !!l.start_r_at && !l.end_r_at;
      if (lActive && rActive) return `Dua sisi aktif`;
      if (lActive) return `Kiri aktif`;
      if (rActive) return `Kanan aktif`;
      return `berlangsung`;
    }
    const lDur = pumpDur(l.start_l_at, l.end_l_at);
    const rDur = pumpDur(l.start_r_at, l.end_r_at);
    const lUsed = l.amount_l_ml != null || !!l.start_l_at;
    const rUsed = l.amount_r_ml != null || !!l.start_r_at;
    const sideStr = (
      sideLabel: string,
      ml: number,
      dur: number | null,
    ): string => {
      const durPart = dur ? ` · ${dur} mnt` : "";
      const ratePart =
        dur && dur > 0 && ml > 0 ? ` · ${(ml / dur).toFixed(1)} ml/m` : "";
      return `${sideLabel} ${ml} ml${durPart}${ratePart}`;
    };
    const lFmt = lUsed ? sideStr("L", l.amount_l_ml ?? 0, lDur) : null;
    const rFmt = rUsed ? sideStr("R", l.amount_r_ml ?? 0, rDur) : null;
    if (!lFmt && !rFmt) return "(kosong)";
    if (!lFmt) return rFmt!;
    if (!rFmt) return lFmt;
    return `${lFmt} | ${rFmt}`;
  }

  if (l.subtype === "diaper") {
    const parts: string[] = [];
    if (l.has_pee) parts.push("💛");
    if (l.has_poop) {
      const p = [l.poop_color, l.poop_consistency].filter(Boolean).join(" ");
      parts.push(p ? `💩 ${p}` : "💩");
    }
    return parts.join(" + ");
  }

  if (l.subtype === "sleep") {
    const range = fmtSleepRange(l.timestamp, l.end_timestamp);
    const quality =
      l.sleep_quality === "nyenyak"
        ? " · 😴 nyenyak"
        : l.sleep_quality === "gelisah"
          ? " · 😣 gelisah"
          : l.sleep_quality === "sering_bangun"
            ? " · 😢 sering bangun"
            : "";
    const wakeBefore = wakeBeforeSleepText(l, allLogs);
    return `${range}${wakeBefore}${quality}`;
  }

  if (l.subtype === "temp") return `${l.temp_celsius}°C`;
  if (l.subtype === "med")
    return [l.med_name, l.med_dose].filter(Boolean).join(" ");
  if (l.subtype === "bath") {
    const parts: string[] = [];
    if (l.bath_pijat_ilu) parts.push("✓ pijat I-L-U");
    if (l.bath_clean_tali_pusat) parts.push("✓ tali pusat");
    return parts.join(" · ");
  }
  if (l.subtype === "hiccup") return "🫨";
  if (l.subtype === "tummy") return "🐢";
  return "";
}
