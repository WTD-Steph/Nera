# Cry Detection (Tier 1)

Foundation + inference engine untuk on-device baby cry detection. Audio
**TIDAK** dikirim ke server — hanya event metadata (timestamp, confidence,
duration) yang tersimpan di `cry_events` table.

## Status

- **PR A (#135, merged)** — schema, RLS, realtime publication, skeleton lib
- **PR B (this branch)** — inference engine, model loader + IndexedDB cache,
  resampler, sliding window, state machine, dev test harness
- **PR C (next)** — production `<CryListener />` component, `/listen` route,
  realtime subscription, Wake Lock, Battery API graceful skip

## Architecture decision: TFJS (not ONNX)

Per Phase 0 desk research di PR B planning:

| Dimension | TFJS chosen | ONNX rejected |
|---|---|---|
| YAMNet format | Native GraphModel di TFHub | Tidak ada official ONNX export — perlu convert via tf2onnx atau pakai community port |
| Model size on-disk (FP32) | ~17 MB | ~15-17 MB (similar) |
| JS bundle gzipped | tfjs-core ~217KB + tfjs-converter ~192KB + tfjs-backend-wasm ~700KB ≈ **~1.1 MB** | ort.all.min.js ~500KB + WASM ~6 MB gzipped = **~6.5 MB+** default; minimal build ~2-3 MB butuh custom kernel build spike |
| IndexedDB caching | **Built-in** `tf.io.browserIndexedDB()` via `indexeddb://key` scheme | None native — hand-roll ~30 LOC IDBObjectStore wrapper |
| iOS Safari WASM SIMD | ✅ Safari 16.4+ (single-threaded). Multi-thread fails ([tfjs#7540](https://github.com/tensorflow/tfjs/issues/7540)) — kita pakai single-threaded backend. | ✅ Same baseline. iOS 17 ONNX load failures reported ([onnxruntime#22086](https://github.com/microsoft/onnxruntime/issues/22086)) |
| Audio classification community examples | Mature (YAMNet TFJS direct path) | Less common (ML community focus transformer/vision) |

**Tipping factors**: native TF ecosystem (no conversion artifact risk), built-in IndexedDB (~30 LOC savings), bundle within 2MB JS cap (ONNX default 6MB+ exceeds).

## Bundle size measurement units

Untuk avoid ambiguity:

- **Model size**: uncompressed binary on-disk. Binary float weights kompresinya jelek — wire-size ≈ unpacked.
- **JS bundle**: gzipped, as observed via Next.js production build.
- **Combined wire payload (cold start)**: bytes transferred over network di first visit fresh cache = JS gzipped + WASM gzipped + model on-disk.

## Hard cap

≤ 2 MB JS overhead (gzipped) + ≤ 16 MB model (on-disk) = **≤ 18 MB total wire payload cold start**.

### Pre-approved auto-pivots (no STOP required)

- Kalau actual measurement exceeds 18 MB → swap FP32 model → FP16 variant (~9 MB), report kedua measurement di PR description.

### Requires STOP + report

- int8 quantization (accuracy regression risk untuk audio classification)
- Custom model surgery
- Pivot ke ONNX

## Pivot triggers (hard guardrails)

| Metric | Threshold | Action |
|---|---|---|
| Model load time (first visit, fresh cache, Mac Safari) | > 15 s | Report + propose FP16 swap atau ONNX pivot |
| Inference cold start (first inference post-load) | > 2 s | Report + profile bottleneck |
| Sustained inference latency per 0.975s window | > 750 ms | Critical — breaks 500ms sliding interval. Pivot. |
| Bundle JS gzipped | > 2 MB | Strip backend variant atau pivot |
| Combined wire payload | > 18 MB | Auto-swap FP16 (pre-approved) |
| iOS Safari community-benchmark fails | confirmed | Pivot ke ONNX OR drop ke MFCC + small classifier |

## Three-metric separation di reporting

JANGAN conflate berikut:

1. **Model load time** — download + IndexedDB write + WASM/runtime init = "cold init" (5-15s typical first visit)
2. **Inference cold start** — first `predict()` call setelah model loaded, warm cache (sub-second post-warm)
3. **Sustained inference latency** — average over 60s inferences = metric yang matters untuk 500ms sliding window viability

## Thresholds (starting point — NOT validated untuk Nera)

Defined di [`lib/cry-detection/thresholds.ts`](../lib/cry-detection/thresholds.ts):

| Constant | Value | Rationale |
|---|---|---|
| `CRY_START_PROBABILITY` | 0.7 | Research-default dari audio classification papers |
| `CRY_START_DURATION_SEC` | 3 | Sustained signal filter — single noise spike won't trigger |
| `CRY_END_PROBABILITY` | 0.3 | Hysteresis bawah dari start |
| `CRY_END_DURATION_SEC` | 10 | Long silence sebelum declare ended — accommodate breath pauses |
| `INFERENCE_INTERVAL_MS` | 500 | Sliding window advance |
| `WINDOW_SAMPLES` | 15,360 | YAMNet native 0.96s @ 16kHz (96 frames × 10ms hop) |

**Tuning is empirical.** Values di atas adalah *starting point*, bukan validated untuk Nera. Untuk tune:

1. Run dev harness selama 1+ sesi tipikal (normal sleep + recording cry contoh)
2. Dump JSON tuning session
3. Offline analyze di Jupyter/Python: threshold yang minimize false-positive sambil maintain coverage
4. Update constants, redeploy, observe
5. **JANGAN tune dari "feel saja" tanpa baseline data** — start prob ↔ start duration saling terkait

## Model setup

Model di-host di **Supabase Storage** (bucket `yamnet-models`, public, di project `glbkdemanhkybwdlmjns`). Runtime fetch langsung dari Supabase public URL — TIDAK ada local copy di repo.

```
MODEL_ORIGIN_URL =
  https://glbkdemanhkybwdlmjns.supabase.co/storage/v1/object/public/yamnet-models/model.json
```

Files di bucket (flat, no subfolder):
- `model.json` (99 KB, topology)
- `group1-shard1of4.bin` (~4 MB)
- `group1-shard2of4.bin` (~4 MB)
- `group1-shard3of4.bin` (~4 MB)
- `group1-shard4of4.bin` (~3.3 MB)

**Total wire: ~15.7 MB** (well within 18 MB cap).

CORS verified: Supabase Storage public bucket returns `Access-Control-Allow-Origin: *` — works for TFJS loadGraphModel cross-origin fetch.

**TFJS IndexedDB cache** kick in setelah first load — subsequent loads sub-second tanpa fetch ulang ke Supabase.

### Historical context (background, bukan instruction)

Original PR B awal pakai `npm run fetch:yamnet` script yang download dari `storage.googleapis.com/tfhub-tfjs-modules/...` ke `public/models/yamnet-v1/`. URL itu **broken** sejak TFHub → Kaggle Models migration (legacy storage paths return 403/404). Vendored ke Supabase Storage sebagai Option D resolution. fetch script + `public/models/` directory + `.gitignore` workaround sudah di-remove sebagai dead code.

### Model upgrade procedure

Untuk replace model (mis. YAMNet v2 atau fine-tuned variant):

1. Upload new files ke Supabase Storage bucket — bisa pakai sub-path `yamnet-v2/` untuk parallel hosting selama transition
2. Bump `MODEL_VERSION` di [`lib/cry-detection/thresholds.ts`](../lib/cry-detection/thresholds.ts) — invalidates IndexedDB cache via key change
3. Update `MODEL_ORIGIN_URL` ke new path
4. Deploy. User devices akan re-fetch + re-cache.

## Dev test harness

Route `/dev/cry-inference` (gated `NODE_ENV === 'development'`, 404 di production).

UI: start/stop, model load status, live probability + state, dump button, force-clear-cache button, event log.

Validation procedure di Mac Safari:
1. `npm run dev` → buka `http://localhost:3000/dev/cry-inference`
2. Klik Start, grant mic permission
3. Observe model load: status loaded, size ≈ 17 MB, load time captured
4. Putar recorded baby cry audio dari device lain ~30cm dari mic
5. Verify state sequence: idle → cry_starting → cry_ongoing (setelah ≥3s sustained) → cry_ending → idle
6. Sustained 60s inference: track latency via dev console logs (every 4th sample logged)
7. Klik Dump session, save JSON
8. Validate JSON shape: session_id, device_info, active_thresholds snapshot, events_emitted, samples (≤600 FIFO)

## iPhone post-deploy validation procedure

Saya (Claude Code) tidak punya iPhone untuk validate. **Known acceptance gap** — Stephanus atau istri test fisik post-deploy.

Steps:

1. Buka `/dev/cry-inference` di Safari iOS (dev build only — production akan 404)
2. Verify model loads: status "loaded", size match expected, capture load time
3. Start listening, observe state machine transitions di Safari Web Inspector console
4. Putar recorded baby cry dari device lain dekat mic iPhone (volume normal, jarak ~30cm)
5. Verify sequence: idle → cry_starting → cry_ongoing (setelah ≥3s sustained) → cry_ending → idle
6. Stop, dump JSON tuning session, verify:
   - `device_info.platform` reports iOS Safari version
   - `device_info.negotiated_sample_rate` = 48000 (iOS lock)
   - `samples` array non-empty, probabilities reasonable
7. Compare metrics vs Mac Safari baseline (dari PR B PR description):
   - Model load time
   - Inference cold start
   - Sustained inference latency (60s average)
8. Report numbers di issue tracker — kalau sustained latency >750ms di iPhone, PR B perlu revisit (pivot trigger violated post-deploy).

## Known caveats

- **iOS AudioContext** locked ke 48 kHz sample rate (cannot specify lower di constructor). Resample ke 16 kHz via `OfflineAudioContext` (separate context, works regardless of live rate).
- **iOS Wake Lock** partial support (Safari 16.4+). Di PR C: graceful skip kalau API missing.
- **iOS Battery Status API** absent (deprecated di Firefox/Safari). Skip silently — warning <20% adalah nice-to-have, bukan critical safety.
- **Firefox Wake Lock**: not supported. Di PR C: banner "Layar bisa tidur otomatis di browser ini".
- **YAMNet trained on AudioSet** — predominantly English-speaking recordings. Indonesian baby cry coverage tergantung audio similarity, bukan language-specific.

## Future hooks (Tier 2 integration)

`cry_events` schema sudah punya kolom yang Tier 2 bisa extend tanpa migration baru:
- `peak_confidence`, `avg_confidence` — sudah cover both classification quality + Tier 2 multi-class scoring
- Tier 2 akan tambah kolom `classification_label` (hungry/tired/pain/discomfort/colic) + `classification_confidence` (separate from cry-vs-not confidence)

Model output format untuk Tier 2: extend ke 2-stage inference — YAMNet (Tier 1: cry vs not) → custom MFCC classifier atau Spectrogram CNN (Tier 2: cry type). Schema di-design supaya bisa tambah field tanpa break existing rows.

## References

- [YAMNet TensorFlow Hub](https://www.tensorflow.org/hub/tutorials/yamnet)
- [AudioSet ontology](https://research.google.com/audioset/ontology/index.html)
- [tfjs#7540 — iOS Safari multi-thread WASM fail](https://github.com/tensorflow/tfjs/issues/7540)
- [Hugh, Hassan, Smith. Infant Sleep Machines and Hazardous Sound Pressure Levels. Pediatrics 2014;133(4):677-681](https://publications.aap.org/pediatrics/article/133/4/677/68063/) (related, for dB meter)
- [WebKit SIMD support Safari 16.4](https://webkit.org/blog/13738/web-inspector-reference-documentation/) (March 2023)
- [Save and load models — TFJS](https://www.tensorflow.org/js/guide/save_load)
