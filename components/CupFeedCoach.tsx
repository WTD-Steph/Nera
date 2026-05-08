"use client";

import { useEffect, useRef, useState } from "react";
import {
  type CupFeedPace,
  assessPace,
} from "@/lib/constants/cup-feed";
import { createLogAction } from "@/app/actions/logs";
import { SubmitButton } from "@/components/SubmitButton";

/**
 * Cup feed coach — modal interactive untuk supervise cup feeding pace.
 * Real-time stopwatch + ml tracker, alert kalau over-pace (aspirasi
 * risk). On Selesai → save sebagai feeding bottle log dengan notes
 * 'Cup feed'.
 */
export function CupFeedCoach({
  pace,
  onClose,
}: {
  pace: CupFeedPace;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"setup" | "active">("setup");
  const [content, setContent] = useState<"asi" | "sufor" | "mix">("sufor");
  const [targetMl, setTargetMl] = useState<number>(30);
  const [mixAsi, setMixAsi] = useState<number>(15);
  const [mixSufor, setMixSufor] = useState<number>(15);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [pauseAccumMs, setPauseAccumMs] = useState<number>(0);
  const [mlConsumed, setMlConsumed] = useState<number>(0);
  const [tick, setTick] = useState(0);

  // Pre-populate sensible mix split when content switches to mix
  useEffect(() => {
    if (content === "mix") {
      const half = Math.round(targetMl / 2);
      setMixAsi(half);
      setMixSufor(targetMl - half);
    }
  }, [content, targetMl]);

  // Tick every second when active
  useEffect(() => {
    if (step !== "active" || pausedAt !== null) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [step, pausedAt]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const elapsedMs =
    startedAt == null
      ? 0
      : (pausedAt ?? Date.now()) - startedAt - pauseAccumMs;
  const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
  const elapsedMin = elapsedSec / 60;
  const currentPace = elapsedMin > 0 ? mlConsumed / elapsedMin : 0;
  const expectedMin = (pace.mlPerMinMin + pace.mlPerMinMax) / 2;
  const expectedDurationMin = Math.round(targetMl / expectedMin);
  const assessment = assessPace(currentPace, pace);
  void tick; // force re-render dependency

  const fmtElapsed = () => {
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const start = () => {
    setStep("active");
    setStartedAt(Date.now());
    setPausedAt(null);
    setPauseAccumMs(0);
    setMlConsumed(0);
  };

  const togglePause = () => {
    if (pausedAt !== null) {
      // Resume — accumulate pause duration
      setPauseAccumMs(pauseAccumMs + (Date.now() - pausedAt));
      setPausedAt(null);
    } else {
      setPausedAt(Date.now());
    }
  };

  const adjustMl = (delta: number) => {
    setMlConsumed((v) => Math.max(0, Math.min(500, v + delta)));
  };

  const noteText = `🥤 Cup feed · ${mlConsumed} ml dalam ${elapsedSec >= 60 ? `${Math.round(elapsedMin)}m` : `${elapsedSec}s`} · pace ${currentPace.toFixed(1)} ml/m (target ${pace.mlPerMinMin}–${pace.mlPerMinMax}, usia ${pace.label})`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cup Feed Coach"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[95vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-800">
              🥤 Cup Feed Coach
            </h2>
            <p className="text-[11px] text-gray-500">
              Pace target {pace.mlPerMinMin}–{pace.mlPerMinMax} ml/m · usia{" "}
              {pace.label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        {step === "setup" ? (
          <SetupStep
            content={content}
            setContent={setContent}
            targetMl={targetMl}
            setTargetMl={setTargetMl}
            mixAsi={mixAsi}
            setMixAsi={setMixAsi}
            mixSufor={mixSufor}
            setMixSufor={setMixSufor}
            expectedDurationMin={expectedDurationMin}
            pace={pace}
            onStart={start}
          />
        ) : (
          <ActiveStep
            elapsedDisplay={fmtElapsed()}
            elapsedMin={elapsedMin}
            mlConsumed={mlConsumed}
            targetMl={targetMl}
            currentPace={currentPace}
            assessment={assessment}
            isPaused={pausedAt !== null}
            adjustMl={adjustMl}
            togglePause={togglePause}
            content={content}
            mixAsi={mixAsi}
            mixSufor={mixSufor}
            noteText={noteText}
            elapsedSec={elapsedSec}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

function SetupStep({
  content,
  setContent,
  targetMl,
  setTargetMl,
  mixAsi,
  setMixAsi,
  mixSufor,
  setMixSufor,
  expectedDurationMin,
  pace,
  onStart,
}: {
  content: "asi" | "sufor" | "mix";
  setContent: (c: "asi" | "sufor" | "mix") => void;
  targetMl: number;
  setTargetMl: (n: number) => void;
  mixAsi: number;
  setMixAsi: (n: number) => void;
  mixSufor: number;
  setMixSufor: (n: number) => void;
  expectedDurationMin: number;
  pace: CupFeedPace;
  onStart: () => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-700">
          Isi cup
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(["asi", "sufor", "mix"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setContent(c)}
              className={`rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors ${
                content === c
                  ? "border-rose-400 bg-rose-50 text-rose-700"
                  : "border-gray-200 bg-white text-gray-700"
              }`}
            >
              {c === "asi" ? "🤱 ASI" : c === "sufor" ? "🥛 Sufor" : "🤱+🥛 Mix"}
            </button>
          ))}
        </div>
      </div>

      {content === "mix" ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-rose-700">
              ASI (ml)
            </label>
            <select
              value={mixAsi}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMixAsi(v);
                setTargetMl(v + mixSufor);
              }}
              className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-center text-base font-semibold tabular-nums text-rose-700 outline-none focus:border-rose-400"
            >
              {Array.from({ length: 121 }, (_, i) => (
                <option key={i} value={i}>
                  {i} ml
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-amber-700">
              Sufor (ml)
            </label>
            <select
              value={mixSufor}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMixSufor(v);
                setTargetMl(mixAsi + v);
              }}
              className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-center text-base font-semibold tabular-nums text-amber-700 outline-none focus:border-rose-400"
            >
              {Array.from({ length: 121 }, (_, i) => (
                <option key={i} value={i}>
                  {i} ml
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">
            Target ml
          </label>
          <select
            value={targetMl}
            onChange={(e) => setTargetMl(Number(e.target.value))}
            className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-center text-lg font-bold tabular-nums text-rose-700 outline-none focus:border-rose-400"
          >
            {Array.from({ length: 121 }, (_, i) => (
              <option key={i} value={i}>
                {i} ml
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="rounded-xl bg-rose-50/60 p-3 text-[12px] text-gray-700">
        <div className="font-semibold text-rose-700">
          Estimasi durasi: ~{expectedDurationMin} menit
        </div>
        <div className="mt-1 text-[11px] leading-snug text-gray-600">
          Pace target {pace.mlPerMinMin}–{pace.mlPerMinMax} ml/m. Tilt cup
          ringan, biarkan bayi 'lapping' (bukan dituang). Stop kalau bayi
          batuk / pursing lips / muka miring.
        </div>
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={targetMl <= 0}
        className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 active:bg-rose-700 disabled:opacity-50"
      >
        Mulai Cup Feed
      </button>
    </div>
  );
}

function ActiveStep({
  elapsedDisplay,
  elapsedMin,
  mlConsumed,
  targetMl,
  currentPace,
  assessment,
  isPaused,
  adjustMl,
  togglePause,
  content,
  mixAsi,
  mixSufor,
  noteText,
  elapsedSec,
  onClose,
}: {
  elapsedDisplay: string;
  elapsedMin: number;
  mlConsumed: number;
  targetMl: number;
  currentPace: number;
  assessment: ReturnType<typeof assessPace>;
  isPaused: boolean;
  adjustMl: (delta: number) => void;
  togglePause: () => void;
  content: "asi" | "sufor" | "mix";
  mixAsi: number;
  mixSufor: number;
  noteText: string;
  elapsedSec: number;
  onClose: () => void;
}) {
  void elapsedMin;
  const toneBg: Record<typeof assessment.tone, string> = {
    ok: "bg-emerald-50 text-emerald-800 border-emerald-200",
    warn: "bg-amber-50 text-amber-800 border-amber-200",
    alert: "bg-red-50 text-red-800 border-red-200",
  };
  const progressPct =
    targetMl > 0 ? Math.min(100, Math.round((mlConsumed / targetMl) * 100)) : 0;

  return (
    <div className="space-y-3">
      <div className="text-center">
        <div className="font-mono text-5xl font-bold tabular-nums text-rose-600">
          {elapsedDisplay}
          {isPaused ? (
            <span className="ml-2 text-base text-amber-500">⏸</span>
          ) : null}
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-widest text-gray-400">
          Stopwatch
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => adjustMl(-5)}
          className="rounded-xl border border-gray-200 bg-white py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          −5
        </button>
        <button
          type="button"
          onClick={() => adjustMl(-1)}
          className="rounded-xl border border-gray-200 bg-white py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          −1
        </button>
        <div className="flex flex-col items-center justify-center rounded-xl bg-rose-50 px-2 py-1">
          <div className="text-[10px] uppercase tracking-wider text-rose-600/60">
            ml
          </div>
          <div className="text-2xl font-bold tabular-nums text-rose-700">
            {mlConsumed}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => adjustMl(1)}
          className="rounded-xl border border-rose-200 bg-rose-50 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
        >
          +1
        </button>
        <button
          type="button"
          onClick={() => adjustMl(5)}
          className="rounded-xl border border-rose-200 bg-rose-50 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
        >
          +5
        </button>
        <button
          type="button"
          onClick={() => adjustMl(10)}
          className="rounded-xl border border-rose-200 bg-rose-50 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
        >
          +10
        </button>
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between text-[11px] text-gray-600">
          <span>
            Target {targetMl} ml ·{" "}
            <span className="tabular-nums">{progressPct}%</span>
          </span>
          <span className="font-semibold tabular-nums">
            {currentPace.toFixed(1)} ml/m
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full transition-all ${
              assessment.tone === "alert"
                ? "bg-red-500"
                : assessment.tone === "warn"
                  ? "bg-amber-400"
                  : "bg-emerald-400"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div
          className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium ${toneBg[assessment.tone]}`}
        >
          {assessment.label}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={togglePause}
          className={`rounded-xl border py-2 text-xs font-semibold ${
            isPaused
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {isPaused ? "▶ Lanjut" : "⏸ Pause"}
        </button>
        <SaveButton
          content={content}
          mlConsumed={mlConsumed}
          mixAsi={mixAsi}
          mixSufor={mixSufor}
          noteText={noteText}
          elapsedSec={elapsedSec}
          onSubmitDone={onClose}
        />
      </div>
    </div>
  );
}

function SaveButton({
  content,
  mlConsumed,
  mixAsi,
  mixSufor,
  noteText,
  elapsedSec,
  onSubmitDone,
}: {
  content: "asi" | "sufor" | "mix";
  mlConsumed: number;
  mixAsi: number;
  mixSufor: number;
  noteText: string;
  elapsedSec: number;
  onSubmitDone: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  // For mix: cap actual breakdown to mlConsumed proportionally
  const actualAsi =
    content === "mix" && mlConsumed > 0
      ? Math.round((mixAsi / Math.max(1, mixAsi + mixSufor)) * mlConsumed)
      : 0;
  const actualSufor =
    content === "mix" && mlConsumed > 0 ? mlConsumed - actualAsi : 0;
  return (
    <form
      ref={formRef}
      action={createLogAction}
      onSubmit={() => setTimeout(onSubmitDone, 0)}
    >
      <input type="hidden" name="subtype" value="feeding" />
      <input type="hidden" name="feeding_mode" value="sufor" />
      <input type="hidden" name="bottle_content" value={content} />
      {content === "mix" ? (
        <>
          <input type="hidden" name="amount_asi_ml" value={actualAsi} />
          <input type="hidden" name="amount_sufor_ml" value={actualSufor} />
        </>
      ) : null}
      <input type="hidden" name="amount_ml" value={mlConsumed} />
      <input type="hidden" name="notes" value={noteText} />
      <input type="hidden" name="return_to" value="/" />
      <SubmitButton
        pendingText="…"
        className="w-full rounded-xl bg-rose-500 py-2 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
      >
        ✓ Selesai · Simpan
      </SubmitButton>
      {/* Reference suppressed warning */}
      <input type="hidden" value={elapsedSec} readOnly />
    </form>
  );
}
