// Cry diagnostic — rank kemungkinan penyebab bayi nangis berdasarkan
// data log yang sudah ada. Output ranked list dengan signal strength.
//
// CONSENSUS PENYEBAB BAYI NEWBORN NANGIS (urutan frekuensi):
// 1. Lapar (most common — newborn 0-3 bln)
// 2. Diaper basah/kotor
// 3. Lelah / overtired
// 4. Kembung / gas / butuh sendawa
// 5. Suhu (kepanasan/kedinginan, demam)
// 6. Overstimulated (after activity / banyak orang)
// 7. Pakaian / posisi tidak nyaman
// 8. Sakit (jaundice, infeksi, reflux, tongue tie issue, dll)
// 9. Tumbuh gigi (≥4 bulan)
// 10. Hanya butuh kontak skin-to-skin
//
// Sources:
// - AAP Healthy Children: "Why Babies Cry"
// - The Period of PURPLE Crying (National Center on Shaken Baby Syndrome)
// - Karp H. "The Happiest Baby on the Block" — 5 S's framework
// - Brazelton TB. "Touchpoints" (developmental cry patterns)
// - IDAI rekomendasi tatalaksana bayi rewel
//
// IMPORTANT NOTES:
// - Bayi <3 bulan rata-rata nangis 2-3 jam/hari (puncak 6-8 minggu)
// - Cluster crying sore-malam = "witching hour" — biological, not pathological
// - Kalau nangis >3 jam/hari, >3 hari/minggu, >3 minggu = colic (diagnosed
//   per Wessel rule of 3s)
// - Inconsolable + fever/lethargic/breathing issues = panggil DSA

import type { LogRow } from "@/lib/compute/stats";
import type { WakeAssessment } from "@/lib/constants/wake-window";
import { fmtDuration } from "@/lib/compute/format";

export type CrySignal = "strong" | "medium" | "weak" | "info";

export type CryCause = {
  id:
    | "hungry"
    | "tired"
    | "diaper"
    | "gas"
    | "fever"
    | "stim"
    | "comfort";
  label: string;
  emoji: string;
  signal: CrySignal;
  context: string;
  action?: {
    type: "logFeeding" | "logDiaper" | "logTemp" | "startSleep" | "info";
    label: string;
  };
};

const minSince = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
};

export type CryInput = {
  lastFeeding: LogRow | null;
  lastDiaper: LogRow | null;
  lastTemp: LogRow | null;
  lastBath: LogRow | null;
  lastTummy: LogRow | null;
  wakeAssessment: WakeAssessment | null;
  isSleepOngoing: boolean;
  ageDays: number;
};

/**
 * Returns ranked list of likely cry causes based on available data.
 * Signal strength = confidence based on data thresholds.
 * Always includes 'comfort' as info-level fallback.
 */
