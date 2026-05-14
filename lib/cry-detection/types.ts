// Type definitions untuk cry detection — foundation (PR A).
//
// Inference engine + UI di PR B/C akan mengkonsumsi types ini.

/** Database row shape — mirrors `public.cry_events` schema. */
export type CryEventRow = {
  id: string;
  household_id: string;
  baby_id: string;
  started_at: string;
  ended_at: string | null;
  peak_confidence: number;
  avg_confidence: number | null;
  duration_seconds: number | null;
  device_id: string | null;
  created_at: string;
};

/** Listener state machine — UI di PR C. */
export type ListenerState =
  | "idle"
  | "requesting-permission"
  | "permission-denied"
  | "starting"
  | "listening"
  | "cry-detected"
  | "cry-ongoing"
  | "cry-ended"
  | "stopping"
  | "error";

/** Single probability sample from inference window (PR B). */
export type ProbabilitySample = {
  /** ms since session start (monotonic, not wall clock). */
  t: number;
  /** Wall-clock ISO untuk correlation dengan event rows. */
  wallClockIso: string;
  /** Cry class probability [0..1]. */
  p: number;
};

/**
 * Detection configuration — di-derive dari thresholds.ts constants.
 * Exposed sebagai object supaya testable (override di test harness).
 */
export type DetectionConfig = {
  startProbability: number;
  startDurationSec: number;
  endProbability: number;
  endDurationSec: number;
  inferenceIntervalMs: number;
  /** YAMNet native window: 0.975s @ 16kHz = 15600 samples. */
  windowSamples: number;
  /** Target sample rate untuk YAMNet input. */
  targetSampleRate: number;
};

/** Lifecycle event emitted oleh detection engine (PR B). */
export type DetectionEvent =
  | { kind: "started"; at: string; sample: ProbabilitySample }
  | {
      kind: "ended";
      at: string;
      peakConfidence: number;
      avgConfidence: number;
      durationSeconds: number;
    }
  | { kind: "error"; message: string };
