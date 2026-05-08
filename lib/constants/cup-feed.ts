// Cup feeder pace targets per usia bayi.
//
// CUP FEEDING SAFETY:
// Cup feeding adalah alternatif bottle untuk avoid nipple/bottle confusion
// (terutama saat establishing breastfeeding). Bayi 'lapping' dari cup
// dengan tilt ringan — bukan dituang. Risiko utama: aspirasi kalau
// alir terlalu cepat.
//
// PACE GUIDELINE:
// Bayi mengontrol kecepatan, bukan caregiver. Tapi pace agregat
// (total ml ÷ total menit) bisa indikasi kalau caregiver tilt
// terlalu agresif. Acuan konservatif:
//
//   0–1 bln: 1–2 ml/menit (~30 ml dalam 15–30 menit)
//   1–3 bln: 2–3 ml/menit
//   3–6 bln: 3–5 ml/menit
//   6+ bln: 5–8 ml/menit (cup learning to drink, transition ke sippy)
//
// Sources:
// - WHO/UNICEF "Acceptable Medical Reasons for Use of Breast-Milk
//   Substitutes" — Section on cup feeding for supplementation
// - AAP Pediatric feeding guidelines
// - Lang S, Lawrence CJ, Orme RL. "Cup feeding: an alternative method
//   of infant feeding." Arch Dis Child 1994;71(4):365-9.
// - Marinelli KA et al. "A randomized clinical trial comparing
//   bottle vs cup feeding." J Perinatol 2001;21:350-5.
//
// CUE-BASED OVERRIDES:
// Pace timer adalah safety net, bukan target. Stop kalau bayi:
// - Coughing / sputtering
// - Turning head away
// - Pursing lips
// - Pace baby-led dulu, ngga maksain habis target ml.

export type CupFeedPace = {
  /** Inclusive age min in days. */
  ageDaysMin: number;
  /** Exclusive age max in days. */
  ageDaysMax: number;
  /** Recommended pace range (ml/min). */
  mlPerMinMin: number;
  mlPerMinMax: number;
  /** Display label. */
  label: string;
};

export const CUP_FEED_PACES: CupFeedPace[] = [
  { ageDaysMin: 0, ageDaysMax: 30, mlPerMinMin: 1, mlPerMinMax: 2, label: "0–1 bln" },
  { ageDaysMin: 30, ageDaysMax: 90, mlPerMinMin: 2, mlPerMinMax: 3, label: "1–3 bln" },
  { ageDaysMin: 90, ageDaysMax: 180, mlPerMinMin: 3, mlPerMinMax: 5, label: "3–6 bln" },
  { ageDaysMin: 180, ageDaysMax: 99999, mlPerMinMin: 5, mlPerMinMax: 8, label: "6+ bln" },
];

export function getCupFeedPace(dobIso: string): CupFeedPace {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(dobIso).getTime()) / 86400000),
  );
  for (const p of CUP_FEED_PACES) {
    if (days >= p.ageDaysMin && days < p.ageDaysMax) return p;
  }
  return CUP_FEED_PACES[0]!;
}

export type PaceStatus = "too_slow" | "ok_slow" | "ok" | "ok_fast" | "too_fast";

/**
 * Assess current pace vs target range.
 * - too_slow: < min/2 (way under, baby may be refusing)
 * - ok_slow: between min/2 and min (slower than target, biasanya OK)
 * - ok: in min..max range (target zone)
 * - ok_fast: max..max*1.2 (slightly fast, watch closely)
 * - too_fast: > max*1.2 (slow down, aspiration risk)
 */
export function assessPace(
  mlPerMin: number,
  pace: CupFeedPace,
): { status: PaceStatus; label: string; tone: "ok" | "warn" | "alert" } {
  const { mlPerMinMin, mlPerMinMax } = pace;
  if (mlPerMin <= 0) {
    return {
      status: "too_slow",
      label: "Belum ada konsumsi · biarkan bayi inisiasi",
      tone: "ok",
    };
  }
  if (mlPerMin < mlPerMinMin * 0.5) {
    return {
      status: "too_slow",
      label: "Sangat lambat — boleh, bayi mungkin lagi cue full",
      tone: "ok",
    };
  }
  if (mlPerMin < mlPerMinMin) {
    return {
      status: "ok_slow",
      label: "Lambat — baby-led pace OK, lanjut",
      tone: "ok",
    };
  }
  if (mlPerMin <= mlPerMinMax) {
    return {
      status: "ok",
      label: "Pace ideal — pertahankan",
      tone: "ok",
    };
  }
  if (mlPerMin <= mlPerMinMax * 1.2) {
    return {
      status: "ok_fast",
      label: "Mendekati maks — pelan sedikit",
      tone: "warn",
    };
  }
  return {
    status: "too_fast",
    label: "Terlalu cepat — pause, biarkan bayi swallow",
    tone: "alert",
  };
}
