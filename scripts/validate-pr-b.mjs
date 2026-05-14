#!/usr/bin/env node
// PR B pre-merge validation — automated metrics capture via Playwright.
//
// Captures 4 metrics dari dev harness running di local Next.js server:
//   1. model_load_time_ms
//   2. inference_cold_start_ms (first sample timestamp − loaded timestamp)
//   3. sustained_inference_latency_ms (avg/p50/p95/max over 60s)
//   4. bundle_wire_payload_bytes (JS gzipped / WASM / model on-disk)
//
// Output: validation-results.json di repo root.
//
// Prerequisites:
//   - Dev server running di http://localhost:3000 (npm run dev)
//   - YAMNet model accessible di Supabase Storage (verified pre-flight)
//   - test-fixtures/synthetic-cry.wav present (run scripts/generate-fake-audio.mjs)
//
// Usage:
//   node scripts/validate-pr-b.mjs
//
// Honest disclosure: audio fixture SYNTHETIC (not real cry). Metrics
// content-independent; detection accuracy validated hands-on per docs.

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FIXTURE = path.join(ROOT, "test-fixtures", "synthetic-cry.wav");
const OUT_FILE = path.join(ROOT, "validation-results.json");

const APP_URL = "http://localhost:3000/dev/cry-inference";
const SUSTAINED_DURATION_SEC = 60;

const THRESHOLDS = {
  model_load_time_ms: { pass: 8000, soft_warn: 15000 },
  inference_cold_start_ms: { pass: 1000, soft_warn: 2000 },
  sustained_latency_ms_avg: { pass: 500, soft_warn: 750 },
  bundle_wire_payload_bytes: { pass: 16 * 1024 * 1024, soft_warn: 18 * 1024 * 1024 },
};

function classify(value, thr) {
  if (value < thr.pass) return "pass";
  if (value <= thr.soft_warn) return "soft_warn";
  return "fail";
}

