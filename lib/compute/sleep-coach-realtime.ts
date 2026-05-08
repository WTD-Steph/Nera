// Real-time sleep coach — concrete in-the-moment recommendations
// based on baby's CURRENT state. Output: 'coba tidurkan' / 'coba
// bangunkan' / 'biarkan' / 'cek dulu' dengan reasoning.
//
// METHODOLOGY:
// Look at:
// 1. Current sleep state (ongoing? duration so far?)
// 2. Wake window assessment (if awake)
// 3. Time since last feed
// 4. Time of day (Jakarta) — day phase context
// 5. Day nap accumulated
//
// Decision tree picks PRIMARY action. Other observations go to
// 'details' so caregiver gets full context.

import type { LogRow } from "@/lib/compute/stats";
import { getWakeWindow } from "@/lib/constants/wake-window";
import { fmtDuration } from "@/lib/compute/format";

export type RealtimeAction = "settle" | "wake" | "wait" | "check";

export type RealtimeAdvice = {
  action: RealtimeAction;
  emoji: string;
  primary: string;
  reason: string;
  details: string[];
  /** ok: routine, warn: should consider, alert: time-sensitive */
  tone: "ok" | "warn" | "alert";
};

const DAY_PHASE_NIGHT_START = 19;
const DAY_PHASE_NIGHT_END = 6;

function jakartaHour(now: Date = new Date()): number {
  const local = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return local.getUTCHours();
}

function isNightHour(h: number): boolean {
  return h >= DAY_PHASE_NIGHT_START || h < DAY_PHASE_NIGHT_END;
}

/** Max recommended single nap duration (day) per age. */
function maxDayNapMin(ageDays: number): number {
  if (ageDays < 30) return 150; // 2.5h newborn (still sleep heavy)
  if (ageDays < 90) return 120; // 2h
  if (ageDays < 180) return 105; // 1.75h
  if (ageDays < 365) return 90; // 1.5h
  return 90;
}

/** Hunger threshold (max gap between feeds) per age. */
function hungerThresholdMin(ageDays: number): number {
  if (ageDays < 30) return 180; // 3h newborn
  if (ageDays < 90) return 210; // 3.5h
  if (ageDays < 180) return 240; // 4h
  return 300; // 5h
}

