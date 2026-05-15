"use client";

import { useEffect, useRef, useState } from "react";
import { AudioCapture } from "@/lib/cry-detection/audio-capture";
import {
  createCryInferenceEngine,
  type CryInferenceEngine,
} from "@/lib/cry-detection/inference-engine";
import { clearModelCache, MODEL_INFO } from "@/lib/cry-detection/model-loader";
import type {
  ListenerState,
  ModelLoadStatus,
  ProbabilitySample,
} from "@/lib/cry-detection/types";

const IS_DEV = process.env.NODE_ENV === "development";

/** Throttle every Nth probability sample log untuk avoid console spam.
 *  Inference 500ms × 4 = log every 2s. Configurable. */
const LOG_EVERY_NTH_SAMPLE = 4;

export function CryInferenceHarness() {
  const [state, setState] = useState<ListenerState>("idle");
  const [modelStatus, setModelStatus] = useState<ModelLoadStatus>({
    loaded: false,
    sizeBytes: 0,
    loadTimeMs: null,
    source: null,
  });
  const [latestProb, setLatestProb] = useState<number | null>(null);
  const [sampleCount, setSampleCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventLog, setEventLog] = useState<
    Array<{ at: string; kind: string; detail: string }>
  >([]);

  const engineRef = useRef<CryInferenceEngine | null>(null);
  const sampleCountRef = useRef(0);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  const handleStart = async () => {
    setError(null);
    try {
      const capture = new AudioCapture();
      const engine = createCryInferenceEngine(capture);
      engineRef.current = engine;
      sampleCountRef.current = 0;

      engine.onStateTransition((from, to) => {
        if (IS_DEV) {
          // eslint-disable-next-line no-console
          console.log(`[cry-dev] state: ${from} → ${to}`);
        }
        setState(to);
      });

      engine.onProbabilitySample((sample: ProbabilitySample) => {
        sampleCountRef.current += 1;
        setSampleCount(sampleCountRef.current);
        setLatestProb(sample.p);
        if (
          IS_DEV &&
          sampleCountRef.current % LOG_EVERY_NTH_SAMPLE === 0
        ) {
          // eslint-disable-next-line no-console
          console.log(
            `[cry-dev] sample #${sampleCountRef.current}: p=${sample.p.toFixed(3)} at t=${Math.round(sample.t)}ms`,
          );
        }
      });

      engine.onCryStart(({ startedAt, peakConfidence }) => {
        const at = startedAt.toISOString();
        const detail = `peak=${peakConfidence.toFixed(3)}`;
        if (IS_DEV) {
          // eslint-disable-next-line no-console
          console.log(`[cry-dev] STARTED at ${at} (${detail})`);
        }
        setEventLog((log) => [...log, { at, kind: "started", detail }]);
      });

      engine.onCryEnd(({ endedAt, durationMs, avgConfidence }) => {
        const at = endedAt.toISOString();
        const detail = `dur=${Math.round(durationMs / 1000)}s avg=${avgConfidence.toFixed(3)}`;
        if (IS_DEV) {
          // eslint-disable-next-line no-console
          console.log(`[cry-dev] ENDED at ${at} (${detail})`);
        }
        setEventLog((log) => [...log, { at, kind: "ended", detail }]);
      });

      await engine.start();
      setModelStatus(engine.getModelLoadStatus());
      setRunning(true);
      // Validation hook (gated dev-only) — expose engine ke window so
      // Playwright script bisa read getInferenceTimings + dumpTuningSession
      // tanpa parsing DOM.
      if (IS_DEV && typeof window !== "undefined") {
        (window as unknown as Record<string, unknown>).__cryEngine = engine;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleStop = () => {
    engineRef.current?.stop();
    setRunning(false);
    setState("idle");
  };

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
    a.download = `tuning-session-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearCache = async () => {
    const ok = await clearModelCache();
    setEventLog((log) => [
      ...log,
      {
        at: new Date().toISOString(),
        kind: "cache",
        detail: ok ? "cleared" : "empty (nothing to clear)",
      },
    ]);
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleStart}
          disabled={running}
          className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          ▶ Start
        </button>
        <button
          type="button"
          onClick={handleStop}
          disabled={!running}
          className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"
        >
          ⏹ Stop
        </button>
        <button
          type="button"
          onClick={handleDump}
          disabled={sampleCount === 0}
          className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50"
        >
          ⬇ Dump session
        </button>
        <button
          type="button"
          onClick={handleClearCache}
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700"
        >
          🗑 Clear model cache
        </button>
      </div>

      {/* Error */}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* Status grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="State" value={state} />
        <Stat
          label="Latest prob"
          value={latestProb != null ? latestProb.toFixed(3) : "—"}
        />
        <Stat label="Samples" value={String(sampleCount)} />
        <Stat
          label="Model size"
          value={
            modelStatus.sizeBytes > 0
              ? `${(modelStatus.sizeBytes / 1024 / 1024).toFixed(2)} MB`
              : "—"
          }
        />
        <Stat
          label="Load time"
          value={
            modelStatus.loadTimeMs != null
              ? `${Math.round(modelStatus.loadTimeMs)} ms`
              : "—"
          }
        />
        <Stat
          label="Source"
          value={modelStatus.source ?? "—"}
        />
        <Stat label="Cache key" value={MODEL_INFO.cacheKey} mono />
        <Stat label="Origin URL" value={MODEL_INFO.originUrl} mono />
      </div>

      {/* Event log */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-gray-700">
          Event log ({eventLog.length})
        </h2>
        {eventLog.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-400">
            Belum ada event. Start mic + putar audio cry contoh.
          </div>
        ) : (
          <ol className="space-y-1 rounded-xl border border-gray-100 bg-white p-3 text-xs font-mono">
            {eventLog.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-gray-400">
                  {new Date(e.at).toLocaleTimeString()}
                </span>
                <span
                  className={
                    e.kind === "started"
                      ? "font-semibold text-rose-700"
                      : e.kind === "ended"
                        ? "font-semibold text-emerald-700"
                        : "text-gray-500"
                  }
                >
                  {e.kind}
                </span>
                <span className="text-gray-700">{e.detail}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-[11px] leading-snug text-gray-600">
        <strong>Validation procedure:</strong> putar recorded baby cry
        dari device lain ~30cm dari mic, observe state transitions
        idle → cry_starting → cry_ongoing (≥3s sustained) → cry_ending
        → idle. Compare load/cold-start/sustained latency metrics vs
        baseline di docs.
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-2">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div
        className={`mt-0.5 text-sm font-semibold text-gray-900 ${
          mono ? "font-mono text-[11px] break-all" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
