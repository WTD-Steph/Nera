"use client";

import { useEffect, useRef, useState } from "react";
import { AudioCapture } from "@/lib/cry-detection/audio-capture";
import {
  createCryInferenceEngine,
  type CryInferenceEngine,
} from "@/lib/cry-detection/inference-engine";
import {
  createCryStartedAction,
  updateCryEndedAction,
} from "@/app/actions/cry-events";
import { getDeviceId } from "@/lib/cry-detection/device-id";
import type { ListenerState } from "@/lib/cry-detection/types";

// Production CryListener — full state machine UX integrated dengan
// DB writes + Wake Lock + Battery API + privacy explainer.
//
// Visual states:
//   idle                       → explainer screen + Aktifkan button
//   requesting-permission      → spinner + "Mohon izin..."
//   permission-denied          → recovery instructions
//   starting                   → progress + "Loading model..."
//   listening                  → pulsing mic + "Mendengarkan Nera"
//   cry-detected (transient)   → amber + sustained countdown
//   cry-ongoing                → red prominent + count-up timer + DB inserted
//   cry-ended (transient)      → amber + sustained countdown
//   error                      → recovery affordance
//
// Wake Lock: active during listening/cry-ongoing/cry-detected/cry-ended.
// Released on idle/stopped/error. Firefox unsupported → banner.
// Battery: <20% surfaces warning where supported (Chrome). Silent skip
// di Safari/Firefox.

type ExtendedState = ListenerState | "explainer" | "stopped";

type BatteryLike = {
  level: number;
  charging: boolean;
  addEventListener: (e: string, cb: () => void) => void;
  removeEventListener: (e: string, cb: () => void) => void;
};

