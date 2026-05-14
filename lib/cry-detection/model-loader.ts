// YAMNet model loader dengan IndexedDB caching.
//
// Strategy (per PR B planning):
// 1. Try load dari IndexedDB cache key (versioned).
// 2. Cache miss → fetch dari origin (`public/models/yamnet-v{N}/`).
// 3. After successful network load, save ke IndexedDB untuk subsequent loads.
// 4. Cache invalidation = MODEL_VERSION bump (different key = miss = fresh
//    fetch). Stale versions garbage-collected lazy oleh user (force-clear
//    button di dev harness).
//
// Load time pisah dari inference cold start dari sustained latency —
// reporting tiga metric separately per Phase 0 contract.

import * as tf from "@tensorflow/tfjs-core";
import { loadGraphModel, type GraphModel } from "@tensorflow/tfjs-converter";
import "@tensorflow/tfjs-backend-wasm";
import {
  MODEL_CACHE_KEY,
  MODEL_ORIGIN_URL,
  MODEL_VERSION,
} from "./thresholds";
import type { ModelLoadStatus } from "./types";

let backendReadyPromise: Promise<void> | null = null;

/**
 * Initialize WASM backend (single-threaded; SharedArrayBuffer + threads
 * not viable di iOS Safari per Phase 0). Idempotent.
 */
async function ensureBackend(): Promise<void> {
  if (backendReadyPromise) return backendReadyPromise;
  backendReadyPromise = (async () => {
    await tf.setBackend("wasm");
    await tf.ready();
  })();
  return backendReadyPromise;
}

export type LoadedModel = {
  model: GraphModel;
  status: ModelLoadStatus;
};

/**
 * Load YAMNet model, dengan IndexedDB cache-first strategy.
 *
 * `onProgress` (optional): receives 0..1 progress fraction during network
 * load. Tidak fire kalau cache hit (instant return).
 */
export async function loadYamnetModel(
  onProgress?: (fraction: number) => void,
): Promise<LoadedModel> {
  await ensureBackend();

  const t0 = performance.now();

  // Cache-first.
  try {
    const cached = await loadGraphModel(MODEL_CACHE_KEY);
    const loadTimeMs = performance.now() - t0;
    return {
      model: cached,
      status: {
        loaded: true,
        sizeBytes: estimateModelSize(cached),
        loadTimeMs,
        source: "cache",
      },
    };
  } catch {
    // No-op — fall through ke network fetch.
  }

  // Network fetch.
  const model = await loadGraphModel(MODEL_ORIGIN_URL, {
    onProgress: (fraction) => onProgress?.(fraction),
  });

  // Save ke IndexedDB untuk next session. Tolerant kalau gagal —
  // user tetap bisa pakai model di-memory, hanya akan re-fetch
  // next visit.
  try {
    await model.save(MODEL_CACHE_KEY);
  } catch (err) {
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn("[cry] gagal cache YAMNet to IndexedDB:", err);
    }
  }

  const loadTimeMs = performance.now() - t0;
  return {
    model,
    status: {
      loaded: true,
      sizeBytes: estimateModelSize(model),
      loadTimeMs,
      source: "network",
    },
  };
}

/**
 * Force-remove cached model — dev affordance untuk testing re-download
 * flow. Returns true kalau ada entry yang di-remove, false kalau cache
 * sudah empty.
 */
export async function clearModelCache(): Promise<boolean> {
  try {
    await tf.io.removeModel(MODEL_CACHE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Estimate uncompressed model size dari weight metadata.
 *  GraphModel.weights is a Record<string, Tensor[]>; sum bytes across
 *  all tensors. */
function estimateModelSize(model: GraphModel): number {
  let total = 0;
  const weights = model.weights;
  for (const key of Object.keys(weights)) {
    const tensors = weights[key];
    if (!tensors) continue;
    for (const t of tensors) {
      const bytesPerEl = bytesPerDtype(t.dtype);
      total += t.size * bytesPerEl;
    }
  }
  return total;
}

function bytesPerDtype(dtype: string): number {
  switch (dtype) {
    case "float32":
      return 4;
    case "int32":
      return 4;
    case "bool":
      return 1;
    case "complex64":
      return 8;
    case "string":
      return 8; // approximation
    default:
      return 4;
  }
}

/** Exposed untuk dev test harness display + sanity check. */
export const MODEL_INFO = {
  version: MODEL_VERSION,
  originUrl: MODEL_ORIGIN_URL,
  cacheKey: MODEL_CACHE_KEY,
} as const;
