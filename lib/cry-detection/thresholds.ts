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

/** YAMNet native input window: 0.96 s @ 16 kHz = 15,360 samples.
 *  Per AudioSet paper + TFHub docs: 96 frames × 10 ms hop = 960 ms.
 *  (Fixed dari PR A inherited typo `15_600` yang reference TFLite-
 *  specific shape, bukan YAMNet trained window.) */
export const WINDOW_SAMPLES = 15_360;

/** YAMNet trained sample rate. Browser AudioContext biasanya 44.1/48 kHz
 *  → perlu resample di inference engine (PR B). */
export const TARGET_SAMPLE_RATE = 16_000;

/** Sliding window advance per inference tick (samples @ 16kHz).
 *  500ms × 16,000 Hz = 8,000 samples = ~52% overlap dengan window. */
export const WINDOW_STRIDE_SAMPLES = 8_000;

/** Raw probability buffer capacity untuk dev tuning harness.
 *  5 minutes × (1000ms / 500ms inference interval) = 600 samples FIFO. */
export const RAW_PROB_BUFFER_MAX_SAMPLES = 600;

/** Cry class indices di AudioSet 521-class output dari YAMNet.
 *  - 19: "Baby cry, infant cry"
 *  - 20: "Crying, sobbing"
 *  Confidence per window = max(score[19], score[20]). */
export const CRY_CLASS_INDICES = [19, 20] as const;

/** IndexedDB key namespace untuk model cache. Version bump = forced
 *  re-download (per Anda decision di PR B planning). */
export const MODEL_VERSION = 1;
export const MODEL_CACHE_KEY = `indexeddb://nera.cry.model.v${MODEL_VERSION}`;

/** Public URL untuk model.json — di-host di Supabase Storage public
 *  bucket `yamnet-models` (Option D vendored, lihat docs).
 *
 *  TFJS GraphModel loader resolves shard paths relative ke model.json
 *  URL, jadi shards harus di same flat path di bucket — sudah verified
 *  saat upload (no subfolder).
 *
 *  Migrasi dari TFHub yang URL-nya broken (legacy /tfhub-tfjs-modules/
 *  path returns 403/404 sejak TFHub → Kaggle Models migration). */
export const MODEL_ORIGIN_URL =
  "https://glbkdemanhkybwdlmjns.supabase.co/storage/v1/object/public/yamnet-models/model.json";

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  startProbability: CRY_START_PROBABILITY,
  startDurationSec: CRY_START_DURATION_SEC,
  endProbability: CRY_END_PROBABILITY,
  endDurationSec: CRY_END_DURATION_SEC,
  inferenceIntervalMs: INFERENCE_INTERVAL_MS,
  windowSamples: WINDOW_SAMPLES,
  targetSampleRate: TARGET_SAMPLE_RATE,
};
