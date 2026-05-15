// Heuristic cry-reason suggestion — Path C dari Tier 1.5 plan.
//
// Inputs: context hint (last feed/diaper/wake times) + baby age.
// Output: suggested reason + confidence + human-readable basis.
//
// Rules-based, deterministic. No ML, no inference. Computed once at
// cry_events INSERT time, frozen di DB column `suggested_reason`.
// Parent ground-truth tag (Path D) saved separately, allows accuracy
// measurement over time.
//
// Honest design choices:
// - 'unclear' adalah valid output (Tidak force-pick kalau no clear signal)
// - Confidence calibrated berdasarkan how-far-overdue trigger metrics
// - `basis` array surfaces reasoning untuk transparency

import { getWakeWindow } from "@/lib/constants/wake-window";
import type { CryContextHint } from "@/lib/compute/cry-context";

export type Reason =
  | "hungry"
  | "tired"
  | "diaper"
  | "discomfort"
  | "unclear";

export type Confidence = "high" | "medium" | "low";

export type ReasonSuggestion = {
  reason: Reason;
  confidence: Confidence;
  /** Human-readable factors yang triggered suggestion. Disurface
   *  ke UI untuk transparency ("kenapa app pikir lapar?"). */
  basis: string[];
};

/**
 * Expected feed interval (minutes) per age. Derived dari typical
 * newborn/infant feeding patterns + WHO/IDAI guidance. Conservative
 * — slightly favors longer interval supaya tidak over-suggest hungry.
 *
 * Sources:
 * - AAP: newborn 2-3h, 1-3mo 3-4h, 3-6mo 3-5h, 6+mo 4-6h
 * - WHO/IDAI breastfeeding: on-demand newborn, more spaced ke 4-6h
 *   by 6mo
 */
function expectedFeedIntervalMin(ageDays: number): number {
  if (ageDays < 30) return 150; // ~2.5h newborn
  if (ageDays < 90) return 180; // 3h 1-3mo
  if (ageDays < 180) return 210; // 3.5h 3-6mo
  if (ageDays < 365) return 240; // 4h 6-12mo
  return 300; // 5h 12+mo
}

/** Diaper threshold — caregiver typically check 90min intervals di
 *  newborn, more spaced di older. Wet/soiled tipically uncomfortable
 *  setelah 60-120 min. */
function diaperWarningMin(ageDays: number): number {
  if (ageDays < 90) return 90;
  return 120;
}

/**
 * Compute suggested reason untuk cry event.
 *
 * Heuristic prioritization (urutan check):
 * 1. Currently sleeping (woke unexpectedly) → DISCOMFORT (uncommon
 *    pattern; check fever/diaper/pain). High confidence basis: wake
 *    saat tidur is anomalous.
 * 2. Feed overdue (>1.5× expected interval) → HUNGRY high
 *    Feed overdue (>1× expected interval) → HUNGRY medium
 * 3. Awake longer than wake window max → TIRED high
 *    Awake longer than wake window min → TIRED low
 * 4. Diaper old + recent feed (parent recently checked feed but not
 *    diaper) → DIAPER medium
 * 5. Multiple weak signals → UNCLEAR (transparent ambiguity)
 * 6. No signal at all → UNCLEAR low
 */
