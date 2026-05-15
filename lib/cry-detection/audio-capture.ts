// Cry-detection consumer of the shared AudioCaptureBase.
//
// Pre-#136: audio-capture.ts had its own getUserMedia + AudioContext +
// AnalyserNode handling, duplicate dengan components/DbMeter.tsx
// useDbMeter hook. Now consolidated to lib/audio/capture-base.ts.
//
// This module preserves the existing import surface (`AudioCapture`)
// for cry-detection internals (inference-engine.ts, dev harness)
// supaya tidak ada churn di consumer code. AudioCapture is just an
// alias dengan default fftSize = 2048.

export {
  AudioCaptureBase as AudioCapture,
  type CaptureState as AudioCaptureState,
  type FrameCallback,
} from "@/lib/audio/capture-base";
