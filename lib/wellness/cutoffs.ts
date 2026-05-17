// EPDS score band cutoffs — role-aware.
//
// Maternal (Indonesian validation per Hutauruk 2012):
//   0-9: low — no indication
//   10-12: mid — possible mild depression, repeat in 2 weeks
//   ≥13: high — probable depression, clinical assessment indicated
//
// Paternal (per Mughal et al. Heliyon 2022 meta-analysis + applying
// two-points-lower rule to Indonesian maternal cutoff 12/13):
//   0-9: low
//   10-11: mid
//   ≥12: high
//
// Note: paternal cutoff 5/6 (Matthey 2001) NOT used — that derived from
// Australian sample with maternal 9/10. Applied to Indonesian maternal
// 12/13, two-points-lower correctly gives 10/12.

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
