#!/usr/bin/env node
// Measure production bundle wire payload untuk PR B validation.
//
// Why separate dari validate-pr-b.mjs: dev harness `/dev/cry-inference`
// gated `NODE_ENV === 'development'` (404 di production). So validation
// cannot run inference end-to-end against prod build. Inference metrics
// captured dari dev server (runtime same dev/prod), bundle measured
// here dari production .next artifacts.
//
// Methodology:
// 1. Read .next/static/chunks/*.js, gzip each ke RAM, sum sizes
// 2. WASM dari CDN (jsdelivr) — measure pinned version directly
// 3. Model on-disk dari Supabase Storage object size (already known via SQL)
//
// Output: merged ke validation-results.json under metrics.bundle_wire_payload_bytes
// (overwriting dev-server inflated estimate dari validate-pr-b.mjs).

import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CHUNKS_DIR = path.join(ROOT, ".next", "static", "chunks");
const RESULTS = path.join(ROOT, "validation-results.json");

// Known sizes (computed pre-flight):
// - Supabase Storage YAMNet model files (sum from storage.objects query)
const MODEL_ON_DISK = 4194304 + 4194304 + 4194304 + 3455404 + 100759;
// - TFJS WASM (single-threaded) @ pinned v4.22.0 — measured separately
//   via curl HEAD; bundled chunk count: 1 wasm file ~150 KB gzipped
//   estimate. Recorded value: jsdelivr serves with content-encoding=gzip
//   so wire = compressed. Live network measurement done via dev-server
//   run (wasm_gzipped = 130334 bytes from validation-results.json).
const WASM_GZIPPED = 130334; // taken dari dev-server run (CDN load is identical regardless of dev/prod)

function gzipSize(filepath) {
  const raw = fs.readFileSync(filepath);
  return gzipSync(raw).length;
}

function main() {
  if (!fs.existsSync(CHUNKS_DIR)) {
    console.error(`Build artifacts missing: ${CHUNKS_DIR}`);
    console.error("Run: npm run build first.");
    process.exit(1);
  }

  // Gzip each JS chunk in production build. Heavy chunks (TFJS) akan
  // dominate the total. Sum semua karena route /dev/cry-inference akan
  // pull TFJS chunks + shared chunks via Next.js code-splitting.
  let jsGzipped = 0;
  const breakdown = [];
  for (const f of fs.readdirSync(CHUNKS_DIR)) {
    if (!f.endsWith(".js")) continue;
    const full = path.join(CHUNKS_DIR, f);
    const gz = gzipSize(full);
    jsGzipped += gz;
    breakdown.push({ file: f, gzipped: gz });
  }
  breakdown.sort((a, b) => b.gzipped - a.gzipped);

  const total = jsGzipped + WASM_GZIPPED + MODEL_ON_DISK;
  const totalMb = (total / 1024 / 1024).toFixed(2);

  console.log("Production bundle wire payload measurement:");
  console.log(
    `  JS gzipped (sum semua chunks): ${(jsGzipped / 1024).toFixed(1)} KB`,
  );
  console.log(`  WASM gzipped: ${(WASM_GZIPPED / 1024).toFixed(1)} KB`);
  console.log(
    `  Model on-disk: ${(MODEL_ON_DISK / 1024 / 1024).toFixed(2)} MB`,
  );
  console.log(`  TOTAL: ${totalMb} MB`);

  console.log("\nTop 5 JS chunks (gzipped):");
  for (const b of breakdown.slice(0, 5)) {
    console.log(`  ${(b.gzipped / 1024).toFixed(1)} KB  ${b.file}`);
  }

  // Merge ke existing validation-results.json kalau ada.
  if (fs.existsSync(RESULTS)) {
    const existing = JSON.parse(fs.readFileSync(RESULTS, "utf-8"));
    existing.metrics.bundle_wire_payload_bytes = {
      total,
      js_gzipped: jsGzipped,
      wasm_gzipped: WASM_GZIPPED,
      model_on_disk: MODEL_ON_DISK,
    };
    existing.metrics.bundle_wire_payload_bytes._note =
      "Measured dari production .next/static/chunks/*.js gzipSync (Node zlib). " +
      "WASM size dari dev-server CDN response (identical prod/dev). Model size dari " +
      "Supabase storage.objects metadata.";
    // Re-evaluate decision matrix
    const passThreshold = 16 * 1024 * 1024;
    const softThreshold = 18 * 1024 * 1024;
    const bundleDecision =
      total < passThreshold
        ? "pass"
        : total <= softThreshold
          ? "soft_warn"
          : "fail";
    existing.decision_matrix.bundle_wire_payload = bundleDecision;
    const states = [
      existing.decision_matrix.model_load_time,
      existing.decision_matrix.inference_cold_start,
      existing.decision_matrix.sustained_latency,
      bundleDecision,
    ];
    existing.decision_matrix.overall = states.includes("fail")
      ? "fail"
      : states.includes("soft_warn")
        ? "soft_warn"
        : "all_pass";
    fs.writeFileSync(RESULTS, JSON.stringify(existing, null, 2));
    console.log(
      `\nUpdated ${RESULTS}: overall = ${existing.decision_matrix.overall.toUpperCase()}`,
    );
  }
}

main();
