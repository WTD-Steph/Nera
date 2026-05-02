"use client";

import { useEffect, useState } from "react";

function format(elapsedMs: number): string {
  const totalSec = Math.max(0, Math.floor(elapsedMs / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export function Stopwatch({
  startIso,
  pausedAtIso,
  className,
}: {
  startIso: string;
  /** When set, freeze the elapsed display at (pausedAt - start). */
  pausedAtIso?: string | null;
  className?: string;
}) {
  // Render a stable placeholder on server; Date.now() differs between SSR
  // and client hydration, which would cause a hydration mismatch. After
  // mount, switch to the live ticking value (or the frozen paused value).
  const [now, setNow] = useState<number | null>(null);
  const paused = !!pausedAtIso;

  useEffect(() => {
    if (paused) {
      setNow(null);
      return;
    }
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [paused]);

  const start = new Date(startIso).getTime();
  if (paused && pausedAtIso) {
    const frozen = new Date(pausedAtIso).getTime() - start;
    return <span className={className}>{format(frozen)}</span>;
  }
  const display = now === null ? "--:--" : format(now - start);
  return <span className={className}>{display}</span>;
}
