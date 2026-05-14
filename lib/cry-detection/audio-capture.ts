// Audio capture skeleton untuk cry detection.
//
// Extends pattern dari components/DbMeter.tsx (getUserMedia +
// AudioContext + AnalyserNode), tapi memberikan raw time-domain
// Float32Array frames ke consumer untuk diteruskan ke ML inference
// engine (PR B).
//
// SCOPE PR A:
// - Start/stop lifecycle
// - Mic permission flow (returns "denied" gracefully)
// - Stream raw audio frames at AudioContext native sample rate
// - Expose sample rate (consumer di PR B akan resample ke 16kHz untuk
//   YAMNet)
//
// SCOPE PR B (TODO):
// - Resample to TARGET_SAMPLE_RATE (16kHz)
// - Sliding window assembly (15600 samples @ 16kHz)
// - Hand off ke inference engine
//
// Mic constraints sengaja matikan echoCancellation + noiseSuppression
// + autoGainControl supaya ML model dapat raw audio (browser DSP bisa
// mask cry signals).

export type AudioCaptureState = "idle" | "starting" | "running" | "stopped";

export type FrameCallback = (
  frame: Float32Array<ArrayBuffer>,
  sampleRate: number,
) => void;

export class AudioCapture {
  private state: AudioCaptureState = "idle";
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private rafId: number | null = null;
  private buffer: Float32Array<ArrayBuffer> | null = null;
  private onFrame: FrameCallback | null = null;

  getState(): AudioCaptureState {
    return this.state;
  }

  getSampleRate(): number | null {
    return this.ctx?.sampleRate ?? null;
  }

  /**
   * Start mic stream + emit raw frames via callback at
   * requestAnimationFrame cadence (~60Hz; consumer decides what to
   * accumulate). Throws on permission denial.
   */
  async start(onFrame: FrameCallback): Promise<void> {
    if (this.state !== "idle" && this.state !== "stopped") {
      throw new Error(`AudioCapture: cannot start in state ${this.state}`);
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
    this.analyser.fftSize = 2048; // PR B mungkin override untuk sesuai window
    src.connect(this.analyser);
    this.buffer = new Float32Array(this.analyser.fftSize);

    this.state = "running";
    const loop = () => {
      if (this.state !== "running" || !this.analyser || !this.buffer) return;
      this.analyser.getFloatTimeDomainData(this.buffer);
      this.onFrame?.(this.buffer, this.ctx!.sampleRate);
      this.rafId = requestAnimationFrame(loop);
    };
    loop();
  }

  /** Stop mic + release all audio resources. Safe to call multiple times. */
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
