"use client";

import { useEffect, useState } from "react";
import type { WakeAssessment } from "@/lib/constants/wake-window";

const TONE_BG: Record<WakeAssessment["tone"], string> = {
  ok: "border-emerald-100 bg-emerald-50/40 text-emerald-800",
  warn: "border-amber-200 bg-amber-50/60 text-amber-800",
  alert: "border-red-200 bg-red-50/60 text-red-800",
};

const TONE_BAR: Record<WakeAssessment["tone"], string> = {
  ok: "bg-emerald-400",
  warn: "bg-amber-400",
  alert: "bg-red-400",
};

/** Light-mode inline card with optional dark-mode trigger. */
export function WakeWindowCard({ assessment }: { assessment: WakeAssessment }) {
  const [dark, setDark] = useState(false);
  const pct = Math.min(
    100,
    Math.round((assessment.awakeMin / assessment.window.maxMin) * 100),
  );

  return (
    <>
      <div className={`mt-3 rounded-2xl border px-3 py-2.5 shadow-sm ${TONE_BG[assessment.tone]}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold">
            🌙 Wake window · usia {assessment.window.label}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold tabular-nums">
              {assessment.awakeMin}m / {assessment.window.minMin}–
              {assessment.window.maxMin}m
            </span>
            <button
              type="button"
              onClick={() => setDark(true)}
              className="rounded-full border border-current/20 bg-white/60 px-2 py-0.5 text-[10px] font-semibold opacity-70 hover:opacity-100"
              aria-label="Mode dark"
            >
              🌑
            </button>
          </div>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/60">
          <div
            className={`h-full transition-all ${TONE_BAR[assessment.tone]}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 text-[11px]">{assessment.statusLabel}</div>
      </div>
      {dark ? (
        <WakeDarkOverlay assessment={assessment} onClose={() => setDark(false)} />
      ) : null}
    </>
  );
}

/** Fullscreen dim countdown — easy to monitor saat malam, ngga silau. */
function WakeDarkOverlay({
  assessment,
  onClose,
}: {
  assessment: WakeAssessment;
  onClose: () => void;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      window.removeEventListener("keydown", onEsc);
      clearInterval(id);
    };
  }, [onClose]);

  void tick;
  const elapsed = assessment.awakeMin;
  const max = assessment.window.maxMin;
  const remaining = max - elapsed;
  const overtiredBy = elapsed - max; // positive only when over
  const pct = Math.min(100, Math.round((elapsed / max) * 100));
  const toneText: Record<WakeAssessment["tone"], string> = {
    ok: "text-emerald-300",
    warn: "text-amber-300",
    alert: "text-red-300",
  };
  const toneBar: Record<WakeAssessment["tone"], string> = {
    ok: "bg-emerald-400/80",
    warn: "bg-amber-400/80",
    alert: "bg-red-400/80",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black p-6 text-white"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        aria-label="Tutup mode dark"
      >
        ✕
      </button>
      <div className="text-[11px] uppercase tracking-widest text-white/60">
        {remaining > 0 ? "Sebelum Overtired" : "Sudah Overtired"} · usia{" "}
        {assessment.window.label}
      </div>
      <div className="mt-3 font-mono text-7xl font-bold tabular-nums">
        {remaining > 0 ? remaining : `+${overtiredBy}`}
        <span className="text-3xl text-white/50">m</span>
      </div>
      <div className="mt-2 text-sm text-white/60">
        sudah bangun {elapsed}m · window {assessment.window.minMin}–{max}m
      </div>
      <div className="mt-6 h-2 w-64 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full transition-all ${toneBar[assessment.tone]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className={`mt-4 text-center text-base font-semibold ${toneText[assessment.tone]}`}>
        {assessment.statusLabel}
      </div>
      <div className="mt-8 text-[10px] text-white/30">tap untuk tutup</div>
    </div>
  );
}
