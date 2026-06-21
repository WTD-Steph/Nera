"use client";

import { useEffect, useState } from "react";

/**
 * Live clock for time-elapsed displays. Returns "now" in epoch ms, updated
 * on the client every `intervalMs`.
 *
 * WHY THIS EXISTS: dashboard "elapsed since" values (wake window, "X menit
 * lalu", reminders, sleep-coach advice) used to be computed once in the
 * server component from `Date.now()` and frozen into props. They only
 * advanced when the page re-rendered — which, until PR #166, happened every
 * 30s via a router.refresh() poll. Removing that poll (for cost) froze them.
 * Recomputing from this client clock makes them tick WITHOUT any server
 * round-trip, so the cost savings are preserved.
 *
 * HYDRATION: pass `initialNowMs` = the server's render-time Date.now() so the
 * first client render matches the SSR HTML exactly (no hydration mismatch).
 * After mount we switch to the real client clock and tick from there.
 */
export function useNow(intervalMs = 30_000, initialNowMs?: number): number {
  const [now, setNow] = useState<number>(() => initialNowMs ?? Date.now());

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
