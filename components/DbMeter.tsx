"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Hardcoded calibration offset. Web Audio dBFS is roughly -X (negative
// for typical levels), and SPL = dBFS + offset. 94 dB is the standard
// reference for 1 Pa (= 0 dBFS for a calibrated mic), but consumer
// device mics vary wildly. 90 picks a reasonable middle ground:
// - Quiet room (typical -55 dBFS) → ~35 dB SPL ≈ true quiet
// - Conversation (~ -25 dBFS) → ~65 dB SPL ≈ realistic
// - WN machine 30cm (typical -10 dBFS) → ~80 dB SPL ≈ matches docs
// User should not treat as medical-grade; UI shows ±5 dB disclaimer.
const DB_OFFSET = 90;
const FLOOR_DB = 25;
const CEIL_DB = 110;

export type DbReading = {
  current: number;
  avg: number;
  max: number;
  /** Samples accumulated since reset (used for rolling avg). */
  samples: number;
};

const ZERO_READING: DbReading = { current: 0, avg: 0, max: 0, samples: 0 };

/**
 * React hook: capture mic, return live dB estimate + running avg/max.
 *
 * Auto-start saat `enabled=true`. Cleanup mic stream + AudioContext
 * on disable/unmount.
 */
export function useDbMeter(enabled: boolean): {
  reading: DbReading;
  permissionDenied: boolean;
  reset: () => void;
} {
  const [reading, setReading] = useState<DbReading>(ZERO_READING);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const sumRef = useRef(0);
  const countRef = useRef(0);
  const maxRef = useRef(0);

  const reset = useCallback(() => {
    sumRef.current = 0;
    countRef.current = 0;
    maxRef.current = 0;
    setReading(ZERO_READING);
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Cleanup
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      ctxRef.current?.close();
      ctxRef.current = null;
      analyserRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new Ctx();
        ctxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        src.connect(analyser);
        analyserRef.current = analyser;
        const buf = new Float32Array(analyser.fftSize);
        const loop = () => {
          if (cancelled) return;
          analyser.getFloatTimeDomainData(buf);
          let sumSq = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = buf[i] ?? 0;
            sumSq += v * v;
          }
          const rms = Math.sqrt(sumSq / buf.length);
          const dbfs = rms > 0 ? 20 * Math.log10(rms) : -100;
          const spl = Math.max(FLOOR_DB, Math.min(CEIL_DB, dbfs + DB_OFFSET));
          sumRef.current += spl;
          countRef.current += 1;
          if (spl > maxRef.current) maxRef.current = spl;
          setReading({
            current: spl,
            avg: sumRef.current / countRef.current,
            max: maxRef.current,
            samples: countRef.current,
          });
          rafRef.current = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        if (!cancelled) setPermissionDenied(true);
      }
    })();
    return () => {
      cancelled = true;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      ctxRef.current?.close();
      ctxRef.current = null;
      analyserRef.current = null;
    };
  }, [enabled]);

  return { reading, permissionDenied, reset };
}

export function dbTone(db: number): "ok" | "warn" | "alert" {
  if (db <= 50) return "ok";
  if (db <= 65) return "warn";
  return "alert";
}

/**
 * Full-screen / inline dB meter widget. Shows big number, color band,
 * reference lines, and reset button.
 */
export function DbMeter({
  enabled,
  showReset = true,
  compact = false,
}: {
  enabled: boolean;
  showReset?: boolean;
  compact?: boolean;
}) {
  const { reading, permissionDenied, reset } = useDbMeter(enabled);
  const tone = dbTone(reading.current);
  const toneClass =
    tone === "ok"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-500"
        : "text-red-600";
  const bgClass =
    tone === "ok"
      ? "bg-emerald-50 border-emerald-200"
      : tone === "warn"
        ? "bg-amber-50 border-amber-200"
        : "bg-red-50 border-red-200";

  if (permissionDenied) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4 text-center text-sm text-red-700">
        🎤 Akses mikrofon ditolak. Aktifkan permission di browser/PWA
        settings.
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${bgClass}`}
      >
        <span aria-hidden>🔊</span>
        <span className={`font-bold tabular-nums ${toneClass}`}>
          {reading.current > 0 ? Math.round(reading.current) : "--"} dB
        </span>
        {reading.samples > 0 ? (
          <span className="text-[10px] text-gray-500">
            · max {Math.round(reading.max)}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${bgClass}`}>
      <div className="text-center">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
          🔊 Suara sekitar
        </div>
        <div className={`mt-2 font-mono text-7xl font-bold tabular-nums ${toneClass}`}>
          {reading.current > 0 ? Math.round(reading.current) : "--"}
        </div>
        <div className="mt-1 text-xs font-semibold text-gray-600">dB(A) est.</div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl bg-white/60 p-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">
            Rata-rata
          </div>
          <div className="font-bold tabular-nums text-gray-800">
            {reading.samples > 0 ? Math.round(reading.avg) : "--"}{" "}
            <span className="text-xs text-gray-500">dB</span>
          </div>
        </div>
        <div className="rounded-xl bg-white/60 p-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">
            Puncak
          </div>
          <div className="font-bold tabular-nums text-gray-800">
            {reading.samples > 0 ? Math.round(reading.max) : "--"}{" "}
            <span className="text-xs text-gray-500">dB</span>
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-1 text-[11px] leading-snug text-gray-600">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          ≤ 50 dB — aman AAP untuk tidur bayi
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
          50–65 dB — watch, kurangi volume kalau bisa
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
          &gt; 65 dB — terlalu kencang, hearing risk
        </div>
      </div>
      {showReset ? (
        <button
          type="button"
          onClick={reset}
          className="mt-3 w-full rounded-xl border border-gray-200 bg-white py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          ↺ Reset rata-rata & puncak
        </button>
      ) : null}
      <p className="mt-3 text-[10px] leading-snug text-gray-500">
        Estimasi berdasarkan mic device · akurasi ±5 dB tergantung
        hardware. Bukan pengukuran SPL terkalibrasi.
      </p>
    </div>
  );
}
