"use client";

import Link from "next/link";
import type { LogRow } from "@/lib/compute/stats";
import { computeRealtimeAdvice } from "@/lib/compute/sleep-coach-realtime";
import { useNow } from "@/lib/time/use-now";

/**
 * Live Sleep Coach pill. Recomputes the realtime advice on a client clock so
 * the recommendation (e.g. "biarkan awake" → "overtired") updates as awake
 * minutes cross the wake-window thresholds, without a server re-render.
 * `logs` should be the sleep+feeding subset (all computeRealtimeAdvice reads).
 */
export function SleepAdvicePill({
  logs,
  dob,
  wakeOverride,
  initialNowMs,
}: {
  logs: LogRow[];
  dob: string;
  wakeOverride: { minMin: number; maxMin: number } | null;
  initialNowMs: number;
}) {
  const now = useNow(30_000, initialNowMs);
  const advice = computeRealtimeAdvice(logs, dob, wakeOverride, now);

  return (
    <Link
      href="/sleep-coach"
      className={`mt-3 flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-xs shadow-sm hover:opacity-90 ${
        advice.tone === "alert"
          ? "border-red-200 bg-red-50/70 text-red-900"
          : advice.tone === "warn"
            ? "border-amber-200 bg-amber-50/70 text-amber-900"
            : "border-emerald-200 bg-emerald-50/50 text-emerald-900"
      }`}
    >
      <span className="text-base" aria-hidden>
        {advice.emoji}
      </span>
      <span className="flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-70">
          Sleep Coach
        </span>
        <span className="block font-semibold">{advice.primary}</span>
      </span>
      <span className="text-[10px] opacity-60">→</span>
    </Link>
  );
}
