"use client";

import { useEffect, useRef, useState } from "react";
import {
  type CupFeedPace,
  assessPace,
} from "@/lib/constants/cup-feed";
import { createLogAction } from "@/app/actions/logs";
import { SubmitButton } from "@/components/SubmitButton";

/**
 * Feeding Coach — end-to-end flow:
 *   1. Setup: content (asi/sufor/mix) + target ml, sufor prep card
 *      (S26 scoop count + air panas/dingin 50/50)
 *   2. Method: pilih botol vs cup feeder
 *   3a. Active-bottle: stopwatch + ml tracker, pace assessment
 *   3b. Active-cup: per-cup tracking (default 20ml/cup) dengan
 *       countdown safety floor — "Cup selesai" requires confirmation
 *       kalau ditekan sebelum countdown habis (terlalu cepat = aspirasi
 *       risk). Warning kalau cup duration > 2× target (kelamaan,
 *       cek kalau bayi udah ga mau).
 *
 * On save, single feeding log dengan amount_ml total + notes deskripsi.
 */

type Method = "bottle" | "cup";
type Step = "setup" | "method" | "active-bottle" | "active-cup";

const SCOOP_GRAM = 4.4;
const SCOOP_PER_ML_WATER = 30; // 1 scoop S26 → 30 ml prepared volume

function suforPrep(suforMl: number): {
  scoops: number;
  grams: number;
  airPanas: number;
  airDingin: number;
} {
  if (suforMl <= 0)
    return { scoops: 0, grams: 0, airPanas: 0, airDingin: 0 };
  const scoopsRaw = suforMl / SCOOP_PER_ML_WATER;
  const scoops = Math.round(scoopsRaw * 2) / 2; // nearest 0.5
  const grams = Math.round(scoops * SCOOP_GRAM * 10) / 10;
  const half = Math.round(suforMl / 2);
  return {
    scoops,
    grams,
    airPanas: half,
    airDingin: suforMl - half,
  };
}

