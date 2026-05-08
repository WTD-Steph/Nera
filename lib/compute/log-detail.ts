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

/** Min duration buat dianggap "real sleep" (bukan catnap) saat hitung
 *  wake window sebelum tidur ini. <15 min biasanya catnap dan tidak
 *  reset wake counter biologically. */
const MIN_PREV_SLEEP_MIN = 15;

/**
 * Compute wake duration sebelum sleep ini. Skip catnap < 15 min —
 * ambil prev sleep yang punya duration ≥ MIN_PREV_SLEEP_MIN.
 * Cap 12h gap (filter outlier seperti first sleep of day).
 */
export function wakeBeforeSleepText(l: LogRow, allLogs: LogRow[]): string {
  const myTime = new Date(l.timestamp).getTime();
  const candidates = allLogs
    .filter(
      (x) =>
        x.subtype === "sleep" &&
        x.id !== l.id &&
        x.end_timestamp != null &&
        new Date(x.end_timestamp).getTime() <= myTime,
    )
    .sort(
      (a, b) =>
        new Date(b.end_timestamp!).getTime() -
        new Date(a.end_timestamp!).getTime(),
    );
  // Filter: prev sleep harus ≥ MIN_PREV_SLEEP_MIN duration. Catnap
  // tidak count sebagai "tidur beneran" yang reset wake clock.
  const prevSleep = candidates.find((x) => {
    if (!x.end_timestamp) return false;
    const durMin =
      (new Date(x.end_timestamp).getTime() -
        new Date(x.timestamp).getTime()) /
      60000;
    return durMin >= MIN_PREV_SLEEP_MIN;
  });
  if (!prevSleep || !prevSleep.end_timestamp) return "";
  const gapMin = Math.round(
    (myTime - new Date(prevSleep.end_timestamp).getTime()) / 60000,
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
      // Mix: tampil breakdown ASIP + Sufor
      if (
        l.bottle_content === "mix" &&
        (l.amount_asi_ml ?? 0) > 0 &&
        (l.amount_sufor_ml ?? 0) > 0
      ) {
        return `🍼 Mix · ASI ${l.amount_asi_ml} + Sufor ${l.amount_sufor_ml} = ${l.amount_ml} ml`;
      }
      const src =
        l.bottle_content === "asi"
          ? "ASI"
          : l.bottle_content === "sufor"
            ? "Sufor"
            : null;
      return src ? `🍼 ${src} ${l.amount_ml} ml` : `🍼 ${l.amount_ml} ml`;
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
