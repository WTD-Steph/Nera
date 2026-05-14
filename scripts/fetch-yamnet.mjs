#!/usr/bin/env node
// Fetch YAMNet TFJS GraphModel ke public/models/yamnet-v1/
//
// 17 MB binary — JANGAN commit ke git. .gitignore exclude
// public/models/*/*.bin + .json (model artifacts), tapi keep
// directory tracked via .gitkeep.
//
// Usage:
//   node scripts/fetch-yamnet.mjs
//
// Idempotent: skip kalau model.json already present (delete to force
// re-download).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TARGET_DIR = path.join(ROOT, "public", "models", "yamnet-v1");

// YAMNet TFJS GraphModel di TFHub (now hosted on Kaggle Models).
// Mirror Kaggle juga di-CDN-cache di tfhub.dev legacy URL untuk
// downloads — silakan update URL kalau Kaggle change distribution.
const BASE_URL =
  "https://storage.googleapis.com/tfhub-tfjs-modules/google/tfjs-model/yamnet/tfjs/1";

const FILES = [
  "model.json",
  "group1-shard1of4.bin",
  "group1-shard2of4.bin",
  "group1-shard3of4.bin",
  "group1-shard4of4.bin",
];

async function fetchFile(filename) {
  const url = `${BASE_URL}/${filename}`;
  const dest = path.join(TARGET_DIR, filename);
  if (fs.existsSync(dest)) {
    const stat = fs.statSync(dest);
    console.log(`  ✓ ${filename} (${formatBytes(stat.size)}, cached)`);
    return stat.size;
  }
  console.log(`  ↓ ${filename}…`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  console.log(`  ✓ ${filename} (${formatBytes(buf.length)})`);
  return buf.length;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

async function main() {
  console.log("Fetching YAMNet TFJS GraphModel to", TARGET_DIR);
  fs.mkdirSync(TARGET_DIR, { recursive: true });
  let total = 0;
  for (const f of FILES) {
    total += await fetchFile(f);
  }
  console.log(`\nDone. Total: ${formatBytes(total)}`);
  console.log(
    `Note: binaries NOT tracked di git. Run \`node scripts/fetch-yamnet.mjs\`\nat clone time. Production deploy: include di Vercel build (lihat docs).`,
  );
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
