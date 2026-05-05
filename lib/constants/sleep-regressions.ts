// Sleep regression banner data — periode-periode yang dikenal di mana
// sleep pattern bayi temporary disrupted. Most well-known: 4-month
// regression (the only one that's actually 'permanent' karena adalah
// transisi sleep architecture, bukan regresi).
//
// SCIENCE BASE:
// - Touchette E et al. *Sleep* 2013;36(11):1727-1734. (sleep
//   architecture maturation 3-6 bulan)
// - Mindell JA, Tikotzky L, Cohen LL et al. (2009) — sleep
//   consolidation patterns by age
// - Sleep Foundation consensus statements
// - Pediatric sleep specialists (Lyndsey Hookway, Marc Weissbluth,
//   Polly Moore) — practitioner-confirmed regression windows
//
// Notes:
// - 4-month adalah satu-satunya regression yang research-confirmed.
//   Yang lain (8/12/18/24 bulan) lebih banyak anecdotal +
//   developmental milestone correlation, bukan true sleep architecture
//   change.
// - Onset varies ±2-3 minggu per bayi. Range di sini conservative
//   supaya banner muncul tepat waktu.
// - Duration 2-6 minggu typical.

export type SleepRegression = {
  /** Inclusive age min in days. */
  ageDaysMin: number;
  /** Exclusive age max in days. */
  ageDaysMax: number;
  /** Display name. */
  label: string;
  emoji: string;
  /** What's happening biologically/developmentally. */
  cause: string;
  /** Practical tips during this period. */
  tips: string[];
  /** Conservative typical duration in weeks. */
  durationWeeks: string;
};

export const SLEEP_REGRESSIONS: SleepRegression[] = [
  {
    // ~3.5-5 bulan
    ageDaysMin: 105,
    ageDaysMax: 150,
    label: "4-Month Sleep Regression",
    emoji: "🌙",
    cause:
      "Bukan regresi sebenarnya — sleep architecture matang dari newborn 2-stage (active + quiet) ke adult 4-stage cycle (N1/N2/N3/REM). Perubahan ini permanen, jadi bayi belajar transisi antar siklus tanpa wake.",
    tips: [
      "Pertahankan rutinitas tidur konsisten (mandi → menyusu → swaddle → gelap)",
      "Wake window sesuai usia (90–120 menit)",
      "Anchor sleep cues: white noise, swaddle/sleep sack",
      "Hindari over-feeding sebagai pacifier — bayi belajar self-soothe",
      "Phase ini lasting 2–6 minggu — sabar, bukan permanent regression",
    ],
    durationWeeks: "2–6 minggu",
  },
  {
    // ~8-10 bulan
    ageDaysMin: 240,
    ageDaysMax: 300,
    label: "8–9 Month Regression",
    emoji: "👋",
    cause:
      "Coincides dengan separation anxiety + object permanence (bayi sadar mama bisa pergi). Plus motor skills boom: merangkak, berdiri, latihan motorik di crib bikin sulit settle.",
    tips: [
      "Brief reassurance saat night waking, jangan over-stimulate",
      "Allow practice motor skills di waking hours, bukan jam tidur",
      "Pertahankan jadwal — ngga ganti 'rules' di tengah regression",
      "Object permanence tip: lovey/comfort item bisa bantu",
      "Phase 2–4 minggu typical",
    ],
    durationWeeks: "2–4 minggu",
  },
  {
    // ~11-13 bulan
    ageDaysMin: 330,
    ageDaysMax: 395,
    label: "12-Month Regression",
    emoji: "🚶",
    cause:
      "Walking milestone + cognitive leap. Bayi terlalu excited tentang skill baru untuk settle. Banyak bayi juga drop dari 2 nap ke 1 nap di window ini.",
    tips: [
      "Watch for nap transition signals (consistent late afternoon nap refusal)",
      "Adjust bedtime earlier sementara cycle ulang",
      "Walking practice waktu siang, hindari pre-bedtime",
      "Phase 1–3 minggu typical",
    ],
    durationWeeks: "1–3 minggu",
  },
  {
    // ~17-19 bulan
    ageDaysMin: 510,
    ageDaysMax: 580,
    label: "18-Month Regression",
    emoji: "🦷",
    cause:
      "Independence + tantrum + molar teething + nightmares onset. 'Threenager' phase mulai.",
    tips: [
      "Konsistensikan boundaries — caving in justru perpanjang regression",
      "Limit screen time terutama 2 jam sebelum tidur",
      "Comfort item + simple bedtime story",
      "Cek molars — pakai teether dingin kalau perlu",
      "Phase 2–6 minggu typical",
    ],
    durationWeeks: "2–6 minggu",
  },
  {
    // ~23-25 bulan
    ageDaysMin: 690,
    ageDaysMax: 760,
    label: "2-Year Regression",
    emoji: "👹",
    cause:
      "Nightmares + night fears + 2-year molars. Kosakata berkembang pesat → mimpi lebih kompleks.",
    tips: [
      "Nightlight kalau bayi minta",
      "Validate fears, jangan dismiss",
      "Pre-sleep wind-down 30+ menit",
      "Cek molars",
      "Phase 1–4 minggu typical",
    ],
    durationWeeks: "1–4 minggu",
  },
];

export type RegressionState = {
  regression: SleepRegression;
  /** Days into the window (>= 0 if in window, negative if upcoming). */
  daysInto: number;
  /** Days remaining until window starts (positive when upcoming). */
  daysUntil: number;
  /** Status. */
  status: "in_window" | "upcoming";
};

/**
 * Resolve current sleep regression state for baby. Returns null kalau
 * tidak in-window atau within UPCOMING_DAYS lookahead.
 */
const UPCOMING_DAYS_LOOKAHEAD = 14;

export function getCurrentRegression(dobIso: string): RegressionState | null {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(dobIso).getTime()) / 86400000),
  );
  for (const r of SLEEP_REGRESSIONS) {
    if (days >= r.ageDaysMin && days < r.ageDaysMax) {
      return {
        regression: r,
        daysInto: days - r.ageDaysMin,
        daysUntil: 0,
        status: "in_window",
      };
    }
  }
  // Check upcoming within lookahead window
  for (const r of SLEEP_REGRESSIONS) {
    if (days < r.ageDaysMin && r.ageDaysMin - days <= UPCOMING_DAYS_LOOKAHEAD) {
      return {
        regression: r,
        daysInto: 0,
        daysUntil: r.ageDaysMin - days,
        status: "upcoming",
      };
    }
  }
  return null;
}
