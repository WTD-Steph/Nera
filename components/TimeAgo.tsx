"use client";

import { timeSince } from "@/lib/compute/format";
import { useNow } from "@/lib/time/use-now";

/**
 * Live "X menit lalu" that ticks on the client without a server re-render.
 * Renders identically to the server's timeSince() on first paint (pass
 * initialNowMs = the server render clock) to stay hydration-safe.
 */
export function TimeAgo({
  iso,
  initialNowMs,
  className,
}: {
  iso: string;
  initialNowMs: number;
  className?: string;
}) {
  const now = useNow(30_000, initialNowMs);
  return <span className={className}>{timeSince(iso, now)}</span>;
}
