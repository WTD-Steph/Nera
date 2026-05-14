// Audio resampler — convert browser-native sample rate (44.1/48 kHz)
// ke YAMNet target (16 kHz).
//
// Strategy: OfflineAudioContext dengan target sampleRate = 16000.
// Browser DSP handles the resample internally. Web Audio API
// guarantees support range 8000-96000 Hz across all UAs.
//
// iOS-specific note: iOS Safari locks AudioContext (live) ke 48 kHz —
// tidak bisa specify lower rate di constructor. Namun OfflineAudioContext
// untuk resampling buffer terpisah, dan target 16kHz di OfflineAudioContext
// works regardless of live AudioContext rate.
//
// Performance: untuk window 0.96s @ 48kHz = 46,080 input samples →
// 15,360 output samples @ 16kHz. Resample cost biasanya sub-10ms di
// desktop, sub-50ms di mobile.

/**
 * Resample Float32 PCM audio dari `inputSampleRate` ke 16,000 Hz.
 *
 * @param input Float32Array berisi mono PCM samples
 * @param inputSampleRate Source rate (44100, 48000, etc.)
 * @returns Promise resolves ke Float32Array di 16kHz
 */
export async function resampleTo16kHz(
  input: Float32Array<ArrayBuffer>,
  inputSampleRate: number,
): Promise<Float32Array<ArrayBuffer>> {
  const targetRate = 16_000;
  if (inputSampleRate === targetRate) {
    // No-op (rare di browser — most devices 44.1/48). Return copy
    // untuk safety (caller might mutate, kita tidak share buffer).
    return new Float32Array(input);
  }

  const outputLength = Math.floor((input.length * targetRate) / inputSampleRate);
  // Sanity: must be non-empty for OfflineAudioContext.
  if (outputLength <= 0) {
    return new Float32Array(0);
  }

  // OfflineAudioContext constructor varies by browser; new spec accepts
  // options object, older spec accepts positional args. Try options
  // first, fallback positional.
  const Ctor =
    (typeof OfflineAudioContext !== "undefined"
      ? OfflineAudioContext
      : null) ||
    ((globalThis as unknown as {
      webkitOfflineAudioContext?: typeof OfflineAudioContext;
    }).webkitOfflineAudioContext ?? null);
  if (!Ctor) {
    throw new Error("OfflineAudioContext not supported di environment ini");
  }

  let offlineCtx: OfflineAudioContext;
  try {
    offlineCtx = new Ctor({
      numberOfChannels: 1,
      length: outputLength,
      sampleRate: targetRate,
    });
  } catch {
    // Older Safari accepts positional args (numChannels, length, sampleRate)
    offlineCtx = new (Ctor as unknown as {
      new (channels: number, length: number, rate: number): OfflineAudioContext;
    })(1, outputLength, targetRate);
  }

  // Source buffer at input rate (offline context will resample on connect).
  const inputBuffer = offlineCtx.createBuffer(
    1,
    input.length,
    inputSampleRate,
  );
  inputBuffer.copyToChannel(input, 0);

  const src = offlineCtx.createBufferSource();
  src.buffer = inputBuffer;
  src.connect(offlineCtx.destination);
  src.start();

  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0).slice();
}