export function CryListener({ babyName }: { babyName: string }) {
  const [state, setState] = useState<ExtendedState>("explainer");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [modelProgress, setModelProgress] = useState<number>(0);
  const [modelSourceLabel, setModelSourceLabel] = useState<string>("");
  const [cryStartedAtMs, setCryStartedAtMs] = useState<number | null>(null);
  const [tick, setTick] = useState(0); // re-render trigger for cry-ongoing timer
  const [batteryWarning, setBatteryWarning] = useState<number | null>(null);
  const [wakeLockSupported, setWakeLockSupported] = useState<boolean | null>(
    null,
  );
  // Diagnostic state — live probability surface untuk threshold tuning
  // observability. Tanpa ini, threshold tuning = blind guessing.
  const [latestProb, setLatestProb] = useState<number | null>(null);
  const [maxProb60s, setMaxProb60s] = useState<number>(0);
  const [sampleCount, setSampleCount] = useState<number>(0);
  // Ring buffer of recent samples (last 120 = 60s @ 500ms interval)
  // untuk compute rolling max display.
  const recentProbsRef = useRef<Array<{ p: number; t: number }>>([]);

  type WakeLockSentinelLike = { release: () => Promise<void> };
  const engineRef = useRef<CryInferenceEngine | null>(null);
  const activeEventIdRef = useRef<string | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ----- Wake Lock support detection -----
  useEffect(() => {
    if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
      setWakeLockSupported(true);
    } else {
      setWakeLockSupported(false);
    }
  }, []);

  // ----- Battery monitor (graceful skip kalau unsupported) -----
  useEffect(() => {
    let battery: BatteryLike | null = null;
    let onChange: (() => void) | null = null;
    (async () => {
      try {
        const nav = navigator as unknown as {
          getBattery?: () => Promise<BatteryLike>;
        };
        if (typeof nav.getBattery !== "function") return;
        battery = (await nav.getBattery()) as BatteryLike;
        onChange = () => {
          if (battery && !battery.charging && battery.level < 0.2) {
            setBatteryWarning(Math.round(battery.level * 100));
          } else {
            setBatteryWarning(null);
          }
        };
        battery.addEventListener("levelchange", onChange);
        battery.addEventListener("chargingchange", onChange);
        onChange();
      } catch {
        // Battery API unavailable — silent skip.
      }
    })();
    return () => {
      if (battery && onChange) {
        battery.removeEventListener("levelchange", onChange);
        battery.removeEventListener("chargingchange", onChange);
      }
    };
  }, []);

  // ----- Tick interval for cry-ongoing live timer -----
  useEffect(() => {
    if (state === "cry-ongoing" && cryStartedAtMs !== null) {
      tickIntervalRef.current = setInterval(() => setTick((t) => t + 1), 1000);
      return () => {
        if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      };
    }
    return undefined;
  }, [state, cryStartedAtMs]);

  // ----- Wake Lock acquire/release -----
  const acquireWakeLock = async () => {
    try {
      const nav = navigator as unknown as {
        wakeLock?: { request: (type: string) => Promise<WakeLockSentinelLike> };
      };
      if (nav.wakeLock && wakeLockRef.current === null) {
        wakeLockRef.current = await nav.wakeLock.request("screen");
      }
    } catch {
      // Wake Lock failed (insecure context, etc.) — non-critical
    }
  };
  const releaseWakeLock = async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch {
      // ignore
    }
  };

  // ----- Cleanup on unmount -----
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
      releaseWakeLock();
    };
  }, []);

  // ----- Start flow -----
  const handleStart = async () => {
    setErrorMsg(null);
    setState("requesting-permission");
    try {
      const capture = new AudioCapture();
      const engine = createCryInferenceEngine(capture);
      engineRef.current = engine;

      engine.onStateTransition((_from, to) => {
        // Map internal listener state ke our ExtendedState union.
        // Wake Lock manage in transitions.
        if (to === "listening" || to === "cry-detected" || to === "cry-ongoing" || to === "cry-ended") {
          void acquireWakeLock();
        }
        setState(to);
      });

      engine.onProbabilitySample((sample) => {
        setLatestProb(sample.p);
        setSampleCount((c) => c + 1);
        // Maintain rolling 60s window (= 120 samples @ 500ms interval).
        const buffer = recentProbsRef.current;
        buffer.push({ p: sample.p, t: sample.t });
        const cutoff = sample.t - 60_000;
        while (buffer.length > 0 && buffer[0]!.t < cutoff) buffer.shift();
        const max = buffer.reduce((m, s) => (s.p > m ? s.p : m), 0);
        setMaxProb60s(max);
      });

      engine.onCryStart(async ({ startedAt, peakConfidence }) => {
        setCryStartedAtMs(startedAt.getTime());
        const deviceId = getDeviceId();
        const result = await createCryStartedAction({
          startedAt: startedAt.toISOString(),
          peakConfidence,
          deviceId,
        });
        if (result.ok) {
          activeEventIdRef.current = result.id;
        } else {
          setErrorMsg(`DB insert failed: ${result.error}`);
        }
      });

      engine.onCryEnd(async ({ endedAt, durationMs, avgConfidence }) => {
        setCryStartedAtMs(null);
        if (activeEventIdRef.current) {
          const id = activeEventIdRef.current;
          activeEventIdRef.current = null;
          const result = await updateCryEndedAction({
            id,
            endedAt: endedAt.toISOString(),
            durationSeconds: durationMs / 1000,
            avgConfidence,
          });
          if (!result.ok) {
            setErrorMsg(`DB update failed: ${result.error}`);
          }
        }
      });

      setState("starting");
      await engine.start();
      const status = engine.getModelLoadStatus();
      setModelProgress(1);
      setModelSourceLabel(
        status.source === "cache"
          ? `cache · ${Math.round(status.loadTimeMs ?? 0)}ms`
          : `network · ${Math.round((status.loadTimeMs ?? 0) / 1000)}s`,
      );
      // engine.start() flips state machine to "listening" via callback
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("Permission denied") ||
        msg.includes("NotAllowedError")
      ) {
        setState("permission-denied");
      } else {
        setState("error");
        setErrorMsg(msg);
      }
      await releaseWakeLock();
    }
  };

  // ----- Stop flow -----
  const handleStop = async () => {
    engineRef.current?.stop();
    engineRef.current = null;
    activeEventIdRef.current = null;
    setCryStartedAtMs(null);
    await releaseWakeLock();
    setState("stopped");
  };

  // ----- Dump tuning session (diagnostic) -----
  const handleDump = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const dump = engine.dumpTuningSession();
    const blob = new Blob([JSON.stringify(dump, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nera-tuning-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  void tick; // re-render trigger usage

  // ----- Render per state -----
  if (state === "explainer" || state === "stopped") {
    return (
      <ExplainerScreen
        onStart={handleStart}
        stopped={state === "stopped"}
        babyName={babyName}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Battery warning banner */}
      {batteryWarning !== null ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          🔋 Baterai {batteryWarning}% · pertimbangkan charge supaya
          mic capture tidak terputus
        </div>
      ) : null}

      {/* Wake Lock unsupported notice (Firefox) */}
      {wakeLockSupported === false ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          ℹ️ Layar bisa tidur otomatis di browser ini — pertahankan
          halaman aktif kalau ingin listening kontinyu
        </div>
      ) : null}

      <StateDisplay
        state={state}
        modelProgress={modelProgress}
        modelSourceLabel={modelSourceLabel}
        cryStartedAtMs={cryStartedAtMs}
        errorMsg={errorMsg}
        babyName={babyName}
      />

      {/* Diagnostic panel — live probability surface untuk threshold tuning */}
      {(state === "listening" ||
        state === "cry-detected" ||
        state === "cry-ongoing" ||
        state === "cry-ended") && (
        <DiagnosticPanel
          latestProb={latestProb}
          maxProb60s={maxProb60s}
          sampleCount={sampleCount}
          onDump={handleDump}
          babyName={babyName}
        />
      )}

      {/* Stop button — one-tap, prominent kalau listening/cry */}
      {state !== "permission-denied" && state !== "error" && (
        <button
          type="button"
          onClick={handleStop}
          className="w-full rounded-2xl border border-gray-300 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 active:scale-[0.99]"
        >
          ⏹ Stop Mendengarkan
        </button>
      )}

      {(state === "permission-denied" || state === "error") && (
        <button
          type="button"
          onClick={() => setState("explainer")}
          className="w-full rounded-2xl border border-rose-300 bg-rose-50 py-3 text-sm font-semibold text-rose-700"
        >
          ← Kembali
        </button>
      )}
    </div>
  );
}

