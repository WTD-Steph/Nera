// Sleep coach — analyze 7–14 day sleep + feeding data, generate
// ranked actionable findings.
//
// SCIENCE BASIS:
// - Weissbluth M. "Healthy Sleep Habits, Happy Child" — wake windows,
//   bedtime consistency, sleep consolidation
// - Mindell JA et al. Sleep 2009;32(5):599 — bedtime routine impact
// - Mindell JA, Kuhn B et al. Pediatrics 2006;117(5):e1223 — extinction
//   methods + behavioral sleep interventions
// - AAP Healthy Sleep Habits — age-based total sleep targets
// - Sleep Foundation consensus
// - Hookway L. "Holistic Sleep Coaching" — responsive baby-led approach
//
// METHODOLOGY:
// Look-back window 7 hari (configurable). Analyze:
// 1. Wake window compliance vs age
// 2. Total sleep vs target
// 3. Day vs night ratio
// 4. Longest night stretch
// 5. Bedtime consistency (SD of bedtime hour)
// 6. Pre-bed feeding pattern
//
// Each finding produces structured object dengan: level, title,
// finding, action items. Ranked by priority (concern first).

import type { LogRow } from "@/lib/compute/stats";
import {
  getWakeWindow,
  type WakeWindow,
} from "@/lib/constants/wake-window";
import { getTargetForAge } from "@/lib/constants/daily-targets";

export type CoachLevel = "good" | "opportunity" | "concern";

export type CoachFinding = {
  id: string;
  level: CoachLevel;
  emoji: string;
  title: string;
  finding: string;
  actions: string[];
};

export type SleepCoachReport = {
  windowDays: number;
  ageDays: number;
  wakeWindow: WakeWindow;
  totalSleepHoursPerDay: number;
  targetSleepHoursMin: number;
  targetSleepHoursMax: number;
  dayNightRatio: { dayPct: number; nightPct: number };
  longestNightStretchMin: number;
  bedtimeConsistencyMin: number;
  findings: CoachFinding[];
};

const NIGHT_START_H = 19; // 19:00
const NIGHT_END_H = 7; // 07:00

function jakartaHour(iso: string): number {
  const t = new Date(iso).getTime();
  const local = new Date(t + 7 * 60 * 60 * 1000);
  return local.getUTCHours();
}

/** Returns timestamp clamped to last 7 days. */
function windowStartMs(daysBack: number): number {
  return Date.now() - daysBack * 86400000;
}

/**
 * Compute fraction of a sleep session that falls within night hours
 * (19:00–07:00 Jakarta). Cross-day sessions split appropriately.
 */
function nightFraction(startIso: string, endIso: string): number {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (endMs <= startMs) return 0;
  const totalMs = endMs - startMs;
  let nightMs = 0;
  // Sample at 5-minute granularity (cheap)
  const stepMs = 5 * 60 * 1000;
  for (let t = startMs; t < endMs; t += stepMs) {
    const h = jakartaHour(new Date(t).toISOString());
    const isNight = h >= NIGHT_START_H || h < NIGHT_END_H;
    if (isNight) nightMs += Math.min(stepMs, endMs - t);
  }
  return nightMs / totalMs;
}

