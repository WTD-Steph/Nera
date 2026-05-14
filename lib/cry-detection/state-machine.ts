// Threshold-based detection state machine.
//
// Transitions berdasarkan probability samples per window:
//
//   idle → cry_starting (saat prob ≥ START_PROB)
//   cry_starting → cry_ongoing (saat sustained ≥ START_DURATION_SEC)
//   cry_starting → idle (kalau prob jatuh sebelum sustained — false start)
//   cry_ongoing → cry_ending (saat prob < END_PROB)
//   cry_ending → idle (saat sustained < END_PROB selama END_DURATION_SEC)
//   cry_ending → cry_ongoing (kalau prob naik lagi — false end)
//
// Emits "started" event saat enter cry_ongoing.
// Emits "ended" event saat enter idle dari cry_ending (dengan stats).

import type {
  DetectionConfig,
  DetectionEvent,
  ListenerState,
  ProbabilitySample,
} from "./types";

type MachineState =
  | { kind: "idle" }
  | {
      kind: "cry_starting";
      /** ms timestamp saat threshold first crossed. */
      crossedAt: number;
      /** Running peak prob selama starting window. */
      peakProb: number;
      /** Sum prob × count untuk avg compute saat enter ongoing. */
      probSum: number;
      probCount: number;
    }
  | {
      kind: "cry_ongoing";
      /** ISO wall-clock waktu emit "started". */
      startedAtIso: string;
      /** ms timestamp internal. */
      startedAtMs: number;
      peakProb: number;
      probSum: number;
      probCount: number;
    }
  | {
      kind: "cry_ending";
      /** ms timestamp saat prob first dropped below END_PROB. */
      droppedAt: number;
      /** Carry over dari cry_ongoing untuk emit ended stats. */
      startedAtIso: string;
      startedAtMs: number;
      peakProb: number;
      probSum: number;
      probCount: number;
    };

const toListenerState = (s: MachineState["kind"]): ListenerState => {
  switch (s) {
    case "idle":
      return "listening"; // listening = mic running tapi tidak detect
    case "cry_starting":
      return "cry-detected";
    case "cry_ongoing":
      return "cry-ongoing";
    case "cry_ending":
      return "cry-ended";
  }
};

export type StateMachineCallbacks = {
  onEvent: (event: DetectionEvent) => void;
  onTransition: (from: ListenerState, to: ListenerState) => void;
};

/**
 * Stateful detector. Feed `feed(sample)` setiap inference tick, machine
 * akan transition dan emit events lewat callbacks.
 */
export class DetectionStateMachine {
  private state: MachineState = { kind: "idle" };
  private prevListenerState: ListenerState = "listening";

  constructor(
    private readonly config: DetectionConfig,
    private readonly cb: StateMachineCallbacks,
  ) {}

  getState(): ListenerState {
    return toListenerState(this.state.kind);
  }

  reset(): void {
    this.transition({ kind: "idle" });
  }

  feed(sample: ProbabilitySample): void {
    const { p, t, wallClockIso } = sample;
    const startProb = this.config.startProbability;
    const endProb = this.config.endProbability;
    const startDurMs = this.config.startDurationSec * 1000;
    const endDurMs = this.config.endDurationSec * 1000;

    switch (this.state.kind) {
      case "idle": {
        if (p >= startProb) {
          this.transition({
            kind: "cry_starting",
            crossedAt: t,
            peakProb: p,
            probSum: p,
            probCount: 1,
          });
        }
        break;
      }
      case "cry_starting": {
        if (p < startProb) {
          // False start — back to idle.
          this.transition({ kind: "idle" });
        } else {
          // Sustained — check duration.
          const sustained = t - this.state.crossedAt >= startDurMs;
          const newPeak = Math.max(this.state.peakProb, p);
          const newSum = this.state.probSum + p;
          const newCount = this.state.probCount + 1;
          if (sustained) {
            // Emit "started" + transition.
            this.cb.onEvent({
              kind: "started",
              at: wallClockIso,
              sample,
            });
            this.transition({
              kind: "cry_ongoing",
              startedAtIso: wallClockIso,
              startedAtMs: t,
              peakProb: newPeak,
              probSum: newSum,
              probCount: newCount,
            });
          } else {
            // Continue accumulating.
            this.state = {
              ...this.state,
              peakProb: newPeak,
              probSum: newSum,
              probCount: newCount,
            };
          }
        }
        break;
      }
      case "cry_ongoing": {
        const newPeak = Math.max(this.state.peakProb, p);
        const newSum = this.state.probSum + p;
        const newCount = this.state.probCount + 1;
        if (p < endProb) {
          // Begin ending — wait for sustained.
          this.transition({
            kind: "cry_ending",
            droppedAt: t,
            startedAtIso: this.state.startedAtIso,
            startedAtMs: this.state.startedAtMs,
            peakProb: newPeak,
            probSum: newSum,
            probCount: newCount,
          });
        } else {
          this.state = {
            ...this.state,
            peakProb: newPeak,
            probSum: newSum,
            probCount: newCount,
          };
        }
        break;
      }
      case "cry_ending": {
        const newPeak = Math.max(this.state.peakProb, p);
        const newSum = this.state.probSum + p;
        const newCount = this.state.probCount + 1;
        if (p >= endProb) {
          // False end — back to ongoing.
          this.transition({
            kind: "cry_ongoing",
            startedAtIso: this.state.startedAtIso,
            startedAtMs: this.state.startedAtMs,
            peakProb: newPeak,
            probSum: newSum,
            probCount: newCount,
          });
        } else {
          const sustained = t - this.state.droppedAt >= endDurMs;
          if (sustained) {
            // Emit "ended" + back to idle.
            const durationSeconds =
              (t - this.state.startedAtMs) / 1000;
            const avg = newSum / Math.max(1, newCount);
            this.cb.onEvent({
              kind: "ended",
              at: wallClockIso,
              peakConfidence: newPeak,
              avgConfidence: avg,
              durationSeconds: Math.max(0, Math.round(durationSeconds)),
            });
            this.transition({ kind: "idle" });
          } else {
            this.state = {
              ...this.state,
              peakProb: newPeak,
              probSum: newSum,
              probCount: newCount,
            };
          }
        }
        break;
      }
    }
  }

  private transition(next: MachineState): void {
    this.state = next;
    const to = toListenerState(next.kind);
    if (to !== this.prevListenerState) {
      this.cb.onTransition(this.prevListenerState, to);
      this.prevListenerState = to;
    }
  }
}
