// CryInferenceEngine — top-level orchestration.
//
// Composes:
//   AudioCapture → frame accumulator (native rate) →
//     resample 16kHz → SlidingWindow →
//       YAMNet inference per window →
//         DetectionStateMachine → callbacks.
//
// Also maintains raw probability buffer (FIFO ring, capacity 600 =
// 5min @ 500ms) untuk dev tuning harness (PR B/8) — independent dari
// detection state machine.
//
// Callback API, NO React assumption. Consumer wraps di hook saat PR C.

import * as tf from "@tensorflow/tfjs-core";
import type { GraphModel } from "@tensorflow/tfjs-converter";
import { AudioCapture } from "./audio-capture";
import { loadYamnetModel } from "./model-loader";
import { resampleTo16kHz } from "./resampler";
import { SlidingWindow } from "./sliding-window";
import { DetectionStateMachine } from "./state-machine";
import {
  CRY_CLASS_INDICES,
  INFERENCE_INTERVAL_MS,
  RAW_PROB_BUFFER_MAX_SAMPLES,
  CRY_START_PROBABILITY,
  CRY_START_DURATION_SEC,
  CRY_END_PROBABILITY,
  CRY_END_DURATION_SEC,
} from "./thresholds";
import type {
  DetectionConfig,
  DetectionEvent,
  EmittedEventSummary,
  ListenerState,
  ModelLoadStatus,
  ProbabilitySample,
  TuningSessionDump,
} from "./types";

type CryStartCallback = (event: {
  startedAt: Date;
  peakConfidence: number;
}) => void;

type CryEndCallback = (event: {
  endedAt: Date;
  durationMs: number;
  avgConfidence: number;
}) => void;

type StateTransitionCallback = (
  from: ListenerState,
  to: ListenerState,
) => void;

type ProbabilitySampleCallback = (sample: ProbabilitySample) => void;

type Unsubscribe = () => void;

/** Public API contract per PR B prompt spec. */
export class CryInferenceEngine {
  private model: GraphModel | null = null;
  private modelStatus: ModelLoadStatus = {
    loaded: false,
    sizeBytes: 0,
    loadTimeMs: null,
    source: null,
  };

  private slidingWindow: SlidingWindow;
  private stateMachine: DetectionStateMachine;
  private running = false;

  /** Session-scoped state untuk TuningSessionDump. */
  private sessionId: string = "";
  private sessionStartedAt: string = "";
  private sessionStartMonotonicMs: number = 0;
  private negotiatedSampleRate: number = 0;
  private rawBuffer: ProbabilitySample[] = [];
  private events: EmittedEventSummary[] = [];
  /** Tracks the most recent un-ended event untuk update saat ended fires. */
  private inFlightEvent: EmittedEventSummary | null = null;

  private inferenceTickHandle: ReturnType<typeof setInterval> | null = null;
  /** Accumulator buffer untuk raw frames dari AudioCapture (native rate),
   *  drained per inference tick. */
  private rawFrameAccumulator: Float32Array<ArrayBuffer> = new Float32Array(
    new ArrayBuffer(0),
  );

  private startCbs = new Set<CryStartCallback>();
  private endCbs = new Set<CryEndCallback>();
  private transitionCbs = new Set<StateTransitionCallback>();
  private sampleCbs = new Set<ProbabilitySampleCallback>();

  constructor(
    private readonly audioCapture: AudioCapture,
    private readonly config: DetectionConfig,
  ) {
    this.slidingWindow = new SlidingWindow();
    this.stateMachine = new DetectionStateMachine(this.config, {
      onEvent: (e) => this.onDetectionEvent(e),
      onTransition: (from, to) => {
        for (const cb of this.transitionCbs) cb(from, to);
      },
    });
  }

  // ---------- Lifecycle ----------