function quantile(arr, q) {
  const sorted = [...arr].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

async function main() {
  if (!fs.existsSync(FIXTURE)) {
    console.error(`Fixture missing: ${FIXTURE}`);
    console.error("Run: node scripts/generate-fake-audio.mjs first.");
    process.exit(1);
  }

  console.log("Launching headless Chromium dengan fake audio capture…");
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${FIXTURE}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const context = await browser.newContext();
  // Grant mic permission upfront (Chrome with --use-fake-ui usually
  // auto-grants, but be explicit).
  await context.grantPermissions(["microphone"], { origin: "http://localhost:3000" });

  const page = await context.newPage();

  // Network telemetry — categorize responses by URL pattern.
  const wirePayload = {
    js_gzipped: 0,
    wasm_gzipped: 0,
    model_on_disk: 0,
    total: 0,
    detail: [],
  };
  page.on("response", async (response) => {
    try {
      const url = response.url();
      // skip data:/about:/etc.
      if (!url.startsWith("http")) return;
      const headers = response.headers();
      const ce = headers["content-encoding"] ?? "";
      const cl = parseInt(headers["content-length"] ?? "0", 10);
      // Get actual transferred bytes — content-length is post-encoding
      // (gzipped if applicable).
      let size = cl;
      if (size === 0) {
        // Some responses don't set content-length; fall back to body length
        try {
          const body = await response.body();
          size = body.length;
        } catch {
          size = 0;
        }
      }
      let category = "other";
      if (
        url.includes("yamnet-models") ||
        url.includes("/storage/v1/object/public/yamnet-models/")
      ) {
        category = "model";
        wirePayload.model_on_disk += size;
      } else if (url.endsWith(".wasm") || url.includes(".wasm?")) {
        category = "wasm";
        wirePayload.wasm_gzipped += size;
      } else if (
        ce === "gzip" &&
        (url.includes(".js") || url.endsWith(".js"))
      ) {
        category = "js_gz";
        wirePayload.js_gzipped += size;
      }
      wirePayload.total += size;
      wirePayload.detail.push({ url: url.slice(0, 100), category, size, encoding: ce });
    } catch {
      // ignore measurement errors
    }
  });

  // Forward page console untuk debug visibility (all types)
  page.on("console", (msg) => {
    const t = msg.text();
    // Skip noisy TFJS kernel-already-registered warnings
    if (t.includes("already registered")) return;
    console.log(`[page ${msg.type()}]`, t);
  });
  page.on("pageerror", (err) => {
    console.log("[page error]", err.message);
  });
  page.on("requestfailed", (req) => {
    console.log("[page request-failed]", req.url(), req.failure()?.errorText);
  });

  console.log(`Navigating ke ${APP_URL}…`);
  await page.goto(APP_URL, { waitUntil: "networkidle", timeout: 60000 });

  console.log("Clicking Start (mic + model load + inference)…");
  const startBtn = page.getByRole("button", { name: /Start/i });
  const navStart = performance.now();
  await startBtn.click();

  // Wait for engine bootstrap (model loaded → ready). __cryEngine
  // exposed via window di harness IS_DEV gate. State DOM not reliable
  // signal — state machine doesn't emit initial transition unless
  // first probability crosses threshold (synthetic audio = low prob,
  // never transitions away from internal idle/listening).
  await page.waitForFunction(
    () => {
      const e = (window).__cryEngine;
      if (!e) return false;
      const status = e.getModelLoadStatus();
      return status.loaded === true;
    },
    { timeout: 60000 },
  );
  const modelLoadedAt = performance.now();
  const modelLoadTimeMs = modelLoadedAt - navStart;
  console.log(`  ✓ Model loaded (${Math.round(modelLoadTimeMs)} ms)`);

  // Wait for first sample (inference cold start). Total budget: model
  // ready → audio accumulator fills (~960ms) → resample → first inference
  // → push to buffer. Generous timeout 30s.
  await page.waitForFunction(
    () => {
      const engine = (window).__cryEngine;
      if (!engine) return false;
      const dump = engine.dumpTuningSession();
      return dump.samples && dump.samples.length > 0;
    },
    { timeout: 30000 },
  );
  const firstSampleAt = performance.now();
  const inferenceColdStartMs = firstSampleAt - modelLoadedAt;
  console.log(`  ✓ First inference complete (${Math.round(inferenceColdStartMs)} ms cold start)`);

  // Sustained run untuk 60s.
  console.log(`Running ${SUSTAINED_DURATION_SEC}s sustained inference…`);
  await page.waitForTimeout(SUSTAINED_DURATION_SEC * 1000);

  // Read final dump + timings.
  const finalDump = await page.evaluate(() => {
    const engine = (window).__cryEngine;
    if (!engine) return null;
    return {
      dump: engine.dumpTuningSession(),
      timings: engine.getInferenceTimings(),
      modelStatus: engine.getModelLoadStatus(),
    };
  });

  if (!finalDump) {
    throw new Error("Could not read engine state from page");
  }

  const timings = finalDump.timings;
  const sustained = {
    avg: timings.length > 0 ? timings.reduce((a, b) => a + b, 0) / timings.length : 0,
    p50: quantile(timings, 0.5),
    p95: quantile(timings, 0.95),
    max: timings.length > 0 ? Math.max(...timings) : 0,
    samples_count: timings.length,
  };

  console.log(`  ✓ Captured ${timings.length} inference timings`);
  console.log(
    `  Sustained latency: avg=${sustained.avg.toFixed(0)}ms p50=${sustained.p50.toFixed(0)}ms p95=${sustained.p95.toFixed(0)}ms max=${sustained.max.toFixed(0)}ms`,
  );

  await browser.close();

  // Build result + decision matrix.
  const decision = {
    model_load_time: classify(modelLoadTimeMs, THRESHOLDS.model_load_time_ms),
    inference_cold_start: classify(
      inferenceColdStartMs,
      THRESHOLDS.inference_cold_start_ms,
    ),
    sustained_latency: classify(sustained.avg, THRESHOLDS.sustained_latency_ms_avg),
    bundle_wire_payload: classify(
      wirePayload.total,
      THRESHOLDS.bundle_wire_payload_bytes,
    ),
  };
  const states = Object.values(decision);
  const overall = states.includes("fail")
    ? "fail"
    : states.includes("soft_warn")
      ? "soft_warn"
      : "all_pass";

  const result = {
    executed_at: new Date().toISOString(),
    playwright_version: (await import("playwright/package.json", { with: { type: "json" } })).default.version,
    fixture: {
      path: path.relative(ROOT, FIXTURE),
      type: "synthetic (NOT real cry)",
      note: "Metrics content-independent. Detection accuracy validated hands-on per docs/cry-detection.md",
    },
    metrics: {
      model_load_time_ms: Math.round(modelLoadTimeMs),
      inference_cold_start_ms: Math.round(inferenceColdStartMs),
      sustained_inference_latency_ms: {
        avg: Math.round(sustained.avg),
        p50: Math.round(sustained.p50),
        p95: Math.round(sustained.p95),
        max: Math.round(sustained.max),
        samples_count: sustained.samples_count,
      },
      bundle_wire_payload_bytes: {
        total: wirePayload.total,
        js_gzipped: wirePayload.js_gzipped,
        wasm_gzipped: wirePayload.wasm_gzipped,
        model_on_disk: wirePayload.model_on_disk,
      },
    },
    decision_matrix: { ...decision, overall },
    model_status: finalDump.modelStatus,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
  console.log(`\nWrote ${OUT_FILE}`);
  console.log(`Overall decision: ${overall.toUpperCase()}`);
  Object.entries(decision).forEach(([k, v]) =>
    console.log(`  ${k}: ${v}`),
  );

  process.exit(overall === "fail" ? 1 : 0);
}

main().catch((err) => {
  console.error("VALIDATION FAILED:", err);
  process.exit(2);
});
