// Threshold constants untuk cry detection state machine.
//
// VALUES BERIKUT ADALAH STARTING POINT — research-default dari paper
// audio classification umum (mis. Google YAMNet examples). BUKAN tuned
// untuk Nera. Empirical tuning di-defer ke setelah ≥1 minggu real-world
// data terkumpul, pakai raw probability log di test harness (PR B).
//
// Untuk tuning:
// 1. Enable dev-mode raw probability buffer (PR B test harness) selama
//    sesi tipikal — misal 1 sesi tidur normal + 1 sesi nangis.
// 2. Export buffer (localStorage → JSON download) dan analisis offline:
//    threshold yang minimize false-positive sambil maintain coverage.
// 3. Adjust constant berikut, redeploy, observe.
//
// JANGAN tune dari "feel saja" tanpa baseline data — values ini saling
// terkait (start prob ↔ start duration), perubahan ad-hoc bisa bikin
// detection over/under-trigger tanpa Anda sadari.

import type { DetectionConfig } from "./types";

/** Cry START: probability ≥ this AND continuous selama START_DURATION_SEC. */
export const CRY_START_PROBABILITY = 0.7;

/** Continuous duration di atas START_PROBABILITY untuk emit "started". */
export const CRY_START_DURATION_SEC = 3;

/** Cry END: probability < this continuously selama END_DURATION_SEC. */
export const CRY_END_PROBABILITY = 0.3;

/** Continuous silence (di bawah END_PROBABILITY) untuk emit "ended". */
export const CRY_END_DURATION_SEC = 10;

/** Inference frequency — sliding window with overlap untuk low latency. */
export const INFERENCE_INTERVAL_MS = 500;

/** YAMNet native input: 0.975 s @ 16 kHz = 15,600 samples. */
export const WINDOW_SAMPLES = 15_600;

/** YAMNet trained sample rate. Browser AudioContext biasanya 44.1/48 kHz
 *  → perlu resample di inference engine (PR B). */
export const TARGET_SAMPLE_RATE = 16_000;

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  startProbability: CRY_START_PROBABILITY,
  startDurationSec: CRY_START_DURATION_SEC,
  endProbability: CRY_END_PROBABILITY,
  endDurationSec: CRY_END_DURATION_SEC,
  inferenceIntervalMs: INFERENCE_INTERVAL_MS,
  windowSamples: WINDOW_SAMPLES,
  targetSampleRate: TARGET_SAMPLE_RATE,
};
