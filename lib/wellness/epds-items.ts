// Edinburgh Postnatal Depression Scale (EPDS) — Indonesian validated version.
//
// Citations:
// - Original instrument: Cox JL, Holden JM, Sagovsky R. Detection of
//   postnatal depression: Development of the 10-item Edinburgh Postnatal
//   Depression Scale. British Journal of Psychiatry 1987; 150:782-786.
// - Indonesian translation lineage: Kusumadewi, Irawati, Elvira, Wibisono
//   (1998) — foundational translation, predates online journals.
// - Indonesian psychometric validation: Hutauruk IS (2012). Indonesian
//   Version of the Edinburgh Postnatal Depression Scale: Cross-Cultural
//   Adaptation and Validation. Jurnal Psikologi, Universitas Gunadarma.
//   https://ejournal.gunadarma.ac.id/index.php/psiko/article/view/390
// - Paternal validation: Mughal et al. Heliyon 2022 — meta-analysis 7
//   studies 2393 fathers, two-points-lower cutoff vs maternal.
//
// Translation drifts documented (validated wording preserved):
// - Item 1: English "see the funny side of things" → Indonesian
//   "merasakan hal-hal yang menyenangkan" (broader, drops humor specificity).
// - Item 3: English "unnecessarily" (cognitive distortion signal) absent
//   in Indonesian wording.
// - Item 6: English "getting on top of me" idiom → "terasa sulit untuk
//   dikerjakan" (option strings recover overwhelm meaning).
//
// Spelling: Item 4 uses "kuatir" (pre-EYD) per Hutauruk 2012 validation,
// NOT modernized to "khawatir" — modernizing would invalidate
// psychometric calibration.
//
// EPDS © Royal College of Psychiatrists. Free for clinical/research use
// with acknowledgment.

export type EpdsItem = {
  /** 1-10 item number per source instrument */
  number: number;
  /** Indonesian question text, verbatim from validated source */
  question: string;
  /** 4 response options in source-paper order (top → bottom) */
  options: Array<{
    /** Indonesian option text */
    text: string;
    /** Score assigned: 0-3. Reverse-scored items 3, 5-10 have option[0]=3 */
    score: number;
  }>;
  /** True for items 3, 5-10 where top option scores 3 (reverse-scored) */
  reversed: boolean;
  /** Q10 is the suicidal ideation item — triggers crisis pathway on any
   *  non-zero selection. */
  isQ10?: true;
};

export const EPDS_INSTRUCTION =
  "Sebagaimana kehamilan atau proses persalinan yang baru saja anda alami, " +
  "kami ingin mengetahui bagaimana perasaan anda saat ini. Mohon memilih " +
  "jawaban yang paling mendekati keadaan perasaan anda DALAM 7 HARI " +
  "TERAKHIR, bukan hanya perasaan anda hari ini.";

