// EPDS score band cutoffs — role-aware.
//
// === MATERNAL ===
// Hybrid threshold structure:
//   0-9:  low   — clearly negative
//   10-12: mid  — "possible mild depression", repeat skrining in 2 weeks
//   ≥13:  high — "probable major depression", clinical assessment indicated
//
// Provenance:
// - Lower bound 10 = international Cox 1987 convention for "possible
//   depression" screening positive. NOT from Indonesian validation.
// - Upper bound 13 = Hutauruk 2012 Indonesian-validated cutoff for
//   "probable major depression" (sens 92%, spec 86% on Indonesian
//   postpartum sample). Hutauruk specifically validated ONE threshold
//   (≥13); the 10-12 "mid" band is appended from international guidance
//   to surface borderline cases for repeat skrining.
//
// === PATERNAL ===
// Threshold structure:
//   0-9:  low
//   10-11: mid
//   ≥12:  high
//
// Provenance:
// - No Indonesian paternal EPDS validation exists. Cutoff derived from
//   Mughal et al. Heliyon 2022 meta-analysis (7 studies, 2393 fathers)
//   which surveyed published paternal cutoffs ranging 5/6 to 10/11 with
//   no single canonical recommendation.
// - Current ≥12 chosen as CONSERVATIVE option:
//   * Strict "-2 from maternal probable (13)" would give ≥11 — more
//     sensitive but more false alarms.
//   * Current ≥12 is "-1 from maternal" — fewer false alarms (higher
//     specificity), but may miss some borderline fathers.
// - Trade-off accept: prefer false negatives over false alarms given:
//   (a) no Indonesian paternal validation to anchor sensitivity claim;
//   (b) crisis pathway (Q10>0) is orthogonal — still catches acute risk.
// - Matthey 2001 cutoff 5/6 NOT used: derived from Australian sample
//   with maternal 9/10, doesn't translate directly to Indonesian 12/13.

export type Role = "mother" | "father";
export type Band = "low" | "mid" | "high";

export type BandThresholds = {
  /** Score < this = 'low' */
  midStart: number;
  /** Score >= midStart AND < highStart = 'mid' */
  highStart: number;
};

export const MATERNAL_BANDS: BandThresholds = {
  midStart: 10,
  highStart: 13,
};

export const PATERNAL_BANDS: BandThresholds = {
  midStart: 10,
  highStart: 12,
};

export function getBandForRole(
  role: Role,
  totalScore: number | null,
): Band | null {
  if (totalScore == null) return null;
  const thresholds = role === "mother" ? MATERNAL_BANDS : PATERNAL_BANDS;
  if (totalScore < thresholds.midStart) return "low";
  if (totalScore < thresholds.highStart) return "mid";
  return "high";
}

export function bandLabel(band: Band): string {
  return band === "low"
    ? "Tidak ada indikasi depresi"
    : band === "mid"
      ? "Skor sedang"
      : "Skor tinggi";
}

export function bandColor(band: Band): "green" | "yellow" | "red" {
  return band === "low" ? "green" : band === "mid" ? "yellow" : "red";
}

export function bandRecommendation(role: Role, band: Band): string {
  if (band === "low") {
    return "Tidak ada indikasi depresi. Ulangi minggu depan kalau perasaan berubah — kapan-kapan saja.";
  }
  if (band === "mid") {
    return (
      "Kemungkinan gejala depresi ringan. Bukan diagnosis — hanya skrining. " +
      "Rekomendasi: ulangi skrining dalam 2 minggu, pertimbangkan konsultasi " +
      "dengan dokter atau bidan, jaga tidur + dukungan keluarga."
    );
  }
  // high
  const cutoff = role === "mother" ? "≥13" : "≥12";
  return (
    `Skor ${cutoff} menunjukkan kemungkinan depresi yang membutuhkan asesmen ` +
    "klinis. Bukan diagnosis. Disarankan konsultasi profesional kesehatan " +
    "mental dalam waktu dekat."
  );
}
