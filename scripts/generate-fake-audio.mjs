#!/usr/bin/env node
// Generate synthetic cry-like audio sebagai test fixture untuk
// Playwright `--use-file-for-fake-audio-capture` flag.
//
// HONEST disclosure: ini SYNTHETIC, bukan real baby cry. Frekuensi
// content + amplitude modulation pattern miror baby cry harmonics
// (300-3000 Hz fundamental, vibrato modulation 4-8 Hz) tapi YAMNet
// mungkin tidak classify sebagai "Baby cry" karena training data
// real recordings.
//
// Untuk metrics validation (load time, cold start, sustained latency,
// bundle wire) — content audio irrelevant. Detection accuracy
// validation deferred ke hands-on procedure di docs/cry-detection.md.
//
// Output: test-fixtures/synthetic-cry.wav (60s, 16-bit PCM, 16kHz mono)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "test-fixtures");
const OUT_FILE = path.join(OUT_DIR, "synthetic-cry.wav");

const SAMPLE_RATE = 16_000;
const DURATION_SEC = 60;
const NUM_SAMPLES = SAMPLE_RATE * DURATION_SEC;

function generateSamples() {
  const samples = new Int16Array(NUM_SAMPLES);
  // Cry-like signal: fundamental ~500 Hz dengan vibrato 5 Hz, plus
  // harmonics + amplitude modulation untuk "wail" envelope.
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    // Vibrato — fundamental modulates around 500 Hz ±50 Hz at 5 Hz.
    const f0 = 500 + 50 * Math.sin(2 * Math.PI * 5 * t);
    // 3 harmonics dengan decreasing amplitude.
    const carrier =
      0.5 * Math.sin(2 * Math.PI * f0 * t) +
      0.25 * Math.sin(2 * Math.PI * 2 * f0 * t) +
      0.125 * Math.sin(2 * Math.PI * 3 * f0 * t);
    // Wail envelope: 2 Hz amplitude modulation, alternating loud/quiet
    // mimicking inspire/expire cycle.
    const envelope = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.5 * t);
    const sample = carrier * envelope;
    // Convert to 16-bit PCM range.
    samples[i] = Math.max(-32768, Math.min(32767, Math.round(sample * 30000)));
  }
  return samples;
}

function writeWav(samples) {
  // RIFF/WAVE header (44 bytes) + PCM data.
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  let p = 0;
  // RIFF header
  buffer.write("RIFF", p); p += 4;
  buffer.writeUInt32LE(36 + dataBytes, p); p += 4;
  buffer.write("WAVE", p); p += 4;
  // fmt chunk
  buffer.write("fmt ", p); p += 4;
  buffer.writeUInt32LE(16, p); p += 4; // chunk size
  buffer.writeUInt16LE(1, p); p += 2; // PCM
  buffer.writeUInt16LE(1, p); p += 2; // mono
  buffer.writeUInt32LE(SAMPLE_RATE, p); p += 4;
  buffer.writeUInt32LE(SAMPLE_RATE * 2, p); p += 4; // byte rate
  buffer.writeUInt16LE(2, p); p += 2; // block align
  buffer.writeUInt16LE(16, p); p += 2; // bits per sample
  // data chunk
  buffer.write("data", p); p += 4;
  buffer.writeUInt32LE(dataBytes, p); p += 4;
  // PCM data
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], p);
    p += 2;
  }
  fs.writeFileSync(OUT_FILE, buffer);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
console.log("Generating synthetic cry-like WAV…");
const samples = generateSamples();
writeWav(samples);
const stat = fs.statSync(OUT_FILE);
console.log(
  `  ✓ ${OUT_FILE}  (${(stat.size / 1024 / 1024).toFixed(2)} MB, ${DURATION_SEC}s @ ${SAMPLE_RATE} Hz)`,
);
console.log(
  "\nNote: SYNTHETIC fixture untuk metrics validation. Real cry detection\nakurasi divalidasi hands-on di docs/cry-detection.md procedure.",
);