// ----- Sub-components -----

function ExplainerScreen({
  onStart,
  stopped,
  babyName,
}: {
  onStart: () => void;
  stopped: boolean;
  babyName: string;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-5">
        <h2 className="text-base font-bold text-gray-900">
          🎤 Mendengarkan tangisan {babyName}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          Aktifkan deteksi tangisan untuk auto-log event ke timeline {babyName}
          {" "}tanpa input manual.
        </p>
        <div className="mt-3 rounded-xl bg-white p-3 text-[12px] leading-relaxed text-gray-700">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-rose-600">
            Privacy
          </div>
          <ul className="space-y-1 pl-4">
            <li>
              · <strong>Audio diproses di HP ini saja</strong> — tidak
              pernah dikirim ke server atau cloud
            </li>
            <li>
              · Yang tersimpan hanya: waktu mulai, durasi, dan
              confidence score deteksi
            </li>
            <li>· Tidak ada rekaman audio yang disimpan di mana pun</li>
            <li>
              · Anda bisa cabut izin mic kapan saja via setting browser
            </li>
          </ul>
        </div>
      </div>

      <button
        type="button"
        onClick={onStart}
        className="w-full rounded-2xl bg-rose-500 py-4 text-base font-semibold text-white shadow-sm hover:bg-rose-600 active:scale-[0.99]"
      >
        {stopped ? "▶ Aktifkan Lagi" : "🎤 Aktifkan Deteksi"}
      </button>
    </div>
  );
}

