// Common mic capture base — consolidated dari:
// - lib/cry-detection/audio-capture.ts (was: AudioCapture class)
// - components/DbMeter.tsx useDbMeter hook (was: inline getUserMedia +
//   AudioContext + AnalyserNode setup)
//
// Both consumers need raw Float32 time-domain frames at native
// AudioContext sample rate. Consumer-specific processing (RMS → dB SPL
// untuk DbMeter, resample + sliding window + ML inference untuk
// cry-detection) layers on top via frame callback.
//
// Per closed issue #136: konsolidasi sebelum more code paths divergent.
//
// Design choices:
// - Class-based (imperative API). React consumer wraps di hook;
//   non-React consumer (ML inference engine) uses langsung.
// - Mic constraints matikan echoCancellation / noiseSuppression /
//   autoGainControl — both consumers want raw audio. DbMeter butuh
//   un-modified signal untuk accurate dB SPL estimate; ML butuh raw
//   audio untuk YAMNet which was trained on raw AudioSet recordings
//   (browser DSP transforms could mask signal characteristics).
// - WebkitAudioContext fallback untuk legacy iOS Safari (still common
//   di iOS 15-).
// - State machine (idle/starting/running/stopped) is intentional —
//   permission flow + AudioContext init is async + can fail at multiple
//   points; explicit state simplifies consumer error handling.

export type CaptureState = "idle" | "starting" | "running" | "stopped";

export type FrameCallback = (
  frame: Float32Array<ArrayBuffer>,
  sampleRate: number,
) => void;

export class AudioCaptureBase {
  private state: CaptureState = "idle";
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private rafId: number | null = null;
  private buffer: Float32Array<ArrayBuffer> | null = null;
  private onFrame: FrameCallback | null = null;

  /** Analyser FFT size — affects buffer length per frame. Default 2048
   *  works untuk both dB RMS (any size OK) + cry-detection (consumer
   *  re-windows for YAMNet 0.96s @ 16kHz anyway). */
  constructor(private readonly fftSize: number = 2048) {}

  getState(): CaptureState {
    return this.state;
  }

  getSampleRate(): number | null {
    return this.ctx?.sampleRate ?? null;
  }

  /**
   * Start mic capture + invoke `onFrame(frame, sampleRate)` per RAF tick
   * (~60 Hz typical). Consumer decides accumulation strategy.
   *
   * Throws on permission denial — consumer catches + handles user-facing
   * messaging. Internal state transitions: idle → starting → (running |
   * back-to-idle on error).
   */
  async start(onFrame: FrameCallback): Promise<void> {
    if (this.state !== "idle" && this.state !== "stopped") {
      throw new Error(
        `AudioCaptureBase: cannot start in state ${this.state}`,
      );
    }
    this.state = "starting";
    this.onFrame = onFrame;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });
    } catch (err) {
      this.state = "idle";
      this.onFrame = null;
      throw err;
    }

    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctx();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    src.connect(this.analyser);
    this.buffer = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));

    this.state = "running";
    const loop = () => {
      if (this.state !== "running" || !this.analyser || !this.buffer) return;
      this.analyser.getFloatTimeDomainData(this.buffer);
      this.onFrame?.(this.buffer, this.ctx!.sampleRate);
      this.rafId = requestAnimationFrame(loop);
    };
    loop();
  }

  /** Stop mic + release semua audio resources. Safe untuk dipanggil
   *  multiple times — idempotent. */
  stop(): void {
    this.state = "stopped";
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
    this.buffer = null;
    this.onFrame = null;
  }
}