export function CupFeedCoach({
  cupPace,
  bottlePace,
  onClose,
}: {
  cupPace: CupFeedPace;
  bottlePace: CupFeedPace;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("setup");
  const [method, setMethod] = useState<Method>("cup");
  const [content, setContent] = useState<"asi" | "sufor" | "mix">("sufor");
  const [targetMl, setTargetMl] = useState<number>(30);
  const [mixAsi, setMixAsi] = useState<number>(15);
  const [mixSufor, setMixSufor] = useState<number>(15);

  // Bottle state
  const [bStart, setBStart] = useState<number | null>(null);
  const [bPaused, setBPaused] = useState<number | null>(null);
  const [bPauseAccum, setBPauseAccum] = useState<number>(0);
  const [bMl, setBMl] = useState<number>(0);

  // Cup state
  const [mlPerCup, setMlPerCup] = useState<number>(20);
  const [cups, setCups] = useState<{ ml: number; sec: number }[]>([]);
  const [curStart, setCurStart] = useState<number | null>(null);
  const [curMl, setCurMl] = useState<number>(0);

  // Spillage (ml tumpah/sisa) + attribution for mix
  const [spilledMl, setSpilledMl] = useState<number>(0);
  const [spilledAttribution, setSpilledAttribution] = useState<
    "asi" | "sufor" | "proporsional"
  >("proporsional");
  const [tick, setTick] = useState(0);

  // Auto split mix proportionally
  useEffect(() => {
    if (content === "mix") {
      const half = Math.round(targetMl / 2);
      setMixAsi(half);
      setMixSufor(targetMl - half);
    }
  }, [content, targetMl]);

  // Tick when an active timer is running
  useEffect(() => {
    const isBottleRunning =
      step === "active-bottle" && bStart != null && bPaused == null;
    const isCupRunning = step === "active-cup" && curStart != null;
    if (!isBottleRunning && !isCupRunning) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [step, bStart, bPaused, curStart]);

  // ESC closes
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);
  void tick;

  const suforPortionMl =
    content === "sufor" ? targetMl : content === "mix" ? mixSufor : 0;
  const prep = suforPrep(suforPortionMl);

  // Bottle elapsed
  const bElapsedMs =
    bStart == null
      ? 0
      : (bPaused ?? Date.now()) - bStart - bPauseAccum;
  const bElapsedSec = Math.max(0, Math.floor(bElapsedMs / 1000));
  const bElapsedMin = bElapsedSec / 60;
  const bPace = bElapsedMin > 0 ? bMl / bElapsedMin : 0;
  const bAssessment = assessPace(bPace, bottlePace);

  // Cup current
  const curElapsedSec =
    curStart == null
      ? 0
      : Math.max(0, Math.floor((Date.now() - curStart) / 1000));
  const curMinDurationSec = Math.ceil(
    (mlPerCup / Math.max(0.1, cupPace.mlPerMinMax)) * 60,
  );
  const curRemainingSec = Math.max(0, curMinDurationSec - curElapsedSec);
  const curIsOvertime = curElapsedSec > curMinDurationSec * 2;
  const cupTotalMl =
    cups.reduce((s, c) => s + c.ml, 0) + (curStart != null ? curMl : 0);

  const fmtMmSs = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const startBottle = () => {
    setStep("active-bottle");
    setBStart(Date.now());
    setBPaused(null);
    setBPauseAccum(0);
    setBMl(0);
  };
  const startCup = () => {
    setStep("active-cup");
    setCups([]);
    setCurStart(null);
    setCurMl(0);
  };

  const beginCup = () => {
    setCurStart(Date.now());
    setCurMl(0);
  };
  const finishCup = (force: boolean) => {
    if (curStart == null) return;
    if (!force && curRemainingSec > 0) {
      const ok = window.confirm(
        `Countdown belum habis (sisa ${fmtMmSs(curRemainingSec)}). Bayi mungkin belum sempat swallow — yakin selesai cup ini?`,
      );
      if (!ok) return;
    }
    setCups((prev) => [...prev, { ml: curMl, sec: curElapsedSec }]);
    setCurStart(null);
    setCurMl(0);
  };

  const togglePauseBottle = () => {
    if (bPaused != null) {
      setBPauseAccum(bPauseAccum + (Date.now() - bPaused));
      setBPaused(null);
    } else {
      setBPaused(Date.now());
    }
  };

  const adjustBottleMl = (d: number) =>
    setBMl((v) => Math.max(0, Math.min(500, v + d)));
  const adjustCupMl = (d: number) =>
    setCurMl((v) => Math.max(0, Math.min(mlPerCup * 2, v + d)));

  const totalMl = method === "bottle" ? bMl : cupTotalMl;
  const totalSec = method === "bottle" ? bElapsedSec : null;

  const noteText =
    method === "bottle"
      ? `🍼 Botol paced · ${bMl} ml dalam ${bElapsedSec >= 60 ? `${Math.round(bElapsedMin)}m` : `${bElapsedSec}s`} · pace ${bPace.toFixed(1)} ml/m (target ${bottlePace.mlPerMinMin}–${bottlePace.mlPerMinMax})`
      : `🥤 Cup feed · ${cupTotalMl} ml · ${cups.length} cup${
          cups.length > 1 ? "s" : ""
        } · ${cups.map((c) => `${c.ml}ml/${Math.round(c.sec / 60)}m`).join(", ")} · target ${cupPace.mlPerMinMin}–${cupPace.mlPerMinMax} ml/m`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Feeding Coach"
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
              {step === "setup"
                ? "🍼 Bikin Susu"
                : step === "method"
                  ? "🥄 Pilih Cara"
                  : step === "active-bottle"
                    ? "🍼 Botol Paced"
                    : "🥤 Cup Feed"}
            </h2>
            <p className="text-[11px] text-gray-500">
              {step === "active-bottle"
                ? `Pace target ${bottlePace.mlPerMinMin}–${bottlePace.mlPerMinMax} ml/m · ${bottlePace.label}`
                : step === "active-cup"
                  ? `Pace target ${cupPace.mlPerMinMin}–${cupPace.mlPerMinMax} ml/m · ${cupPace.label}`
                  : "Bantuan racik + tracker pace"}
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
            prep={prep}
            onNext={() => setStep("method")}
          />
        ) : step === "method" ? (
          <MethodStep
            cupPace={cupPace}
            bottlePace={bottlePace}
            targetMl={targetMl}
            onBack={() => setStep("setup")}
            onPick={(m) => {
              setMethod(m);
              if (m === "bottle") startBottle();
              else startCup();
            }}
          />
        ) : step === "active-bottle" ? (
          <ActiveBottle
            elapsedDisplay={fmtMmSs(bElapsedSec)}
            mlConsumed={bMl}
            targetMl={targetMl}
            currentPace={bPace}
            assessment={bAssessment}
            isPaused={bPaused != null}
            adjustMl={adjustBottleMl}
            togglePause={togglePauseBottle}
          />
        ) : (
          <ActiveCup
            mlPerCup={mlPerCup}
            setMlPerCup={setMlPerCup}
            cups={cups}
            curMl={curMl}
            curStart={curStart}
            curElapsedSec={curElapsedSec}
            curRemainingSec={curRemainingSec}
            curMinDurationSec={curMinDurationSec}
            curIsOvertime={curIsOvertime}
            cupTotalMl={cupTotalMl}
            targetMl={targetMl}
            cupPace={cupPace}
            adjustCupMl={adjustCupMl}
            beginCup={beginCup}
            finishCup={finishCup}
            fmtMmSs={fmtMmSs}
          />
        )}

        {step === "active-bottle" || step === "active-cup" ? (
          <div className="mt-3 space-y-2">
            <SpillagePicker
              spilledMl={spilledMl}
              setSpilledMl={setSpilledMl}
              content={content}
              spilledAttribution={spilledAttribution}
              setSpilledAttribution={setSpilledAttribution}
              suggested={Math.max(0, targetMl - totalMl)}
            />
            <SaveButton
              content={content}
              mlConsumed={totalMl}
              mixAsi={mixAsi}
              mixSufor={mixSufor}
              spilledMl={spilledMl}
              spilledAttribution={spilledAttribution}
              noteText={noteText}
              elapsedSec={totalSec ?? 0}
              onSubmitDone={onClose}
              disabled={totalMl <= 0}
            />
          </div>
        ) : null}
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
  prep,
  onNext,
}: {
  content: "asi" | "sufor" | "mix";
  setContent: (c: "asi" | "sufor" | "mix") => void;
  targetMl: number;
  setTargetMl: (n: number) => void;
  mixAsi: number;
  setMixAsi: (n: number) => void;
  mixSufor: number;
  setMixSufor: (n: number) => void;
  prep: ReturnType<typeof suforPrep>;
  onNext: () => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-700">
          Isi
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

      {prep.scoops > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
            🥛 Bikin sufor (S26 standard)
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-white p-2">
              <div className="text-[9px] uppercase tracking-wide text-gray-500">
                Powder
              </div>
              <div className="text-sm font-bold tabular-nums text-amber-700">
                {prep.scoops}× scoop
              </div>
              <div className="text-[10px] text-gray-500">
                ≈{prep.grams} gr
              </div>
            </div>
            <div className="rounded-lg bg-white p-2">
              <div className="text-[9px] uppercase tracking-wide text-gray-500">
                Air panas
              </div>
              <div className="text-sm font-bold tabular-nums text-rose-700">
                {prep.airPanas} ml
              </div>
              <div className="text-[10px] text-gray-500">~70°C</div>
            </div>
            <div className="rounded-lg bg-white p-2">
              <div className="text-[9px] uppercase tracking-wide text-gray-500">
                Air dingin
              </div>
              <div className="text-sm font-bold tabular-nums text-blue-700">
                {prep.airDingin} ml
              </div>
              <div className="text-[10px] text-gray-500">matang</div>
            </div>
          </div>
          <div className="mt-2 text-[10px] leading-snug text-amber-800/80">
            Urutan: panas dulu (sterilizes powder ≥70°C), masukkan {prep.scoops}{" "}
            scoop, kocok rata, lalu tambah air dingin matang sampai{" "}
            {prep.airPanas + prep.airDingin} ml. Test suhu di pergelangan
            tangan sebelum kasih.
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onNext}
        disabled={targetMl <= 0}
        className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 active:bg-rose-700 disabled:opacity-50"
      >
        Lanjut → Pilih cara feed
      </button>
    </div>
  );
}

