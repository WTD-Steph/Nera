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

/** Model load lifecycle status untuk reporting di test harness + UI. */
export type ModelLoadStatus = {
  loaded: boolean;
  sizeBytes: number;
  /** Total time (ms) from start to ready — includes download + IndexedDB
   *  write + runtime init. null = not yet loaded. */
  loadTimeMs: number | null;
  /** Source of last load: 'cache' (IndexedDB hit) | 'network' (origin). */
  source: "cache" | "network" | null;
};

/** Emitted event metadata, mirror of cry_events row tapi pre-DB.
 *  Stored di TuningSessionDump untuk offline analysis correlation. */
export type EmittedEventSummary = {
  started_at: string;
  ended_at: string | null;
  peak: number;
};

/**
 * JSON dump shape untuk offline threshold tuning.
 *
 * Tanpa contextual metadata, samples array adalah angka tanpa makna —
 * tidak tahu thresholds apa yang aktif, device apa, atau event apa yang
 * sudah emit selama window. Apple-to-apple comparison saat tune
 * thresholds (mis. 0.7 → 0.65) rely ke `active_thresholds` block ini.
 */
export type TuningSessionDump = {
  /** Random UUID per listener session (not user/device id). */
  session_id: string;
  /** Wall-clock ISO saat session start. */
  session_started_at: string;
  device_info: {
    ua: string;
    /** Actual AudioContext.sampleRate (iOS lock 48kHz, Android variable). */
    negotiated_sample_rate: number;
    /** Best-effort parse from UA — "iOS Safari 17.4", "Chrome 130/macOS", etc. */
    platform: string;
  };
  /** Snapshot of thresholds aktif saat session — supaya replay analysis
   *  bisa compare apple-to-apple kalau thresholds berubah antara dumps. */
  active_thresholds: {
    START_PROB: number;
    START_DURATION_MS: number;
    END_PROB: number;
    END_DURATION_MS: number;
  };
  events_emitted: EmittedEventSummary[];
  /** FIFO ring buffer of probability samples. Last N (capacity 600 =
   *  5 min @ 500ms interval) preserved. */
  samples: ProbabilitySample[];
};