  async start(): Promise<void> {
    if (this.running) throw new Error("CryInferenceEngine already running");

    // 1. Load model (cache-first).
    const loaded = await loadYamnetModel();
    this.model = loaded.model;
    this.modelStatus = loaded.status;

    // 2. Session metadata.
    this.sessionId = generateUuid();
    this.sessionStartedAt = new Date().toISOString();
    this.sessionStartMonotonicMs = performance.now();
    this.rawBuffer = [];
    this.events = [];
    this.inFlightEvent = null;
    this.stateMachine.reset();
    this.slidingWindow.clear();

    // 3. Start mic capture, accumulate raw frames.
    await this.audioCapture.start((frame, sampleRate) => {
      this.negotiatedSampleRate = sampleRate;
      // Append frame ke raw accumulator.
      const combined = new Float32Array(
        new ArrayBuffer((this.rawFrameAccumulator.length + frame.length) * 4),
      );
      combined.set(this.rawFrameAccumulator, 0);
      combined.set(frame, this.rawFrameAccumulator.length);
      this.rawFrameAccumulator = combined;
    });

    this.running = true;

    // 4. Schedule periodic inference tick.
    this.inferenceTickHandle = setInterval(
      () => void this.tick(),
      this.config.inferenceIntervalMs,
    );
  }

  stop(): void {
    this.running = false;
    if (this.inferenceTickHandle != null) {
      clearInterval(this.inferenceTickHandle);
      this.inferenceTickHandle = null;
    }
    this.audioCapture.stop();
    this.rawFrameAccumulator = new Float32Array(new ArrayBuffer(0));
    this.slidingWindow.clear();
    this.stateMachine.reset();
    // Note: tetap retain rawBuffer + events untuk dumpTuningSession()
    // post-stop. Cleared di next start().
  }

  // ---------- Subscriptions ----------

  onCryStart(cb: CryStartCallback): Unsubscribe {
    this.startCbs.add(cb);
    return () => this.startCbs.delete(cb);
  }

  onCryEnd(cb: CryEndCallback): Unsubscribe {
    this.endCbs.add(cb);
    return () => this.endCbs.delete(cb);
  }

  onStateTransition(cb: StateTransitionCallback): Unsubscribe {
    this.transitionCbs.add(cb);
    return () => this.transitionCbs.delete(cb);
  }

  onProbabilitySample(cb: ProbabilitySampleCallback): Unsubscribe {
    this.sampleCbs.add(cb);
    return () => this.sampleCbs.delete(cb);
  }

  // ---------- Status + tuning ----------

  getState(): ListenerState {
    return this.stateMachine.getState();
  }

  getModelLoadStatus(): ModelLoadStatus {
    return this.modelStatus;
  }

  dumpTuningSession(): TuningSessionDump {
    return {
      session_id: this.sessionId || generateUuid(),
      session_started_at: this.sessionStartedAt || new Date().toISOString(),
      device_info: {
        ua: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
        negotiated_sample_rate: this.negotiatedSampleRate || 0,
        platform: detectPlatform(),
      },
      active_thresholds: {
        START_PROB: this.config.startProbability,
        START_DURATION_MS: this.config.startDurationSec * 1000,
        END_PROB: this.config.endProbability,
        END_DURATION_MS: this.config.endDurationSec * 1000,
      },
      events_emitted: [...this.events],
      samples: [...this.rawBuffer],
    };
  }

  // ---------- Internals ----------

  /** Inference tick: drain accumulator → resample → sliding window →
   *  inference → state machine + raw buffer. */
  private async tick(): Promise<void> {
    if (!this.running || !this.model) return;

    // Drain accumulator (atomic-ish: swap reference, work dengan copy).
    const drained = this.rawFrameAccumulator;
    this.rawFrameAccumulator = new Float32Array(new ArrayBuffer(0));
    if (drained.length === 0 || this.negotiatedSampleRate <= 0) return;

    let resampled: Float32Array<ArrayBuffer>;
    try {
      resampled = await resampleTo16kHz(drained, this.negotiatedSampleRate);
    } catch (err) {
      // Resample failure — skip tick, audio terus capture untuk next tick.
      if (typeof console !== "undefined") {
        // eslint-disable-next-line no-console
        console.warn("[cry] resample failed:", err);
      }
      return;
    }
    this.slidingWindow.append(resampled);

    // Take as many windows as ready (typical: 0 atau 1 per tick).
    while (this.slidingWindow.ready()) {
      const window = this.slidingWindow.take();
      if (!window) break;
      const prob = await this.inferOne(window);
      const sample: ProbabilitySample = {
        t: performance.now() - this.sessionStartMonotonicMs,
        wallClockIso: new Date().toISOString(),
        p: prob,
      };
      this.pushSample(sample);
      this.stateMachine.feed(sample);
    }
  }

  /** Per-inference timing FIFO (in ms). Last N entries used untuk
   *  sustained latency reporting + populated di TuningSessionDump
   *  metadata.tick_timings (validation script reads this). */
  private inferenceTimings: number[] = [];