export const EPDS_ITEMS: EpdsItem[] = [
  {
    number: 1,
    question: "Saya mampu tertawa dan merasakan hal-hal yang menyenangkan",
    options: [
      { text: "Sebanyak yang saya bisa", score: 0 },
      { text: "Tidak terlalu banyak", score: 1 },
      { text: "Tidak banyak", score: 2 },
      { text: "Tidak sama sekali", score: 3 },
    ],
    reversed: false,
  },
  {
    number: 2,
    question: "Saya melihat segala sesuatunya kedepan sangat menyenangkan",
    options: [
      { text: "Sebanyak sebelumnya", score: 0 },
      { text: "Agak sedikit kurang dibandingkan dengan sebelumnya", score: 1 },
      { text: "Kurang dibandingkan dengan sebelumnya", score: 2 },
      { text: "Tidak pernah sama sekali", score: 3 },
    ],
    reversed: false,
  },
  {
    number: 3,
    question:
      "Saya menyalahkan diri saya sendiri saat sesuatu terjadi tidak sebagaimana mestinya",
    options: [
      { text: "Ya, setiap saat", score: 3 },
      { text: "Ya, kadang-kadang", score: 2 },
      { text: "Tidak terlalu sering", score: 1 },
      { text: "Tidak pernah sama sekali", score: 0 },
    ],
    reversed: true,
  },
  {
    number: 4,
    question: "Saya merasa cemas atau merasa kuatir tanpa alasan yang jelas",
    options: [
      { text: "Tidak pernah sama sekali", score: 0 },
      { text: "Jarang-jarang", score: 1 },
      { text: "Ya, kadang-kadang", score: 2 },
      { text: "Ya, sering sekali", score: 3 },
    ],
    reversed: false,
  },
  {
    number: 5,
    question: "Saya merasa takut atau panik tanpa alasan yang jelas",
    options: [
      { text: "Ya, cukup sering", score: 3 },
      { text: "Ya, kadang-kadang", score: 2 },
      { text: "Tidak terlalu sering", score: 1 },
      { text: "Tidak pernah sama sekali", score: 0 },
    ],
    reversed: true,
  },
  {
    number: 6,
    question: "Segala sesuatunya terasa sulit untuk dikerjakan",
    options: [
      { text: "Ya, hampir setiap saat saya tidak mampu menanganinya", score: 3 },
      {
        text: "Ya, kadang-kadang saya tidak mampu menangani seperti biasanya",
        score: 2,
      },
      { text: "Tidak terlalu, sebagian besar berhasil saya tangani", score: 1 },
      {
        text: "Tidak pernah, saya mampu mengerjakan segala sesuatu dengan baik",
        score: 0,
      },
    ],
    reversed: true,
  },
  {
    number: 7,
    question: "Saya merasa tidak bahagia sehingga mengalami kesulitan untuk tidur",
    options: [
      { text: "Ya, setiap saat", score: 3 },
      { text: "Ya, kadang-kadang", score: 2 },
      { text: "Tidak terlalu sering", score: 1 },
      { text: "Tidak pernah sama sekali", score: 0 },
    ],
    reversed: true,
  },
  {
    number: 8,
    question: "Saya merasa sedih dan merasa diri saya menyedihkan",
    options: [
      { text: "Ya, setiap saat", score: 3 },
      { text: "Ya, cukup sering", score: 2 },
      { text: "Tidak terlalu sering", score: 1 },
      { text: "Tidak pernah sama sekali", score: 0 },
    ],
    reversed: true,
  },
  {
    number: 9,
    question:
      "Saya merasa tidak bahagia sehingga menyebabkan saya menangis",
    options: [
      { text: "Ya, setiap saat", score: 3 },
      { text: "Ya, cukup sering", score: 2 },
      { text: "Disaat tertentu saja", score: 1 },
      { text: "Tidak pernah sama sekali", score: 0 },
    ],
    reversed: true,
  },
  {
    number: 10,
    question: "Muncul pikiran untuk menyakiti diri saya sendiri",
    options: [
      { text: "Ya, cukup sering", score: 3 },
      { text: "Kadang-kadang", score: 2 },
      { text: "Jarang sekali", score: 1 },
      { text: "Tidak pernah sama sekali", score: 0 },
    ],
    reversed: true,
    isQ10: true,
  },
];

/**
 * Returns true kalau Q10 score > 0 — triggers crisis pathway. Per Cox/
 * Holden 1987 + Indonesian validation: any non-zero Q10 = immediate
 * psychiatric attention indicator.
 */
export function isQ10Positive(q10Score: number): boolean {
  return q10Score > 0;
}

/**
 * Compute total score dari 10-item responses array. Each item scored 0-3.
 * Returns null kalau any item missing (incomplete questionnaire).
 *
 * Q10 logic: total still computed kalau user completes all 10 items.
 * Crisis pathway is orthogonal — fires upon Q10 selection regardless of
 * other items completed.
 */
export function computeTotalScore(
  responses: Record<string, number>,
): number | null {
  let total = 0;
  for (let i = 1; i <= 10; i++) {
    const v = responses[`q${i}`];
    if (typeof v !== "number") return null;
    total += v;
  }
  return total;
}
