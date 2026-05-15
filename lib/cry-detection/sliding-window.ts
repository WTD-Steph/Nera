// Sliding window untuk audio inference.
//
// Maintains rolling buffer di 16kHz sample rate. Saat buffer reaches
// WINDOW_SAMPLES (15,360 = 0.96s), emit "ready" event ke consumer
// dengan exact-sized slice; then advance head by WINDOW_STRIDE_SAMPLES
// (8,000 = 500ms) untuk next inference tick. Stride = 8000/15360 ≈ 52%
// advance per tick → 48% overlap between consecutive windows = low
// latency detection tanpa rasakan boundary lag.
//
// Backpressure: kalau consumer (inference) lambat, buffer numpuk.
// Implementation strategy: drop oldest excess samples (keep newest) —
// inference selalu reflect recent audio, bukan stale window dari menit
// lalu. Trade-off: kalau system overloaded, miss intermediate windows.

import { WINDOW_SAMPLES, WINDOW_STRIDE_SAMPLES } from "./thresholds";

/**
 * Append-only ring buffer dengan windowed slice extraction.
 *
 * Lifecycle:
 *   const w = new SlidingWindow();
 *   w.append(audioChunk16kHz);  // append samples
 *   if (w.ready()) {
 *     const slice = w.take();    // ambil WINDOW_SAMPLES, advance head
 *     // ... pass slice to inference
 *   }
 */
export class SlidingWindow {
  /** Backing buffer — grown lazily. Cap to MAX_BUFFER_SAMPLES untuk
   *  prevent runaway growth kalau consumer lambat. */
  private buffer: Float32Array<ArrayBuffer>;
  /** Number of valid samples di buffer (write position). */
  private length = 0;

  /** Limit buffer growth ke 2× window (~30k samples). Older overflow
   *  di-drop dari head supaya tetap reflect recent audio. */
  private readonly maxSamples = WINDOW_SAMPLES * 2;

  constructor() {
    this.buffer = new Float32Array(new ArrayBuffer(this.maxSamples * 4));
  }

  /** Append audio samples (must be at TARGET_SAMPLE_RATE 16kHz). */
  append(chunk: Float32Array<ArrayBuffer>): void {
    if (chunk.length === 0) return;
    // Truncate kalau combined akan exceed max — drop oldest (front).
    const combined = this.length + chunk.length;
    if (combined > this.maxSamples) {
      const overflow = combined - this.maxSamples;
      // Shift left by `overflow` samples (drop oldest).
      this.buffer.copyWithin(0, overflow, this.length);
      this.length -= overflow;
    }
    this.buffer.set(chunk, this.length);
    this.length += chunk.length;
  }

  /** True kalau buffer punya ≥ WINDOW_SAMPLES. */
  ready(): boolean {
    return this.length >= WINDOW_SAMPLES;
  }

  /**
   * Take a window slice (copy) dan advance head by stride. Caller owns
   * the returned Float32Array — buffer internal akan re-used untuk slot
   * berikutnya.
   *
   * Returns null kalau not ready.
   */
  take(): Float32Array<ArrayBuffer> | null {
    if (!this.ready()) return null;
    // Copy current window slice.
    const slice = new Float32Array(
      new ArrayBuffer(WINDOW_SAMPLES * 4),
    );
    slice.set(this.buffer.subarray(0, WINDOW_SAMPLES));
    // Advance head: discard `stride` oldest samples.
    const advanceBy = Math.min(WINDOW_STRIDE_SAMPLES, this.length);
    this.buffer.copyWithin(0, advanceBy, this.length);
    this.length -= advanceBy;
    return slice;
  }

  /** Current sample count (for diagnostics). */
  getLength(): number {
    return this.length;
  }

  /** Reset (untuk stop/restart cycle). */
  clear(): void {
    this.length = 0;
  }
}