function MethodStep({
  cupPace,
  bottlePace,
  targetMl,
  onBack,
  onPick,
}: {
  cupPace: CupFeedPace;
  bottlePace: CupFeedPace;
  targetMl: number;
  onBack: () => void;
  onPick: (m: Method) => void;
}) {
  const cupExpected = Math.round(
    targetMl / ((cupPace.mlPerMinMin + cupPace.mlPerMinMax) / 2),
  );
  const bottleExpected = Math.round(
    targetMl / ((bottlePace.mlPerMinMin + bottlePace.mlPerMinMax) / 2),
  );
  return (
    <div className="space-y-3">
      <div className="text-[12px] text-gray-600">
        Target {targetMl} ml. Pilih cara:
      </div>

      <button
        type="button"
        onClick={() => onPick("bottle")}
        className="block w-full rounded-2xl border-2 border-rose-200 bg-rose-50/40 p-3 text-left transition-colors hover:border-rose-300 hover:bg-rose-50"
      >
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            🍼
          </span>
          <div className="flex-1">
            <div className="text-sm font-bold text-rose-700">
              Botol (paced)
            </div>
            <div className="text-[11px] text-gray-600">
              ~{bottleExpected} menit · pace {bottlePace.mlPerMinMin}–
              {bottlePace.mlPerMinMax} ml/m
            </div>
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={() => onPick("cup")}
        className="block w-full rounded-2xl border-2 border-amber-200 bg-amber-50/40 p-3 text-left transition-colors hover:border-amber-300 hover:bg-amber-50"
      >
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            🥤
          </span>
          <div className="flex-1">
            <div className="text-sm font-bold text-amber-700">
              Cup feeder
            </div>
            <div className="text-[11px] text-gray-600">
              ~{cupExpected} menit total · per cup ~20 ml dengan countdown
              safety
            </div>
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={onBack}
        className="w-full rounded-xl border border-gray-200 bg-white py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        ← Kembali
      </button>
    </div>
  );
}