  /** Single window inference. Returns max prob across cry class indices. */
  private async inferOne(window: Float32Array<ArrayBuffer>): Promise<number> {
    if (!this.model) return 0;
    const t0 = performance.now();
    const result = tf.tidy(() => {
      // YAMNet expects 1D Float32 tensor of shape [n_samples], output
      // (scores, embeddings, log_mel) — we only need scores.
      const input = tf.tensor1d(window);
      const out = this.model!.execute(input);
      // Some YAMNet exports return single tensor (scores), others tuple
      // [scores, embeddings, log_mel_spectrogram]. Handle both.
      const scores = Array.isArray(out) ? (out[0] as tf.Tensor) : (out as tf.Tensor);
      // scores shape: [n_frames, 521]. Take max across frames per cry
      // class index, then max across the cry indices.
      const scoresArray = scores.arraySync() as number[][];
      let maxProb = 0;
      for (const frame of scoresArray) {
        for (const idx of CRY_CLASS_INDICES) {
          const v = frame[idx] ?? 0;
          if (v > maxProb) maxProb = v;
        }
      }
      return maxProb;
    });
    const dt = performance.now() - t0;
    this.inferenceTimings.push(dt);
    if (this.inferenceTimings.length > RAW_PROB_BUFFER_MAX_SAMPLES) {
      this.inferenceTimings.shift();
    }
    return result;
  }

  /** Expose inference timings untuk metrics reporting (test harness +
   *  validation script). Returns copy supaya consumer aman mutate. */
  getInferenceTimings(): number[] {
    return [...this.inferenceTimings];
  }

  private pushSample(sample: ProbabilitySample): void {
    this.rawBuffer.push(sample);
    if (this.rawBuffer.length > RAW_PROB_BUFFER_MAX_SAMPLES) {
      this.rawBuffer.shift();
    }
    for (const cb of this.sampleCbs) cb(sample);
  }

  private onDetectionEvent(e: DetectionEvent): void {
    if (e.kind === "started") {
      const startedAt = new Date(e.at);
      this.inFlightEvent = {
        started_at: e.at,
        ended_at: null,
        peak: e.sample.p,
      };
      this.events.push(this.inFlightEvent);
      for (const cb of this.startCbs) {
        cb({ startedAt, peakConfidence: e.sample.p });
      }
    } else if (e.kind === "ended") {
      const endedAt = new Date(e.at);
      if (this.inFlightEvent) {
        this.inFlightEvent.ended_at = e.at;
        this.inFlightEvent.peak = e.peakConfidence;
        this.inFlightEvent = null;
      }
      for (const cb of this.endCbs) {
        cb({
          endedAt,
          durationMs: e.durationSeconds * 1000,
          avgConfidence: e.avgConfidence,
        });
      }
    }
  }
}

// ----- helpers -----

function generateUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function detectPlatform(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  // Best-effort heuristics — not exhaustive, intentionally simple.
  if (/iPad|iPhone|iPod/.test(ua)) {
    const m = ua.match(/OS (\d+)[._](\d+)/);
    const v = m ? `${m[1]}.${m[2]}` : "?";
    return `iOS Safari ${v}`;
  }
  if (/Android/.test(ua)) {
    const m = ua.match(/Android (\d+)/);
    return `Android Chrome ${m ? m[1] : "?"}`;
  }
  if (/Macintosh/.test(ua)) {
    if (/Safari/.test(ua) && !/Chrome/.test(ua)) return "macOS Safari";
    if (/Chrome/.test(ua)) return "macOS Chrome";
    return "macOS";
  }
  if (/Windows/.test(ua)) return "Windows";
  return "unknown";
}

/** Convenience factory dengan default DetectionConfig dari thresholds. */
export function createCryInferenceEngine(
  audioCapture: AudioCapture,
  configOverride?: Partial<DetectionConfig>,
): CryInferenceEngine {
  const config: DetectionConfig = {
    startProbability: CRY_START_PROBABILITY,
    startDurationSec: CRY_START_DURATION_SEC,
    endProbability: CRY_END_PROBABILITY,
    endDurationSec: CRY_END_DURATION_SEC,
    inferenceIntervalMs: INFERENCE_INTERVAL_MS,
    windowSamples: 15_360,
    targetSampleRate: 16_000,
    ...configOverride,
  };
  return new CryInferenceEngine(audioCapture, config);
}