export function suggestReason(
  context: CryContextHint,
  ageDays: number,
): ReasonSuggestion {
  const expectedFeed = expectedFeedIntervalMin(ageDays);
  const diaperWarn = diaperWarningMin(ageDays);
  // Wake window dari babies.dob lookup pattern; pass ageDays directly
  // here via reconstruction (heuristic engine consumes pure values).
  const wakeWindow = getWakeWindowByAge(ageDays);

  // Rule 1: woke during sleep
  if (context.isCurrentlySleeping) {
    return {
      reason: "discomfort",
      confidence: "medium",
      basis: ["bangun saat tidur (anomalous) — cek demam / popok / sakit"],
    };
  }

  const signals: { reason: Reason; confidence: Confidence; basis: string }[] = [];

  // Rule 2: hungry signal
  if (context.lastFeedMin !== null) {
    const overdueRatio = context.lastFeedMin / expectedFeed;
    if (overdueRatio >= 1.5) {
      signals.push({
        reason: "hungry",
        confidence: "high",
        basis: `last feed ${formatMin(context.lastFeedMin)} (>${overdueRatio.toFixed(1)}× interval ${formatMin(expectedFeed)})`,
      });
    } else if (overdueRatio >= 1.0) {
      signals.push({
        reason: "hungry",
        confidence: "medium",
        basis: `last feed ${formatMin(context.lastFeedMin)} (interval typical ${formatMin(expectedFeed)} terlewat)`,
      });
    }
  }

  // Rule 3: tired signal
  if (context.lastWakeMin !== null) {
    if (context.lastWakeMin >= wakeWindow.maxMin) {
      signals.push({
        reason: "tired",
        confidence: "high",
        basis: `awake ${formatMin(context.lastWakeMin)} (>maks window ${wakeWindow.maxMin}m)`,
      });
    } else if (context.lastWakeMin >= wakeWindow.minMin) {
      signals.push({
        reason: "tired",
        confidence: "low",
        basis: `awake ${formatMin(context.lastWakeMin)} (dalam wake window ${wakeWindow.minMin}-${wakeWindow.maxMin}m)`,
      });
    }
  }

  // Rule 4: diaper signal — old diaper + recent feed (parent attending
  // feed but maybe missed diaper check).
  if (
    context.lastDiaperMin !== null &&
    context.lastDiaperMin >= diaperWarn &&
    context.lastFeedMin !== null &&
    context.lastFeedMin < 60
  ) {
    signals.push({
      reason: "diaper",
      confidence: "medium",
      basis: `diaper ${formatMin(context.lastDiaperMin)} (>${formatMin(diaperWarn)}) + recent feed (focus food, miss diaper?)`,
    });
  }

  // Pick top signal — strongest confidence wins. Multiple high =
  // still pick first listed (priority order). Multiple low or none = unclear.
  const high = signals.find((s) => s.confidence === "high");
  if (high) return { reason: high.reason, confidence: "high", basis: [high.basis] };

  const medium = signals.find((s) => s.confidence === "medium");
  if (medium) {
    return { reason: medium.reason, confidence: "medium", basis: [medium.basis] };
  }

  const low = signals[0];
  if (low) return { reason: low.reason, confidence: "low", basis: [low.basis] };

  return {
    reason: "unclear",
    confidence: "low",
    basis: ["tidak ada sinyal kuat dari context — cek manual"],
  };
}

function formatMin(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}j` : `${h}j ${m}m`;
}

// Helper: lookup wake window by age (numeric), bypass dobIso conversion.
function getWakeWindowByAge(ageDays: number) {
  const fauxDob = new Date(Date.now() - ageDays * 86400000).toISOString();
  return getWakeWindow(fauxDob);
}

// Display helpers untuk UI consistency.

export const REASON_EMOJIS: Record<Reason | "other", string> = {
  hungry: "🍼",
  tired: "😴",
  diaper: "🧷",
  discomfort: "😣",
  unclear: "❓",
  other: "•",
};

export const REASON_LABELS: Record<Reason | "other", string> = {
  hungry: "Lapar",
  tired: "Lelah",
  diaper: "Popok",
  discomfort: "Tidak Nyaman",
  unclear: "Tidak Pasti",
  other: "Lainnya",
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "tinggi",
  medium: "sedang",
  low: "rendah",
};

/** Tagged-reason enum includes 'other' (catch-all). Use this list
 *  untuk UI pickers. */
export const TAGGABLE_REASONS: Array<Reason | "other"> = [
  "hungry",
  "tired",
  "diaper",
  "discomfort",
  "unclear",
  "other",
];