export function analyzeSleep(
  logs: LogRow[],
  babyDob: string,
  windowDays: number = 7,
): SleepCoachReport {
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(babyDob).getTime()) / 86400000),
  );
  const wakeWindow = getWakeWindow(babyDob);
  const target = getTargetForAge(babyDob);
  const startMs = windowStartMs(windowDays);

  const sleeps = logs
    .filter(
      (l) =>
        l.subtype === "sleep" &&
        l.end_timestamp != null &&
        new Date(l.timestamp).getTime() >= startMs,
    )
    .map((l) => ({
      start: new Date(l.timestamp).getTime(),
      end: new Date(l.end_timestamp!).getTime(),
      durationMin:
        (new Date(l.end_timestamp!).getTime() -
          new Date(l.timestamp).getTime()) /
        60000,
      startIso: l.timestamp,
      endIso: l.end_timestamp!,
      quality: l.sleep_quality,
    }))
    .sort((a, b) => a.start - b.start);

  // Total sleep per day average
  const totalSleepMin = sleeps.reduce((s, x) => s + x.durationMin, 0);
  const totalSleepHoursPerDay = totalSleepMin / 60 / windowDays;

  // Day vs night ratio
  let dayMin = 0;
  let nightMin = 0;
  for (const s of sleeps) {
    const nf = nightFraction(s.startIso, s.endIso);
    nightMin += s.durationMin * nf;
    dayMin += s.durationMin * (1 - nf);
  }
  const total = dayMin + nightMin || 1;
  const dayNightRatio = {
    dayPct: Math.round((dayMin / total) * 100),
    nightPct: Math.round((nightMin / total) * 100),
  };

  // Longest night stretch — find longest sleep that's mostly night (>50% night)
  const nightStretches = sleeps.filter(
    (s) => nightFraction(s.startIso, s.endIso) > 0.5,
  );
  const longestNightStretchMin =
    nightStretches.length > 0
      ? Math.max(...nightStretches.map((s) => s.durationMin))
      : 0;

  // Bedtime consistency — SD of bedtime hour for "first night sleep"
  // each day. Simplified: take all sleeps that start after 18:00 OR
  // before 02:00, group by date, take earliest.
  const bedtimes: number[] = [];
  const bedtimesByDate = new Map<string, number>();
  for (const s of sleeps) {
    const h = jakartaHour(s.startIso);
    // night sleep candidate: 18:00–02:00 Jakarta
    const isNightCandidate = h >= 18 || h < 2;
    if (!isNightCandidate) continue;
    const local = new Date(s.start + 7 * 60 * 60 * 1000);
    // Map bedtime to "evening before" date if hour is past midnight
    const dateKey =
      h < 2
        ? new Date(local.getTime() - 86400000).toISOString().slice(0, 10)
        : local.toISOString().slice(0, 10);
    // Convert bedtime hour to continuous range (e.g. 23:30 → 23.5,
    // 01:00 → 25.0 untuk bisa di-average)
    const minutes = local.getUTCMinutes();
    const continuous = h < 2 ? h + 24 + minutes / 60 : h + minutes / 60;
    if (!bedtimesByDate.has(dateKey)) {
      bedtimesByDate.set(dateKey, continuous);
    } else {
      const existing = bedtimesByDate.get(dateKey)!;
      if (continuous < existing) bedtimesByDate.set(dateKey, continuous);
    }
  }
  for (const v of bedtimesByDate.values()) bedtimes.push(v);
  const bedtimeMean =
    bedtimes.length > 0
      ? bedtimes.reduce((s, v) => s + v, 0) / bedtimes.length
      : 0;
  const bedtimeVariance =
    bedtimes.length > 1
      ? bedtimes.reduce((s, v) => s + (v - bedtimeMean) ** 2, 0) /
        bedtimes.length
      : 0;
  const bedtimeConsistencyMin = Math.sqrt(bedtimeVariance) * 60;

  // Wake window compliance — for each consecutive pair of sleeps
  // (chronological), compute gap between prev.end → next.start.
  // Count how many fall within ideal window (minMin..maxMin), how many
  // overtired (>maxMin).
  let inRangeCount = 0;
  let overtiredCount = 0;
  let totalWakeAssessments = 0;
  for (let i = 1; i < sleeps.length; i++) {
    const prev = sleeps[i - 1]!;
    const cur = sleeps[i]!;
    const gapMin = (cur.start - prev.end) / 60000;
    if (gapMin <= 5 || gapMin > 6 * 60) continue; // skip cluster + huge gaps
    totalWakeAssessments += 1;
    if (gapMin >= wakeWindow.minMin && gapMin <= wakeWindow.maxMin) {
      inRangeCount += 1;
    } else if (gapMin > wakeWindow.maxMin) {
      overtiredCount += 1;
    }
  }

  // Pre-bed feeding pattern: does last feed before night sleep fall
  // within 30 min? (Cluster feeding pre-bed correlates with longer
  // first stretch.)
  const feedings = logs
    .filter(
      (l) =>
        l.subtype === "feeding" &&
        new Date(l.timestamp).getTime() >= startMs,
    )
    .map((l) => new Date(l.timestamp).getTime())
    .sort((a, b) => a - b);
  let preBedFeeds = 0;
  let preBedNightSleeps = 0;
  for (const s of sleeps) {
    if (nightFraction(s.startIso, s.endIso) <= 0.5) continue;
    preBedNightSleeps += 1;
    const lastFeed = feedings.filter((t) => t <= s.start).pop();
    if (lastFeed && (s.start - lastFeed) / 60000 <= 30) preBedFeeds += 1;
  }
  const preBedFeedRatio =
    preBedNightSleeps > 0 ? preBedFeeds / preBedNightSleeps : 0;

  // Build findings
  const findings: CoachFinding[] = [];

  // 1. Wake window compliance
  if (totalWakeAssessments >= 5) {
    const overtiredPct = (overtiredCount / totalWakeAssessments) * 100;
    if (overtiredPct >= 40) {
      findings.push({
        id: "wake-overtired",
        level: "concern",
        emoji: "🌙",
        title: "Sering overtired",
        finding: `${Math.round(overtiredPct)}% sesi pernah lewat wake window (>${wakeWindow.maxMin}m). Adrenaline + cortisol spike bikin susah settle + fragmented sleep.`,
        actions: [
          `Mulai settle ${wakeWindow.maxMin - 10}m setelah bangun (sebelum maks ${wakeWindow.maxMin}m)`,
          "Watch for sleep cues: yawning, eye rubbing, zoning out — settle BEFORE crying",
          "Konsistensikan rutinitas singkat: dim lights → swaddle → shush",
        ],
      });
    } else if (overtiredPct >= 20) {
      findings.push({
        id: "wake-borderline",
        level: "opportunity",
        emoji: "🌙",
        title: "Wake window borderline",
        finding: `${Math.round(overtiredPct)}% sesi over ${wakeWindow.maxMin}m. Trend masuk overtired — adjust upstream.`,
        actions: [
          `Aim settle dalam window ${wakeWindow.minMin}–${wakeWindow.maxMin}m`,
          "Manfaatin Wake Window banner di home untuk timing",
        ],
      });
    } else if (inRangeCount / totalWakeAssessments >= 0.6) {
      findings.push({
        id: "wake-good",
        level: "good",
        emoji: "✓",
        title: "Wake window on track",
        finding: `${Math.round((inRangeCount / totalWakeAssessments) * 100)}% sesi dalam window ${wakeWindow.minMin}–${wakeWindow.maxMin}m. Pertahankan.`,
        actions: ["Lanjut pattern saat ini"],
      });
    }
  }

  // 2. Total sleep vs target
  const targetMid = (target.sleepHoursMin + target.sleepHoursMax) / 2;
  const sleepDeficit = target.sleepHoursMin - totalSleepHoursPerDay;
  if (sleepDeficit >= 1) {
    findings.push({
      id: "sleep-deficit",
      level: "concern",
      emoji: "😴",
      title: `Kurang ${sleepDeficit.toFixed(1)} jam/hari`,
      finding: `Total tidur ${totalSleepHoursPerDay.toFixed(1)} jam/hari · target ${target.sleepHoursMin}–${target.sleepHoursMax} jam.`,
      actions: [
        "Cek wake window — overtired bikin tidur fragmented",
        "Lihat tahap day naps — newborn 0-3 mo butuh 3-5 nap/hari",
        "Pre-bed routine konsisten + dim environment",
      ],
    });
  } else if (totalSleepHoursPerDay >= target.sleepHoursMin) {
    findings.push({
      id: "sleep-on-target",
      level: "good",
      emoji: "✓",
      title: "Total tidur sesuai target",
      finding: `${totalSleepHoursPerDay.toFixed(1)} jam/hari · range ${target.sleepHoursMin}–${target.sleepHoursMax}.`,
      actions: ["Lanjutkan rutinitas saat ini"],
    });
  }
  void targetMid;

  // 3. Day-night ratio
  // Newborn 0-3 mo: night 50-55% normal. By 3-4 mo, target 60-65%.
  const targetNightPct = ageDays < 90 ? 50 : ageDays < 180 ? 60 : 65;
  if (sleeps.length >= 5) {
    if (dayNightRatio.nightPct < targetNightPct - 10) {
      findings.push({
        id: "day-night-flip",
        level: "opportunity",
        emoji: "☀️",
        title: "Day-night belum konsolidasi",
        finding: `Night sleep cuma ${dayNightRatio.nightPct}% (target ≥${targetNightPct}% untuk usia ini). Bayi mungkin masih day-night reversed.`,
        actions: [
          "Ekspos cahaya pagi (07:00-09:00) jelas — bantu reset circadian",
          "Day naps di terang + ada suara normal; night sleep di gelap + tenang",
          "Hindari extended night feeds (chatter / play) — keep boring",
        ],
      });
    } else if (dayNightRatio.nightPct >= targetNightPct) {
      findings.push({
        id: "day-night-good",
        level: "good",
        emoji: "✓",
        title: "Day-night ratio on track",
        finding: `${dayNightRatio.nightPct}% night vs ${dayNightRatio.dayPct}% day. Target ≥${targetNightPct}%.`,
        actions: ["Pertahankan light/dark cues"],
      });
    }
  }

  // 4. Longest night stretch — milestone progress
  if (longestNightStretchMin >= 60) {
    const hours = longestNightStretchMin / 60;
    if (ageDays < 90 && hours >= 4) {
      findings.push({
        id: "long-stretch-good",
        level: "good",
        emoji: "🎯",
        title: `Stretch terpanjang ${hours.toFixed(1)} jam`,
        finding: `Newborn (${ageDays}d) udah punya stretch ${hours.toFixed(1)}j — di atas average usia ini.`,
        actions: ["Pertahankan pre-bed cluster feed + dim environment"],
      });
    } else if (ageDays >= 90 && hours < 4) {
      findings.push({
        id: "long-stretch-short",
        level: "opportunity",
        emoji: "⏱️",
        title: "Stretch malam pendek",
        finding: `Stretch terpanjang ${hours.toFixed(1)}j. Usia ${ageDays}d biasanya bisa 4-6j.`,
        actions: [
          "Cek apakah ada pola lapar di pertengahan malam — full feed sebelum bedtime bantu",
          "Dream feed (10-11 PM) bisa extend stretch ke pagi",
          "Pertahankan dim + minim interaksi saat night wake",
        ],
      });
    }
  }

  // 5. Bedtime consistency
  if (bedtimes.length >= 4) {
    if (bedtimeConsistencyMin > 60) {
      findings.push({
        id: "bedtime-drift",
        level: "opportunity",
        emoji: "🕐",
        title: "Bedtime drift",
        finding: `Variasi bedtime ±${Math.round(bedtimeConsistencyMin)}m. Konsistensi <30m correlate dengan settle lebih cepat.`,
        actions: [
          `Aim bedtime same ±15m setiap hari (sekarang variasi ${Math.round(bedtimeConsistencyMin)}m)`,
          "Pre-bed routine 30m sebelum: mandi → menyusu → swaddle → kamar gelap",
          "Timing cue circadian: aim sama-sama tiap hari",
        ],
      });
    } else if (bedtimeConsistencyMin < 30) {
      findings.push({
        id: "bedtime-stable",
        level: "good",
        emoji: "✓",
        title: "Bedtime konsisten",
        finding: `Variasi bedtime ±${Math.round(bedtimeConsistencyMin)}m · bagus untuk circadian + sleep onset.`,
        actions: ["Pertahankan timing"],
      });
    }
  }

  // 6. Pre-bed feeding pattern
  if (preBedNightSleeps >= 3) {
    if (preBedFeedRatio < 0.5) {
      findings.push({
        id: "pre-bed-feed",
        level: "opportunity",
        emoji: "🍼",
        title: "Tank-up sebelum tidur",
        finding: `Cuma ${Math.round(preBedFeedRatio * 100)}% night sleep didahului feed dalam 30m. Cluster feed pre-bed correlate dengan stretch lebih panjang.`,
        actions: [
          "Cluster feed jam 17:00-19:00 (multiple short feeds)",
          "Full feed dengan top-up sebelum settle untuk bedtime",
          "Hindari rushing feed — beri waktu untuk full",
        ],
      });
    }
  }

  // Sort: concern → opportunity → good
  const order: Record<CoachLevel, number> = {
    concern: 0,
    opportunity: 1,
    good: 2,
  };
  findings.sort((a, b) => order[a.level] - order[b.level]);

  return {
    windowDays,
    ageDays,
    wakeWindow,
    totalSleepHoursPerDay,
    targetSleepHoursMin: target.sleepHoursMin,
    targetSleepHoursMax: target.sleepHoursMax,
    dayNightRatio,
    longestNightStretchMin,
    bedtimeConsistencyMin,
    findings,
  };
}
