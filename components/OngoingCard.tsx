"use client";

import { useEffect, useState } from "react";
import {
  endOngoingSleepAction,
  endOngoingPumpingAction,
  endOngoingDbfAction,
  endOngoingHiccupAction,
  endOngoingTummyAction,
  pumpingPindahAction,
  pauseOngoingLogAction,
  resumeFromPauseAction,
  startOngoingLogAction as startOngoingLogActionImported,
} from "@/app/actions/logs";
import { Stopwatch } from "@/components/Stopwatch";
import { LiveClock } from "@/components/LiveClock";
import { SubmitButton } from "@/components/SubmitButton";
import { FormCloser } from "@/components/FormCloser";

type Subtype = "sleep" | "pumping" | "dbf" | "hiccup" | "tummy";

const TITLES: Record<Subtype, string> = {
  sleep: "Tidur",
  pumping: "Pumping",
  dbf: "DBF",
  hiccup: "Cegukan",
  tummy: "Tummy Time",
};

const EMOJIS: Record<Subtype, string> = {
  sleep: "😴",
  pumping: "💧",
  dbf: "🤱",
  hiccup: "🫨",
  tummy: "🐢",
};

function fmtClock(iso: string): string {
  // Locked to Asia/Jakarta with en-GB locale (uses colon) so server
  // and client render identically as "HH:MM" — no hydration mismatch.
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function OngoingCard({
  id,
  subtype,
  startIso,
  pausedAtIso,
  pumpStartLAt,
  pumpEndLAt,
  pumpStartRAt,
  pumpEndRAt,
  dbfMlPerMin,
  autoOpenLamp,
  otherPumpingOngoing,
}: {
  id: string;
  subtype: Subtype;
  startIso: string;
  pausedAtIso?: string | null;
  pumpStartLAt?: string | null;
  pumpEndLAt?: string | null;
  pumpStartRAt?: string | null;
  pumpEndRAt?: string | null;
  /** Used in NightLamp DBF view to estimate ml = duration × rate. */
  dbfMlPerMin?: number | null;
  /** Initial state — auto-open NightLamp on mount (e.g. just submitted
   *  manual sleep with empty Bangun). */
  autoOpenLamp?: boolean;
  /** True if a separate pumping session is already ongoing — used by
   *  DBF card to hide "Sambil pumping" combo shortcut. */
  otherPumpingOngoing?: boolean;
}) {
  const [showLamp, setShowLamp] = useState(!!autoOpenLamp);
  const [showPumpEnd, setShowPumpEnd] = useState(false);

  const title = TITLES[subtype];
  const emoji = EMOJIS[subtype];
  const isPaused = !!pausedAtIso;

  return (
    <>
      <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-rose-600">
              <span className="text-xl" aria-hidden>{emoji}</span>
              <span className="text-base font-bold">
                {title}{" "}
                <span className="text-xs font-semibold uppercase tracking-wide">
                  {isPaused ? "dijeda" : "berlangsung"}
                </span>
              </span>
              {isPaused ? (
                <span aria-hidden>⏸</span>
              ) : (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
                </span>
              )}
            </div>
            <div className="text-[11px] text-gray-500">
              Sejak {fmtClock(startIso)}
              {isPaused ? " · auto-end 10 menit kalau tetap dijeda" : ""}
            </div>
          </div>
          {subtype !== "hiccup" && subtype !== "tummy" ? (
            <button
              type="button"
              onClick={() => setShowLamp(true)}
              className="rounded-full bg-gray-900/5 p-2 text-gray-600 hover:bg-gray-900/10"
              aria-label="Mode dark"
            >
              🌑
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() =>
            subtype !== "hiccup" &&
            subtype !== "tummy" &&
            setShowLamp(true)
          }
          className="mt-2 block w-full text-left"
        >
          <Stopwatch
            startIso={startIso}
            pausedAtIso={pausedAtIso ?? null}
            className={`font-mono text-4xl font-bold tabular-nums tracking-tight ${
              isPaused ? "text-gray-500" : "text-rose-600"
            }`}
          />
        </button>

        {/* Pause / Resume controls — universal for all ongoing subtypes */}
        <form
          action={isPaused ? resumeFromPauseAction : pauseOngoingLogAction}
          className="mt-2"
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="return_to" value="/" />
          <SubmitButton
            pendingText="…"
            className={`w-full rounded-xl border py-2 text-xs font-semibold ${
              isPaused
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
            }`}
          >
            {isPaused ? "▶ Lanjutkan" : "⏸ Pause"}
          </SubmitButton>
        </form>

        {subtype === "sleep" ? (
          <SleepLightControls id={id} />
        ) : subtype === "pumping" ? (
          <PumpingControls
            id={id}
            startLAt={pumpStartLAt ?? null}
            endLAt={pumpEndLAt ?? null}
            startRAt={pumpStartRAt ?? null}
            endRAt={pumpEndRAt ?? null}
            onShowEnd={() => setShowPumpEnd(true)}
          />
        ) : subtype === "dbf" ? (
          <DbfControls
            id={id}
            startLAt={pumpStartLAt ?? null}
            endLAt={pumpEndLAt ?? null}
            startRAt={pumpStartRAt ?? null}
            endRAt={pumpEndRAt ?? null}
            otherPumpingOngoing={!!otherPumpingOngoing}
          />
        ) : subtype === "hiccup" ? (
          <HiccupControls id={id} />
        ) : (
          <TummyControls id={id} />
        )}
      </div>

      {showLamp ? (
        <NightLamp
          id={id}
          subtype={subtype}
          startIso={startIso}
          pausedAtIso={pausedAtIso ?? null}
          title={title}
          pumpStartLAt={pumpStartLAt ?? null}
          pumpEndLAt={pumpEndLAt ?? null}
          pumpStartRAt={pumpStartRAt ?? null}
          pumpEndRAt={pumpEndRAt ?? null}
          dbfMlPerMin={dbfMlPerMin ?? null}
          onClose={() => setShowLamp(false)}
          onPumpStop={() => {
            setShowLamp(false);
            setShowPumpEnd(true);
          }}
        />
      ) : null}

      {showPumpEnd ? (
        <EndPumpingModal id={id} onClose={() => setShowPumpEnd(false)} />
      ) : null}
    </>
  );
}

function NightLamp({
  id,
  subtype,
  startIso,
  pausedAtIso,
  title,
  pumpStartLAt,
  pumpEndLAt,
  pumpStartRAt,
  pumpEndRAt,
  dbfMlPerMin,
  onClose,
  onPumpStop,
}: {
  id: string;
  subtype: Subtype;
  startIso: string;
  pausedAtIso: string | null;
  title: string;
  pumpStartLAt: string | null;
  pumpEndLAt: string | null;
  pumpStartRAt: string | null;
  pumpEndRAt: string | null;
  dbfMlPerMin: number | null;
  onClose: () => void;
  onPumpStop: () => void;
}) {
  const [askingQuality, setAskingQuality] = useState(false);
  const [askingDbfEff, setAskingDbfEff] = useState(false);
  const isPaused = !!pausedAtIso;
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  // Request fullscreen so the browser chrome (URL bar, tabs) hides on
  // tablet/desktop, leaving only the dim night-lamp surface. Browsers
  // require a user gesture; the click that opened this modal counts.
  // iOS Safari ignores fullscreen on web pages — installing as PWA
  // (Add to Home Screen) gives the same effect natively.
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    }
    return () => {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  // Swap the iOS / Android system status-bar tint to black while the
  // night-lamp is open — otherwise PWA / Safari uses the manifest
  // theme_color (rose) which shows as a bright red strip at the top of
  // the screen, defeating the dim purpose. Restore the original on close.
  // Also paint <html> + <body> + safe-area-top black so the iOS PWA
  // status bar (black-translucent) shows pure black underneath instead
  // of a thin rose strip from the page background gradient.
  useEffect(() => {
    const meta = document.querySelector(
      'meta[name="theme-color"]',
    ) as HTMLMetaElement | null;
    const prevTheme = meta?.getAttribute("content") ?? null;
    if (meta) meta.setAttribute("content", "#000000");

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.background;
    const prevBodyBg = body.style.background;
    html.style.background = "#000";
    body.style.background = "#000";

    return () => {
      if (meta && prevTheme !== null) meta.setAttribute("content", prevTheme);
      html.style.background = prevHtmlBg;
      body.style.background = prevBodyBg;
    };
  }, []);

  const darkBtn =
    "rounded-2xl border border-red-900/40 bg-transparent py-3 text-base font-semibold text-red-700/90 hover:bg-red-950/30 active:bg-red-950/50";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black"
      style={{ color: "#7f1d1d" }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 text-xs uppercase tracking-widest text-red-900/70 hover:text-red-700"
        aria-label="Tutup night lamp"
      >
        Tutup ✕
      </button>

      <LiveClock className="absolute left-4 top-4 font-mono text-4xl font-bold tabular-nums text-red-600 sm:text-5xl" />

      <div className="text-2xl font-bold uppercase tracking-[0.3em] text-red-600 sm:text-3xl">
        {title}
        {isPaused ? (
          <span className="ml-2 text-base font-medium normal-case tracking-normal text-amber-500/80">
            ⏸ dijeda
          </span>
        ) : null}
      </div>
      <Stopwatch
        startIso={startIso}
        pausedAtIso={pausedAtIso}
        className={`mt-4 font-mono text-7xl font-light tabular-nums sm:text-[8rem] ${
          isPaused ? "text-amber-500/70" : "text-red-700/90"
        }`}
      />
      <div className="mt-3 text-lg font-semibold tracking-widest text-red-600/90 sm:text-xl">
        Sejak {fmtClock(startIso)}
      </div>

      {subtype === "dbf" ? (
        <DbfDarkSummary
          startLAt={pumpStartLAt}
          endLAt={pumpEndLAt}
          startRAt={pumpStartRAt}
          endRAt={pumpEndRAt}
          dbfMlPerMin={dbfMlPerMin}
        />
      ) : null}

      <div className="mt-10 w-full max-w-sm space-y-3 px-6">
        {/* Pause / Resume — universal, always available */}
        <form
          action={isPaused ? resumeFromPauseAction : pauseOngoingLogAction}
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="return_to" value="/" />
          <SubmitButton
            pendingText="…"
            className={`w-full rounded-2xl border py-3 text-base font-semibold ${
              isPaused
                ? "border-emerald-700/40 bg-transparent text-emerald-500/90 hover:bg-emerald-950/30"
                : "border-amber-700/40 bg-transparent text-amber-500/90 hover:bg-amber-950/30"
            }`}
          >
            {isPaused ? "▶ Lanjutkan" : "⏸ Pause"}
          </SubmitButton>
        </form>

        {subtype === "sleep" ? (
          askingQuality ? (
            <SleepQualityStep
              id={id}
              onClose={onClose}
              onCancel={() => setAskingQuality(false)}
              darkBtn={darkBtn}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAskingQuality(true)}
              className={`w-full ${darkBtn}`}
            >
              Bangun · Stop
            </button>
          )
        ) : subtype === "dbf" ? (
          askingDbfEff ? (
            <DbfDarkEffectivenessStep
              id={id}
              onClose={onClose}
              onCancel={() => setAskingDbfEff(false)}
              darkBtn={darkBtn}
            />
          ) : (
            <>
              <DarkPindahButton
                id={id}
                startLAt={pumpStartLAt}
                endLAt={pumpEndLAt}
                startRAt={pumpStartRAt}
                endRAt={pumpEndRAt}
                darkBtn={darkBtn}
              />
              <button
                type="button"
                onClick={() => setAskingDbfEff(true)}
                className={`w-full ${darkBtn}`}
              >
                Selesai · Simpan
              </button>
            </>
          )
        ) : subtype === "pumping" ? (
          <button
            type="button"
            onClick={onPumpStop}
            className={`w-full ${darkBtn}`}
          >
            Stop · Catat ml
          </button>
        ) : null}
      </div>

      <p className="absolute bottom-6 px-6 text-center text-[10px] tracking-widest text-red-950/40">
        Layar redup · Esc atau Tutup ✕ untuk keluar
      </p>
    </div>
  );
}

function DbfDarkEffectivenessStep({
  id,
  onClose,
  onCancel,
  darkBtn,
}: {
  id: string;
  onClose: () => void;
  onCancel: () => void;
  darkBtn: string;
}) {
  return (
    <div className="space-y-2">
      <p className="mb-2 text-center text-xs uppercase tracking-widest text-red-700/70">
        Efektivitas DBF?
      </p>
      {(
        [
          { value: "efektif", label: "😊 Efektif (100%)" },
          { value: "sedang", label: "😐 Sedang (80%)" },
          { value: "kurang_efektif", label: "😟 Kurang efektif (60%)" },
          { value: "", label: "Skip" },
        ] as const
      ).map((opt) => (
        <form
          key={opt.value || "skip"}
          action={endOngoingDbfAction}
          onSubmit={() => setTimeout(onClose, 0)}
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="return_to" value="/" />
          <input type="hidden" name="effectiveness" value={opt.value} />
          <FormCloser onClose={onClose} />
          <SubmitButton
            pendingText="Menyimpan…"
            className={`w-full ${darkBtn}`}
          >
            {opt.label}
          </SubmitButton>
        </form>
      ))}
      <button
        type="button"
        onClick={onCancel}
        className="mt-2 w-full text-center text-xs uppercase tracking-widest text-red-900/60 hover:text-red-700"
      >
        ← Batal stop
      </button>
    </div>
  );
}

function DarkPindahButton({
  id,
  startLAt,
  endLAt,
  startRAt,
  endRAt,
  darkBtn,
}: {
  id: string;
  startLAt: string | null;
  endLAt: string | null;
  startRAt: string | null;
  endRAt: string | null;
  darkBtn: string;
}) {
  const lActive = !!startLAt && !endLAt;
  const rActive = !!startRAt && !endRAt;
  const canPindah = (lActive && !startRAt) || (rActive && !startLAt);
  if (!canPindah) return null;
  const fromSide: "kiri" | "kanan" = lActive ? "kiri" : "kanan";
  const otherSide = fromSide === "kiri" ? "Kanan" : "Kiri";
  return (
    <form action={pumpingPindahAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="from_side" value={fromSide} />
      <input type="hidden" name="pindah_offset_min" value="0" />
      <input type="hidden" name="return_to" value="/" />
      <SubmitButton
        pendingText="Memindah…"
        className={`w-full ${darkBtn}`}
      >
        ⇄ Pindah ke {otherSide}
      </SubmitButton>
    </form>
  );
}

function SleepQualityStep({
  id,
  onClose,
  onCancel,
  darkBtn,
}: {
  id: string;
  onClose: () => void;
  onCancel: () => void;
  darkBtn: string;
}) {
  return (
    <div className="space-y-2">
      <p className="mb-2 text-center text-xs uppercase tracking-widest text-red-700/70">
        Bagaimana kualitas tidurnya?
      </p>
      {(
        [
          { value: "nyenyak", label: "😴 Nyenyak" },
          { value: "gelisah", label: "😣 Gelisah" },
          { value: "sering_bangun", label: "😢 Sering bangun" },
          { value: "", label: "Skip" },
        ] as const
      ).map((opt) => (
        <form
          key={opt.value || "skip"}
          action={endOngoingSleepAction}
          onSubmit={() => setTimeout(onClose, 0)}
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="return_to" value="/" />
          <input type="hidden" name="sleep_quality" value={opt.value} />
          <FormCloser onClose={onClose} />
          <SubmitButton
            pendingText="Menyimpan…"
            className={`w-full ${darkBtn}`}
          >
            {opt.label}
          </SubmitButton>
        </form>
      ))}
      <button
        type="button"
        onClick={onCancel}
        className="mt-2 w-full text-center text-xs uppercase tracking-widest text-red-900/60 hover:text-red-700"
      >
        ← Batal stop
      </button>
    </div>
  );
}

function DbfDarkSummary({
  startLAt,
  endLAt,
  startRAt,
  endRAt,
  dbfMlPerMin,
}: {
  startLAt: string | null;
  endLAt: string | null;
  startRAt: string | null;
  endRAt: string | null;
  dbfMlPerMin: number | null;
}) {
  // Live tick for active sides; static for ended sides.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const sideMins = (start: string | null, end: string | null): number => {
    if (!start) return 0;
    const startMs = new Date(start).getTime();
    const endMs = end ? new Date(end).getTime() : now;
    return Math.max(0, (endMs - startMs) / 60000);
  };
  const lMin = sideMins(startLAt, endLAt);
  const rMin = sideMins(startRAt, endRAt);
  const totalMin = lMin + rMin;
  const rate =
    typeof dbfMlPerMin === "number" && dbfMlPerMin > 0 ? dbfMlPerMin : null;

  if (totalMin === 0) return null;

  const fmtMin = (m: number): string => {
    if (m < 1) return "0:00";
    const total = Math.floor(m * 60);
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    return `${mm}:${ss.toString().padStart(2, "0")}`;
  };

  return (
    <div className="mt-6 grid w-full max-w-sm grid-cols-2 gap-3 px-6 text-center">
      <SideTile
        active={!!startLAt && !endLAt}
        label="Kiri"
        timeText={fmtMin(lMin)}
        mlText={rate ? `≈${Math.round(lMin * rate)} ml` : null}
      />
      <SideTile
        active={!!startRAt && !endRAt}
        label="Kanan"
        timeText={fmtMin(rMin)}
        mlText={rate ? `≈${Math.round(rMin * rate)} ml` : null}
      />
      {rate ? (
        <div className="col-span-2 text-[11px] tracking-widest text-red-900/50">
          Total ≈{Math.round(totalMin * rate)} ml ({rate.toFixed(1)} ml/menit)
        </div>
      ) : null}
    </div>
  );
}

function SideTile({
  active,
  label,
  timeText,
  mlText,
}: {
  active: boolean;
  label: string;
  timeText: string;
  mlText: string | null;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 ${
        active
          ? "border-red-700/60 bg-red-950/20"
          : "border-red-900/30 bg-transparent"
      }`}
    >
      <div className="text-[11px] uppercase tracking-widest text-red-900/60">
        {label} {active ? "· aktif" : ""}
      </div>
      <div className="mt-1 font-mono text-2xl tabular-nums text-red-700/90">
        {timeText}
      </div>
      {mlText ? (
        <div className="mt-0.5 text-[11px] text-red-900/60">{mlText}</div>
      ) : null}
    </div>
  );
}

function EndPumpingModal({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl md:rounded-3xl"
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="-ml-1 p-1 text-gray-400 hover:text-gray-700"
            aria-label="Tutup"
          >
            ✕
          </button>
          <div className="text-sm font-semibold text-gray-800">Selesai pumping</div>
          <span className="w-6" />
        </div>

        <form
          action={endOngoingPumpingAction}
          onSubmit={() => setTimeout(onClose, 0)}
          className="mt-4 space-y-4"
        >
          <FormCloser onClose={onClose} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="return_to" value="/" />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                Kiri (ml)
              </span>
              <PumpMlSelect name="amount_l_ml" autoFocus />
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                Kanan (ml)
              </span>
              <PumpMlSelect name="amount_r_ml" />
            </div>
          </div>
          <p className="text-center text-[10px] text-gray-400">
            Tap angka → muncul wheel picker (iOS) / dropdown (web). Tidak
            buka keyboard.
          </p>

          <div className="sticky bottom-0 -mx-5 -mb-5 mt-2 border-t border-gray-100 bg-white/95 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80">
            <SubmitButton
              pendingText="Menyimpan…"
              className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 active:bg-rose-700"
            >
              Simpan
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function PumpingControls({
  id,
  startLAt,
  endLAt,
  startRAt,
  endRAt,
  onShowEnd,
}: {
  id: string;
  startLAt: string | null;
  endLAt: string | null;
  startRAt: string | null;
  endRAt: string | null;
  onShowEnd: () => void;
}) {
  // Determine which side is currently active. "Active" = started but not
  // yet ended.
  const lActive = !!startLAt && !endLAt;
  const rActive = !!startRAt && !endRAt;
  // If only one side has been started so far AND it's still active, show
  // a Pindah button. After Pindah-ing once, both sides have been started
  // → Pindah no longer makes sense (we'd flip back to a finished side).
  const canPindah =
    (lActive && !startRAt) || (rActive && !startLAt);
  const fromSide: "kiri" | "kanan" | null = canPindah
    ? lActive
      ? "kiri"
      : "kanan"
    : null;
  const otherSide = fromSide === "kiri" ? "Kanan" : "Kiri";

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-center gap-2 text-[11px] text-gray-500">
        {lActive ? (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700">
            🤱 Kiri aktif
          </span>
        ) : null}
        {rActive ? (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700">
            🤱 Kanan aktif
          </span>
        ) : null}
        {!lActive && !rActive ? (
          <span>Tidak ada sisi aktif — selesai untuk catat ml</span>
        ) : null}
      </div>
      {canPindah && fromSide ? (
        <PindahForm id={id} fromSide={fromSide} otherSide={otherSide} />
      ) : null}
      <button
        type="button"
        onClick={onShowEnd}
        className="w-full rounded-xl bg-rose-500 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 active:bg-rose-700"
      >
        Selesai · Catat ml
      </button>
    </div>
  );
}

const PINDAH_OFFSETS: { value: number; label: string }[] = [
  { value: 0, label: "Sekarang" },
  { value: 1, label: "1 mnt lalu" },
  { value: 3, label: "3 mnt lalu" },
  { value: 5, label: "5 mnt lalu" },
  { value: 10, label: "10 mnt lalu" },
];

function PindahForm({
  id,
  fromSide,
  otherSide,
}: {
  id: string;
  fromSide: "kiri" | "kanan";
  otherSide: string;
}) {
  return (
    <form action={pumpingPindahAction} className="space-y-1.5">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="from_side" value={fromSide} />
      <input type="hidden" name="return_to" value="/" />
      <select
        name="pindah_offset_min"
        defaultValue={0}
        className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-rose-400"
      >
        {PINDAH_OFFSETS.map((o) => (
          <option key={o.value} value={o.value}>
            Pindah · {o.label}
          </option>
        ))}
      </select>
      <SubmitButton
        pendingText="Memindah…"
        className="w-full rounded-xl border border-rose-200 bg-white py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"
      >
        ⇄ Pindah ke {otherSide}
      </SubmitButton>
    </form>
  );
}

function SleepLightControls({ id }: { id: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="mt-3 w-full rounded-xl bg-rose-500 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 active:bg-rose-700"
      >
        Bangun · Stop
      </button>
    );
  }
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-rose-100 bg-rose-50/40 p-3">
      <p className="text-center text-[11px] font-semibold text-rose-700">
        Bagaimana kualitas tidurnya?
      </p>
      {(
        [
          { value: "nyenyak", label: "😴 Nyenyak" },
          { value: "gelisah", label: "😣 Gelisah" },
          { value: "sering_bangun", label: "😢 Sering bangun" },
          { value: "", label: "Skip" },
        ] as const
      ).map((opt) => (
        <form key={opt.value || "skip"} action={endOngoingSleepAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="return_to" value="/" />
          <input type="hidden" name="sleep_quality" value={opt.value} />
          <SubmitButton
            pendingText="…"
            className="w-full rounded-xl border border-rose-200 bg-white py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 active:scale-[0.98]"
          >
            {opt.label}
          </SubmitButton>
        </form>
      ))}
      <button
        type="button"
        onClick={() => setAsking(false)}
        className="w-full text-center text-[11px] text-gray-400 hover:text-gray-600"
      >
        ← Batal stop
      </button>
    </div>
  );
}

function HiccupControls({ id }: { id: string }) {
  return (
    <form action={endOngoingHiccupAction} className="mt-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="return_to" value="/" />
      <SubmitButton
        pendingText="Menyimpan…"
        className="w-full rounded-xl bg-rose-500 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 active:bg-rose-700"
      >
        Selesai · Simpan
      </SubmitButton>
    </form>
  );
}

function TummyControls({ id }: { id: string }) {
  return (
    <form action={endOngoingTummyAction} className="mt-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="return_to" value="/" />
      <SubmitButton
        pendingText="Menyimpan…"
        className="w-full rounded-xl bg-rose-500 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 active:bg-rose-700"
      >
        Selesai · Simpan
      </SubmitButton>
    </form>
  );
}

function DbfControls({
  id,
  startLAt,
  endLAt,
  startRAt,
  endRAt,
  otherPumpingOngoing,
}: {
  id: string;
  startLAt: string | null;
  endLAt: string | null;
  startRAt: string | null;
  endRAt: string | null;
  otherPumpingOngoing: boolean;
}) {
  const [askingEffectiveness, setAskingEffectiveness] = useState(false);
  const lActive = !!startLAt && !endLAt;
  const rActive = !!startRAt && !endRAt;
  const canPindah = (lActive && !startRAt) || (rActive && !startLAt);
  const fromSide: "kiri" | "kanan" | null = canPindah
    ? lActive
      ? "kiri"
      : "kanan"
    : null;
  const otherSide = fromSide === "kiri" ? "Kanan" : "Kiri";
  const comboPumpSide: "kiri" | "kanan" | null =
    !otherPumpingOngoing && (lActive || rActive)
      ? lActive
        ? "kanan"
        : "kiri"
      : null;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-center gap-2 text-[11px] text-gray-500">
        {lActive ? (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700">
            🤱 Kiri aktif
          </span>
        ) : null}
        {rActive ? (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700">
            🤱 Kanan aktif
          </span>
        ) : null}
        {!lActive && !rActive ? (
          <span>Tidak ada sisi aktif — selesai untuk menyimpan</span>
        ) : null}
      </div>
      {!askingEffectiveness && canPindah && fromSide ? (
        <PindahForm id={id} fromSide={fromSide} otherSide={otherSide} />
      ) : null}
      {!askingEffectiveness && comboPumpSide ? (
        <ComboPumpButton side={comboPumpSide} />
      ) : null}
      {askingEffectiveness ? (
        <DbfEffectivenessStep
          id={id}
          onCancel={() => setAskingEffectiveness(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAskingEffectiveness(true)}
          className="w-full rounded-xl bg-rose-500 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 active:bg-rose-700"
        >
          Selesai · Simpan
        </button>
      )}
    </div>
  );
}

function DbfEffectivenessStep({
  id,
  onCancel,
}: {
  id: string;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-rose-100 bg-rose-50/40 p-3">
      <p className="text-center text-[11px] font-semibold text-rose-700">
        Bagaimana efektivitas DBF?
      </p>
      <p className="text-center text-[10px] leading-snug text-gray-500">
        Audible swallow + breast soft post-feed = efektif
      </p>
      {(
        [
          {
            value: "efektif",
            label: "😊 Efektif (100%)",
            hint: "Audible swallows, breast soft setelah",
          },
          {
            value: "sedang",
            label: "😐 Sedang (80%)",
            hint: "Swallow inconsistent, baby drifts",
          },
          {
            value: "kurang_efektif",
            label: "😟 Kurang efektif (60%)",
            hint: "Few swallows, baby still hungry",
          },
          {
            value: "",
            label: "Skip",
            hint: "Default 100%",
          },
        ] as const
      ).map((opt) => (
        <form key={opt.value || "skip"} action={endOngoingDbfAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="return_to" value="/" />
          <input type="hidden" name="effectiveness" value={opt.value} />
          <SubmitButton
            pendingText="…"
            className="flex w-full flex-col items-center rounded-xl border border-rose-200 bg-white py-2 px-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 active:scale-[0.98]"
          >
            <span>{opt.label}</span>
            <span className="text-[10px] font-normal text-gray-500">
              {opt.hint}
            </span>
          </SubmitButton>
        </form>
      ))}
      <button
        type="button"
        onClick={onCancel}
        className="w-full text-center text-[11px] text-gray-400 hover:text-gray-600"
      >
        ← Batal stop
      </button>
    </div>
  );
}

function ComboPumpButton({ side }: { side: "kiri" | "kanan" }) {
  return (
    <form action={startOngoingLogActionImported}>
      <input type="hidden" name="subtype" value="pumping" />
      <input type="hidden" name="pumping_side" value={side} />
      <input type="hidden" name="start_offset_min" value="0" />
      <input type="hidden" name="return_to" value="/" />
      <SubmitButton
        pendingText="…"
        className="w-full rounded-xl border border-amber-300 bg-amber-50 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 active:scale-[0.99]"
      >
        💧 Sambil pump {side === "kiri" ? "Kiri" : "Kanan"}
      </SubmitButton>
    </form>
  );
}

/**
 * Native <select> with all integer ml values 0-200. On iOS/iPad triggers
 * the system wheel picker (drum-style, same as time picker) — keyboard
 * never opens. On desktop renders as a regular dropdown. On Android
 * renders as a scrollable list. Universal keyboardless input.
 */
const PUMP_MAX_ML = 200;

function PumpMlSelect({
  name,
  autoFocus,
}: {
  name: string;
  autoFocus?: boolean;
}) {
  return (
    <select
      name={name}
      defaultValue={0}
      autoFocus={autoFocus}
      className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 py-3 text-center text-xl font-bold tabular-nums text-rose-700 outline-none focus:border-rose-400"
    >
      {Array.from({ length: PUMP_MAX_ML + 1 }, (_, i) => (
        <option key={i} value={i}>
          {i} ml
        </option>
      ))}
    </select>
  );
}