export function computeCryCauses(input: CryInput): CryCause[] {
  const causes: CryCause[] = [];

  // --- Hungry ---
  const lastFeedMin = minSince(input.lastFeeding?.timestamp);
  const hungryThresholdMin =
    input.ageDays < 30 ? 120 : input.ageDays < 90 ? 150 : 180;
  if (lastFeedMin == null) {
    causes.push({
      id: "hungry",
      label: "Mungkin lapar",
      emoji: "🍼",
      signal: "medium",
      context: "Belum ada catatan feeding hari ini",
      action: { type: "logFeeding", label: "Catat feeding" },
    });
  } else if (lastFeedMin >= hungryThresholdMin + 60) {
    causes.push({
      id: "hungry",
      label: "Sangat mungkin lapar",
      emoji: "🍼",
      signal: "strong",
      context: `Last feed ${fmtDuration(lastFeedMin)} lalu (newborn cluster bisa tiap 1-2 jam)`,
      action: { type: "logFeeding", label: "Catat feeding" },
    });
  } else if (lastFeedMin >= hungryThresholdMin) {
    causes.push({
      id: "hungry",
      label: "Mungkin lapar",
      emoji: "🍼",
      signal: "medium",
      context: `Last feed ${fmtDuration(lastFeedMin)} lalu`,
      action: { type: "logFeeding", label: "Catat feeding" },
    });
  } else {
    causes.push({
      id: "hungry",
      label: "Lapar (kemungkinan kecil)",
      emoji: "🍼",
      signal: "weak",
      context: `Last feed ${fmtDuration(lastFeedMin)} lalu — masih dalam window kenyang. Tapi cluster feeding mungkin.`,
      action: { type: "logFeeding", label: "Tetap coba" },
    });
  }

  // --- Tired / overtired ---
  if (!input.isSleepOngoing && input.wakeAssessment) {
    const w = input.wakeAssessment;
    if (w.status === "overtired") {
      causes.push({
        id: "tired",
        label: "Overtired",
        emoji: "🌙",
        signal: "strong",
        context: `Sudah ${w.awakeMin}m bangun (lewat window ${w.window.maxMin}m). Adrenaline kicks in → susah settle.`,
        action: { type: "startSleep", label: "Mulai tidur" },
      });
    } else if (w.status === "wrap_up") {
      causes.push({
        id: "tired",
        label: "Lelah · siap tidur",
        emoji: "🌙",
        signal: "medium",
        context: `${w.awakeMin}m bangun · mendekati maks window`,
        action: { type: "startSleep", label: "Mulai tidur" },
      });
    } else if (w.status === "ideal") {
      causes.push({
        id: "tired",
        label: "Mungkin ngantuk",
        emoji: "🌙",
        signal: "medium",
        context: `${w.awakeMin}m bangun · dalam window tidur ideal`,
        action: { type: "startSleep", label: "Mulai tidur" },
      });
    }
  }

  // --- Diaper ---
  const lastDiaperMin = minSince(input.lastDiaper?.timestamp);
  if (lastDiaperMin == null) {
    causes.push({
      id: "diaper",
      label: "Cek diaper",
      emoji: "🧷",
      signal: "medium",
      context: "Belum ada catatan diaper hari ini",
      action: { type: "logDiaper", label: "Cek diaper" },
    });
  } else if (lastDiaperMin >= 240) {
    causes.push({
      id: "diaper",
      label: "Mungkin diaper kotor",
      emoji: "🧷",
      signal: "strong",
      context: `Last ganti ${fmtDuration(lastDiaperMin)} lalu`,
      action: { type: "logDiaper", label: "Cek diaper" },
    });
  } else if (lastDiaperMin >= 180) {
    causes.push({
      id: "diaper",
      label: "Cek diaper",
      emoji: "🧷",
      signal: "medium",
      context: `Last ganti ${fmtDuration(lastDiaperMin)} lalu`,
      action: { type: "logDiaper", label: "Cek diaper" },
    });
  }

  // --- Gas / kembung ---
  if (lastFeedMin != null && lastFeedMin <= 30) {
    // Just-fed crying often indicates gas or need to burp
    causes.push({
      id: "gas",
      label: "Mungkin kembung / butuh sendawa",
      emoji: "💨",
      signal: "medium",
      context: `Baru selesai feed ${fmtDuration(lastFeedMin)} lalu. Coba burp tegak 10-15 menit, atau Pijat I-L-U.`,
      action: { type: "info", label: "Tips Pijat I-L-U" },
    });
  } else {
    causes.push({
      id: "gas",
      label: "Kembung / gas",
      emoji: "💨",
      signal: "weak",
      context:
        "Coba burp, gerakan kayuh sepeda, atau Pijat I-L-U searah jarum jam.",
      action: { type: "info", label: "Tips Pijat I-L-U" },
    });
  }

  // --- Fever / suhu ---
  const lastTempMin = minSince(input.lastTemp?.timestamp);
  if (input.lastTemp?.temp_celsius != null) {
    const t = Number(input.lastTemp.temp_celsius);
    if (t >= 38) {
      causes.push({
        id: "fever",
        label: "DEMAM — konsul DSA",
        emoji: "🌡️",
        signal: "strong",
        context: `Last suhu ${t}°C (${fmtDuration(lastTempMin ?? 0)} lalu). Newborn fever ≥38°C adalah emergency.`,
        action: { type: "logTemp", label: "Cek ulang suhu" },
      });
    } else if (lastTempMin == null || lastTempMin > 720) {
      causes.push({
        id: "fever",
        label: "Cek suhu",
        emoji: "🌡️",
        signal: "weak",
        context: "Belum cek suhu hari ini — bisa indikasi demam",
        action: { type: "logTemp", label: "Cek suhu" },
      });
    }
  } else {
    causes.push({
      id: "fever",
      label: "Cek suhu",
      emoji: "🌡️",
      signal: "weak",
      context: "Belum ada catatan suhu",
      action: { type: "logTemp", label: "Cek suhu" },
    });
  }

  // --- Overstimulated ---
  const lastBathMin = minSince(input.lastBath?.timestamp);
  const lastTummyMin = minSince(input.lastTummy?.timestamp);
  const recentActivity = [lastBathMin, lastTummyMin]
    .filter((m): m is number => m != null)
    .find((m) => m <= 30);
  if (recentActivity != null) {
    causes.push({
      id: "stim",
      label: "Overstimulated",
      emoji: "🌀",
      signal: "medium",
      context: `Habis aktivitas ${fmtDuration(recentActivity)} lalu. Coba ruang gelap + tenang + bedong.`,
      action: { type: "info", label: "Tips menenangkan" },
    });
  }

  // --- Comfort (always info-level fallback) ---
  causes.push({
    id: "comfort",
    label: "Atau hanya butuh kontak",
    emoji: "🤱",
    signal: "info",
    context:
      "Skin-to-skin · suara tenang · gendong · 5 S's (Swaddle, Side, Shush, Swing, Suck)",
  });

  // Sort by signal strength
  const order: Record<CrySignal, number> = {
    strong: 0,
    medium: 1,
    weak: 2,
    info: 3,
  };
  causes.sort((a, b) => order[a.signal] - order[b.signal]);

  return causes;
}