function ActiveBottle({
  elapsedDisplay,
  mlConsumed,
  targetMl,
  currentPace,
  assessment,
  isPaused,
  adjustMl,
  togglePause,
}: {
  elapsedDisplay: string;
  mlConsumed: number;
  targetMl: number;
  currentPace: number;
  assessment: ReturnType<typeof assessPace>;
  isPaused: boolean;
  adjustMl: (delta: number) => void;
  togglePause: () => void;
}) {
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

      <button
        type="button"
        onClick={togglePause}
        className={`w-full rounded-xl border py-2 text-xs font-semibold ${
          isPaused
            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
            : "border-amber-200 bg-amber-50 text-amber-700"
        }`}
      >
        {isPaused ? "▶ Lanjut" : "⏸ Pause"}
      </button>
    </div>
  );
}

function ActiveCup({
  mlPerCup,
  setMlPerCup,
  cups,
  curMl,
  curStart,
  curElapsedSec,
  curRemainingSec,
  curMinDurationSec,
  curIsOvertime,
  cupTotalMl,
  targetMl,
  cupPace,
  adjustCupMl,
  beginCup,
  finishCup,
  fmtMmSs,
}: {
  mlPerCup: number;
  setMlPerCup: (n: number) => void;
  cups: { ml: number; sec: number }[];
  curMl: number;
  curStart: number | null;
  curElapsedSec: number;
  curRemainingSec: number;
  curMinDurationSec: number;
  curIsOvertime: boolean;
  cupTotalMl: number;
  targetMl: number;
  cupPace: CupFeedPace;
  adjustCupMl: (d: number) => void;
  beginCup: () => void;
  finishCup: (force: boolean) => void;
  fmtMmSs: (sec: number) => string;
}) {
  const targetReached = cupTotalMl >= targetMl;
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-amber-50/60 p-3">
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="font-semibold text-amber-800">
            Total tercatat
          </span>
          <span className="text-gray-500">target {targetMl} ml</span>
        </div>
        <div className="mt-0.5 text-2xl font-bold tabular-nums text-amber-700">
          {cupTotalMl} ml
          {targetReached ? (
            <span className="ml-2 text-xs font-semibold text-emerald-600">
              ✓ tercapai
            </span>
          ) : null}
        </div>
        {cups.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {cups.map((c, i) => (
              <span
                key={i}
                className="rounded-full bg-white px-2 py-0.5 text-[10px] text-amber-700"
              >
                Cup {i + 1}: {c.ml}ml · {Math.round(c.sec / 60)}m
                {c.sec % 60}s
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {curStart == null ? (
        <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-[11px] font-semibold text-gray-700">
            Cup berikut · target ml
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[10, 15, 20, 30].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setMlPerCup(n)}
                className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${
                  mlPerCup === n
                    ? "border-amber-400 bg-amber-50 text-amber-700"
                    : "border-gray-200 bg-white text-gray-600"
                }`}
              >
                {n} ml
              </button>
            ))}
          </div>
          <div className="text-[10px] leading-snug text-gray-500">
            Min countdown safety: ≥
            {fmtMmSs(
              Math.ceil((mlPerCup / Math.max(0.1, cupPace.mlPerMinMax)) * 60),
            )}{" "}
            (max pace {cupPace.mlPerMinMax} ml/m)
          </div>
          <button
            type="button"
            onClick={beginCup}
            className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-600"
          >
            ▶ Mulai Cup {cups.length + 1}
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border-2 border-amber-300 bg-white p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
              Cup {cups.length + 1} · target {mlPerCup} ml
            </span>
            <span className="font-mono text-lg font-bold tabular-nums text-amber-700">
              {fmtMmSs(curElapsedSec)}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => adjustCupMl(-1)}
              className="rounded-xl border border-gray-200 bg-white py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              −1
            </button>
            <div className="flex flex-col items-center justify-center rounded-xl bg-amber-50 px-2 py-1">
              <div className="text-[10px] uppercase tracking-wider text-amber-600/60">
                ml cup ini
              </div>
              <div className="text-2xl font-bold tabular-nums text-amber-700">
                {curMl}
              </div>
            </div>
            <button
              type="button"
              onClick={() => adjustCupMl(1)}
              className="rounded-xl border border-amber-200 bg-amber-50 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
            >
              +1
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => adjustCupMl(-5)}
              className="rounded-xl border border-gray-200 bg-white py-2 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
            >
              −5
            </button>
            <button
              type="button"
              onClick={() => adjustCupMl(5)}
              className="rounded-xl border border-amber-200 bg-amber-50 py-2 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
            >
              +5
            </button>
            <button
              type="button"
              onClick={() => adjustCupMl(10)}
              className="rounded-xl border border-amber-200 bg-amber-50 py-2 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
            >
              +10
            </button>
          </div>

          <div className="space-y-1">
            {curRemainingSec > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-800">
                ⏳ Countdown safety: {fmtMmSs(curRemainingSec)} lagi sebelum
                aman selesai (max pace {cupPace.mlPerMinMax} ml/m)
              </div>
            ) : curIsOvertime ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] font-medium text-red-800">
                ⚠ Cup berjalan {fmtMmSs(curElapsedSec)} (&gt;2× target{" "}
                {fmtMmSs(curMinDurationSec)}) — bayi mungkin udah ga mau /
                kelelahan, cek cue
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] font-medium text-emerald-800">
                ✓ Pace aman — boleh selesai cup ini kapan saja
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => finishCup(false)}
            className={`w-full rounded-xl border py-2.5 text-sm font-semibold ${
              curRemainingSec > 0
                ? "border-amber-300 bg-white text-amber-700"
                : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            {curRemainingSec > 0
              ? `⚠ Selesai sebelum waktu (${fmtMmSs(curRemainingSec)} sisa)`
              : "✓ Selesai cup"}
          </button>
        </div>
      )}
    </div>
  );
}

function SpillagePicker({
  spilledMl,
  setSpilledMl,
  content,
  spilledAttribution,
  setSpilledAttribution,
  suggested,
}: {
  spilledMl: number;
  setSpilledMl: (n: number) => void;
  content: "asi" | "sufor" | "mix";
  spilledAttribution: "asi" | "sufor" | "proporsional";
  setSpilledAttribution: (a: "asi" | "sufor" | "proporsional") => void;
  suggested: number;
}) {
  const showSuggest = suggested > 0 && suggested !== spilledMl;
  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold text-amber-800">
          Tumpah / sisa (ml)
        </label>
        <div className="flex items-center gap-1.5">
          {showSuggest ? (
            <button
              type="button"
              onClick={() => setSpilledMl(suggested)}
              className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-200"
              title="Set ke selisih target − terminum"
            >
              {suggested}
            </button>
          ) : null}
          <select
            value={spilledMl}
            onChange={(e) => setSpilledMl(Number(e.target.value))}
            className="appearance-none rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm font-semibold tabular-nums text-amber-900 outline-none focus:border-amber-400"
          >
            {Array.from({ length: 51 }, (_, i) => (
              <option key={i} value={i}>
                {i} ml
              </option>
            ))}
          </select>
        </div>
      </div>
      {content === "mix" && spilledMl > 0 ? (
        <div className="mt-2">
          <label className="block text-[11px] font-semibold text-amber-800">
            Tumpahnya dari sisi mana?
          </label>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {(
              [
                { v: "asi", label: "🤱 ASI" },
                { v: "proporsional", label: "≈ Mix" },
                { v: "sufor", label: "🥛 Sufor" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setSpilledAttribution(opt.v)}
                className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  spilledAttribution === opt.v
                    ? "border-amber-400 bg-amber-100 text-amber-900"
                    : "border-amber-200 bg-white text-amber-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SaveButton({
  content,
  mlConsumed,
  mixAsi,
  mixSufor,
  spilledMl,
  spilledAttribution,
  noteText,
  elapsedSec,
  onSubmitDone,
  disabled,
}: {
  content: "asi" | "sufor" | "mix";
  mlConsumed: number;
  mixAsi: number;
  mixSufor: number;
  spilledMl: number;
  spilledAttribution: "asi" | "sufor" | "proporsional";
  noteText: string;
  elapsedSec: number;
  onSubmitDone: () => void;
  disabled?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
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
      {spilledMl > 0 ? (
        <>
          <input type="hidden" name="amount_spilled_ml" value={spilledMl} />
          {content === "mix" ? (
            <input
              type="hidden"
              name="spilled_attribution"
              value={spilledAttribution}
            />
          ) : null}
        </>
      ) : null}
      <input type="hidden" name="notes" value={noteText} />
      <input type="hidden" name="return_to" value="/" />
      <SubmitButton
        pendingText="…"
        disabled={disabled}
        className="w-full rounded-xl bg-rose-500 py-2.5 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
      >
        ✓ Selesai sesi · Simpan {mlConsumed} ml
        {spilledMl > 0 ? ` (+${spilledMl} tumpah)` : ""}
      </SubmitButton>
      <input type="hidden" value={elapsedSec} readOnly />
    </form>
  );
}