function DiagnosticPanel({
  latestProb,
  maxProb60s,
  sampleCount,
  onDump,
  babyName,
}: {
  latestProb: number | null;
  maxProb60s: number;
  sampleCount: number;
  onDump: () => void;
  babyName: string;
}) {
  // Color-code latest probability against current START threshold (0.4).
  const probColor =
    latestProb === null
      ? "text-gray-400"
      : latestProb >= 0.4
        ? "text-rose-600 font-bold"
        : latestProb >= 0.2
          ? "text-amber-600 font-semibold"
          : "text-gray-500";
  const maxColor =
    maxProb60s >= 0.4
      ? "text-rose-600 font-bold"
      : maxProb60s >= 0.2
        ? "text-amber-600 font-semibold"
        : "text-gray-500";
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-[11px]">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold uppercase tracking-wider text-gray-500">
          Diagnostic
        </span>
        <button
          type="button"
          onClick={onDump}
          disabled={sampleCount === 0}
          className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-200 disabled:opacity-40"
        >
          💾 Dump JSON
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500">
            Latest
          </div>
          <div className={`mt-0.5 font-mono tabular-nums ${probColor}`}>
            {latestProb !== null ? latestProb.toFixed(3) : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500">
            Max 60s
          </div>
          <div className={`mt-0.5 font-mono tabular-nums ${maxColor}`}>
            {maxProb60s > 0 ? maxProb60s.toFixed(3) : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500">
            Samples
          </div>
          <div className="mt-0.5 font-mono tabular-nums text-gray-700">
            {sampleCount}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-snug text-gray-500">
        Threshold start: 0.40 (≥ 1.5s sustained). Kalau {babyName} nangis,
        observe Latest spike. Saat {babyName} reliably scores rendah, dump
        JSON → analyze offline → tune thresholds.ts.
      </p>
    </div>
  );
}

function StateDisplay({
  state,
  modelProgress,
  modelSourceLabel,
  cryStartedAtMs,
  errorMsg,
  babyName,
}: {
  state: ExtendedState;
  modelProgress: number;
  modelSourceLabel: string;
  cryStartedAtMs: number | null;
  errorMsg: string | null;
  babyName: string;
}) {
  if (state === "requesting-permission") {
    return (
      <Card tone="info" emoji="🎤">
        <div className="font-semibold text-gray-900">Mohon izin mikrofon</div>
        <p className="mt-1 text-xs text-gray-600">
          Browser akan menanyakan akses mic. Klik <strong>Allow</strong>.
        </p>
      </Card>
    );
  }
  if (state === "permission-denied") {
    return (
      <Card tone="alert" emoji="🚫">
        <div className="font-semibold text-red-700">
          Akses mikrofon ditolak
        </div>
        <p className="mt-1 text-xs text-gray-700">
          Buka pengaturan browser → izin situs → Mic → Allow, lalu coba
          lagi.
        </p>
      </Card>
    );
  }
  if (state === "starting") {
    return (
      <Card tone="info" emoji="⏳">
        <div className="font-semibold text-gray-900">Loading model…</div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full bg-rose-500 transition-all"
            style={{ width: `${Math.round(modelProgress * 100)}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] text-gray-500">
          First visit ~5-15s · cached load sub-second
        </p>
      </Card>
    );
  }
  if (state === "listening") {
    return (
      <Card tone="ok" emoji="👂">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
          <span className="font-semibold text-gray-900">
            Mendengarkan {babyName}
          </span>
        </div>
        <p className="mt-2 text-xs text-gray-600">
          Model siap · {modelSourceLabel}. Akan auto-log saat tangisan
          terdeteksi.
        </p>
      </Card>
    );
  }
  if (state === "cry-detected") {
    return (
      <Card tone="warn" emoji="⚠️">
        <div className="font-semibold text-amber-800">
          Tangisan terdeteksi…
        </div>
        <p className="mt-1 text-xs text-amber-700">
          Menunggu konfirmasi sustained 3 detik sebelum auto-log.
        </p>
      </Card>
    );
  }
  if (state === "cry-ongoing" && cryStartedAtMs !== null) {
    const elapsedSec = Math.floor((Date.now() - cryStartedAtMs) / 1000);
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    return (
      <Card tone="alert" emoji="🚨">
        <div className="font-bold text-red-700">{babyName} menangis</div>
        <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-red-600">
          {m > 0 ? `${m}m ${s}s` : `${s}s`}
        </div>
        <p className="mt-1 text-xs text-red-700/80">
          Event sudah tercatat ke timeline.
        </p>
      </Card>
    );
  }
  if (state === "cry-ended") {
    return (
      <Card tone="warn" emoji="🤫">
        <div className="font-semibold text-amber-800">Sepi…</div>
        <p className="mt-1 text-xs text-amber-700">
          Menunggu 10 detik sustained sebelum tutup event. Kalau menangis
          lagi, akan continue.
        </p>
      </Card>
    );
  }
  if (state === "error") {
    return (
      <Card tone="alert" emoji="✗">
        <div className="font-semibold text-red-700">Error</div>
        <p className="mt-1 text-xs text-red-600">{errorMsg ?? "Unknown"}</p>
      </Card>
    );
  }
  return null;
}

function Card({
  children,
  tone,
  emoji,
}: {
  children: React.ReactNode;
  tone: "ok" | "warn" | "alert" | "info";
  emoji: string;
}) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50/60"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50/60"
        : tone === "alert"
          ? "border-red-200 bg-red-50/60"
          : "border-gray-200 bg-gray-50";
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>
          {emoji}
        </span>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
