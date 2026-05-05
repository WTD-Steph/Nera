// Wake window (jendela bangun) — durasi maksimal bayi tetap awake
// antara dua sesi tidur sebelum overtired.
//
// SCIENCE BASE:
// Wake window dibatasi karena ada batas physiological — setelah lewat,
// adenosine (sleep pressure) mencapai level di mana sistem stress
// (HPA axis) kicks in: cortisol + adrenaline spike. Hasilnya 'second
// wind' — bayi terlihat re-energized tapi sebenarnya overtired,
// sehingga lebih SULIT settle to sleep, lebih FRAGMENTED nighttime
// sleep, dan lebih sering night wakings.
//
// KEY REFERENCES:
// - Weissbluth M. "Healthy Sleep Habits, Happy Child" (2015) —
//   rumus age-based wake windows yang paling banyak dirujuk.
// - Mindell JA et al. "A Nightly Bedtime Routine: Impact on Sleep
//   in Young Children." Sleep 2009;32(5):599–606. (overtired →
//   fragmented sleep)
// - Hiscock H, Wake M. "Infant sleep problems and postnatal
//   depression." BMJ 2002;324(7345):1062. (overtired correlation)
// - Polly Moore PhD. "The 90-Minute Baby Sleep Program" — newborn
//   1.5h cycle.
// - AAP (American Academy of Pediatrics) — total sleep recommendations
//   per age (we already use these in daily-targets.ts).
// - Sleep Foundation consensus statements.
//
// CULTURAL ADAPTATION:
// IDAI tidak punya wake window guideline eksplisit — pakai konsensus
// internasional yang aligned dengan total sleep recommendation IDAI
// (12-16 jam newborn dst).
//
// DISCLAIMER: Setiap bayi beda 10-20%. Wake window adalah panduan,
// bukan rumus. Tanda kantuk (rubbing eyes, yawning, zoning out) tetap
// trump timer. Buanglah timer kalau bayi clearly tired earlier.

export type WakeWindow = {
  /** Inclusive age min in days. */
  ageDaysMin: number;
  /** Exclusive age max in days. */
  ageDaysMax: number;
  /** Recommended wake window range — minutes. */
  minMin: number;
  maxMin: number;
  /** Display label for the bucket. */
  label: string;
};

/**
 * Reference: Weissbluth + Sleep Foundation consensus, slightly
 * conservative (favors lower-bound for newborn to avoid overtired).
 */
export const WAKE_WINDOWS: WakeWindow[] = [
  { ageDaysMin: 0, ageDaysMax: 28, minMin: 35, maxMin: 60, label: "0–4 mgu" },
  { ageDaysMin: 28, ageDaysMax: 56, minMin: 60, maxMin: 90, label: "1–2 bln" },
  { ageDaysMin: 56, ageDaysMax: 90, minMin: 75, maxMin: 90, label: "2–3 bln" },
  { ageDaysMin: 90, ageDaysMax: 120, minMin: 90, maxMin: 120, label: "3–4 bln" },
  { ageDaysMin: 120, ageDaysMax: 150, minMin: 105, maxMin: 135, label: "4–5 bln" },
  { ageDaysMin: 150, ageDaysMax: 210, minMin: 120, maxMin: 180, label: "5–7 bln" },
  { ageDaysMin: 210, ageDaysMax: 300, minMin: 150, maxMin: 210, label: "7–10 bln" },
  { ageDaysMin: 300, ageDaysMax: 365, minMin: 180, maxMin: 240, label: "10–12 bln" },
  { ageDaysMin: 365, ageDaysMax: 99999, minMin: 210, maxMin: 270, label: "12+ bln" },
];

export function getWakeWindow(dobIso: string): WakeWindow {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(dobIso).getTime()) / 86400000),
  );
  for (const w of WAKE_WINDOWS) {
    if (days >= w.ageDaysMin && days < w.ageDaysMax) return w;
  }
  return WAKE_WINDOWS[0]!;
}

export type WakeStatus = "fresh" | "approaching" | "ideal" | "wrap_up" | "overtired";

export type WakeAssessment = {
  awakeMin: number;
  window: WakeWindow;
  status: WakeStatus;
  /** Indonesian label for the status, ready to render. */
  statusLabel: string;
  /** Tone for UI — color hint. */
  tone: "ok" | "warn" | "alert";
};

export function assessWake(awakeMin: number, window: WakeWindow): WakeAssessment {
  const { minMin, maxMin } = window;
  let status: WakeStatus;
  let statusLabel: string;
  let tone: "ok" | "warn" | "alert";
  if (awakeMin < minMin * 0.5) {
    status = "fresh";
    statusLabel = "Baru bangun — biar settle";
    tone = "ok";
  } else if (awakeMin < minMin) {
    status = "approaching";
    statusLabel = "Mendekati window tidur";
    tone = "ok";
  } else if (awakeMin <= maxMin - 10) {
    status = "ideal";
    statusLabel = "Window tidur — saat yang baik untuk settle";
    tone = "ok";
  } else if (awakeMin <= maxMin) {
    status = "wrap_up";
    statusLabel = "Mulai siapkan tidur (mendekati maks)";
    tone = "warn";
  } else {
    status = "overtired";
    statusLabel = "Risk overtired — coba settle sekarang";
    tone = "alert";
  }
  return { awakeMin, window, status, statusLabel, tone };
}