export function computeRealtimeAdvice(
  logs: LogRow[],
  babyDob: string,
): RealtimeAdvice {
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(babyDob).getTime()) / 86400000),
  );
  const now = Date.now();
  const wakeWindow = getWakeWindow(babyDob);
  const currentHour = jakartaHour();
  const isNight = isNightHour(currentHour);

  // Sort logs desc for quick lookups
  const sleeps = logs
    .filter((l) => l.subtype === "sleep")
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  const feedings = logs
    .filter((l) => l.subtype === "feeding")
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

  // Current sleep state
  const ongoingSleep = sleeps.find((s) => s.end_timestamp == null);
  const lastSleepEnded = sleeps.find((s) => s.end_timestamp != null);
  const lastFeedTs =
    feedings.length > 0 ? new Date(feedings[0]!.timestamp).getTime() : null;
  const minSinceLastFeed = lastFeedTs
    ? Math.round((now - lastFeedTs) / 60000)
    : null;

  // Detail observations — surfaced regardless of primary action
  const details: string[] = [];

  // === ONGOING SLEEP CASE ===
  if (ongoingSleep) {
    const sleepStart = new Date(ongoingSleep.timestamp).getTime();
    const sleepDurMin = Math.round((now - sleepStart) / 60000);
    const napMaxMin = maxDayNapMin(ageDays);
    const hungerMax = hungerThresholdMin(ageDays);

    details.push(`Sudah tidur ${fmtDuration(sleepDurMin)}`);
    if (minSinceLastFeed != null) {
      details.push(`Last feed ${fmtDuration(minSinceLastFeed)} lalu`);
    }

    // Wake reasons — ranked by urgency
    if (minSinceLastFeed != null && minSinceLastFeed >= hungerMax + 60) {
      return {
        action: "wake",
        emoji: "🍼",
        primary: "Coba bangunkan untuk feed",
        reason: `Sudah ${fmtDuration(minSinceLastFeed)} sejak last feed (max ${fmtDuration(hungerMax)} usia ini). Newborn perlu feed teratur untuk weight gain.`,
        details,
        tone: "alert",
      };
    }

    if (!isNight && sleepDurMin > napMaxMin) {
      return {
        action: "wake",
        emoji: "☀️",
        primary: "Coba bangunkan — nap kepanjangan",
        reason: `Day nap ${fmtDuration(sleepDurMin)} (max ${fmtDuration(napMaxMin)} usia ini). Nap kelamaan bisa interfere dengan tidur malam + bedtime drift.`,
        details,
        tone: "warn",
      };
    }

    if (
      !isNight &&
      currentHour >= 17 &&
      currentHour < 19 &&
      sleepDurMin > 30
    ) {
      return {
        action: "wake",
        emoji: "🌅",
        primary: "Coba bangunkan — sore mendekati bedtime",
        reason: `Sekarang jam ${currentHour}:xx, masih napping. Bangunkan supaya tidur malam jam normal (19-20) + cluster feed sebelum tidur.`,
        details,
        tone: "warn",
      };
    }

    if (
      minSinceLastFeed != null &&
      minSinceLastFeed >= hungerMax &&
      sleepDurMin > 30
    ) {
      return {
        action: "wake",
        emoji: "🍼",
        primary: "Pertimbangkan bangunkan untuk feed",
        reason: `${fmtDuration(minSinceLastFeed)} sejak last feed mendekati maks ${fmtDuration(hungerMax)}. Kalau bayi belum gain weight optimal, prioritaskan feed.`,
        details,
        tone: "warn",
      };
    }

    return {
      action: "wait",
      emoji: "💤",
      primary: "Biarkan tidur",
      reason: isNight
        ? "Malam — sleep accumulating untuk consolidation. Watch tapi jangan ganggu."
        : `Day nap ${fmtDuration(sleepDurMin)} dalam range. Belum perlu intervensi.`,
      details,
      tone: "ok",
    };
  }

  // === AWAKE CASE ===
  if (lastSleepEnded?.end_timestamp) {
    const wakeStart = new Date(lastSleepEnded.end_timestamp).getTime();
    const awakeMin = Math.round((now - wakeStart) / 60000);
    details.push(`Sudah ${fmtDuration(awakeMin)} bangun`);
    details.push(
      `Wake window ${wakeWindow.minMin}–${wakeWindow.maxMin}m (usia ${wakeWindow.label})`,
    );
    if (minSinceLastFeed != null) {
      details.push(`Last feed ${fmtDuration(minSinceLastFeed)} lalu`);
    }

    // Settle reasons — ranked by urgency
    if (awakeMin > wakeWindow.maxMin) {
      return {
        action: "settle",
        emoji: "🚨",
        primary: "Coba tidurkan SEKARANG — overtired",
        reason: `Sudah ${fmtDuration(awakeMin)} bangun, lewat maks window ${wakeWindow.maxMin}m. Adrenaline + cortisol kicks in → susah settle, fragmented sleep.`,
        details,
        tone: "alert",
      };
    }

    if (awakeMin >= wakeWindow.maxMin - 10) {
      return {
        action: "settle",
        emoji: "🌙",
        primary: "Mulai persiapkan tidur",
        reason: `${fmtDuration(awakeMin)} bangun · mendekati maks window ${wakeWindow.maxMin}m. Mulai dim lights + swaddle sekarang sebelum overtired.`,
        details,
        tone: "warn",
      };
    }

    if (awakeMin >= wakeWindow.minMin) {
      return {
        action: "settle",
        emoji: "🌙",
        primary: "Window tidur — saat baik untuk settle",
        reason: `${fmtDuration(awakeMin)} bangun · dalam window ideal ${wakeWindow.minMin}–${wakeWindow.maxMin}m. Watch sleep cues (yawn, eye rub).`,
        details,
        tone: "ok",
      };
    }

    // Approaching bedtime hour (newborn target ~19:00-20:00)
    if (currentHour >= 18 && currentHour < 20 && awakeMin >= 30) {
      return {
        action: "settle",
        emoji: "🌅",
        primary: "Mendekati bedtime · pre-bed routine",
        reason: `Jam ${currentHour}:xx · ${fmtDuration(awakeMin)} bangun. Mulai pre-bed: cluster feed → mandi → swaddle → kamar gelap.`,
        details,
        tone: "warn",
      };
    }

    // Just-fed sleep cues window (15-30 min after feed = often drowsy)
    if (
      minSinceLastFeed != null &&
      minSinceLastFeed >= 15 &&
      minSinceLastFeed <= 30 &&
      awakeMin >= wakeWindow.minMin / 2
    ) {
      return {
        action: "wait",
        emoji: "👀",
        primary: "Watch sleep cues",
        reason: `${fmtDuration(minSinceLastFeed)} setelah feed · biasanya bayi drowsy 15-30m setelah kenyang. Cek yawn / eye rub / gaze drift.`,
        details,
        tone: "ok",
      };
    }

    // Hunger check
    if (minSinceLastFeed != null && minSinceLastFeed >= hungerThresholdMin(ageDays)) {
      return {
        action: "check",
        emoji: "🍼",
        primary: "Cek lapar — tawarkan feed",
        reason: `${fmtDuration(minSinceLastFeed)} sejak last feed (max ${fmtDuration(hungerThresholdMin(ageDays))}). Cek hunger cues (rooting, hands to mouth).`,
        details,
        tone: "warn",
      };
    }

    return {
      action: "wait",
      emoji: "✓",
      primary: "Biarkan awake — masih segar",
      reason: `${fmtDuration(awakeMin)} bangun · belum mendekati window. Aktivitas normal: tummy time, social interaction, observasi sleep cues.`,
      details,
      tone: "ok",
    };
  }

  // === NO RECENT SLEEP DATA ===
  return {
    action: "check",
    emoji: "📋",
    primary: "Belum ada tidur tercatat",
    reason:
      "Catat sleep terbaru supaya coach bisa kasih saran realtime. Pakai 🌙 'Mulai sekarang Tidur' atau Catat Cepat.",
    details: [],
    tone: "warn",
  };
}
