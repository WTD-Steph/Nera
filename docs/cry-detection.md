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

## Thresholds (tuned 2026-05-15 after empirical zero-event diagnosis)

Defined di [`lib/cry-detection/thresholds.ts`](../lib/cry-detection/thresholds.ts):

| Constant | Current | Original | Rationale |
|---|---|---|---|
| `CRY_START_PROBABILITY` | **0.4** | 0.7 | Tuned: research default too strict for typical 1-3m mic distance. Real-world YAMNet baby cry events score 0.3-0.6, not consistently 0.7+ |
| `CRY_START_DURATION_SEC` | **1.5** | 3 | Tuned: real cries often start dengan short whimper bursts; 3s sustained was missing them |
| `CRY_END_PROBABILITY` | **0.15** | 0.3 | Tuned: maintain hysteresis ratio after start lowered |
| `CRY_END_DURATION_SEC` | 10 | 10 | Long silence buffer untuk accommodate breath pauses |
| `INFERENCE_INTERVAL_MS` | 500 | 500 | Sliding window advance |
| `WINDOW_SAMPLES` | 15,360 | 15,360 | YAMNet native 0.96s @ 16kHz (96 frames × 10ms hop) |

### Tuning history

**2026-05-15**: lowered start 0.7→0.4, duration 3s→1.5s, end 0.3→0.15. Trigger: `cry_events` table 0 records selama production usage despite Nera actually crying. Original 0.7/3s was research-default tidak validated untuk Nera. Trade-off acknowledged: more false positives expected — mitigated by tag UI ('unclear' / hapus button).

### Empirical tuning loop (current state)

Production `/listen` page punya **diagnostic panel** dengan live probability + dump JSON button. Tuning sekarang continuous:

1. Buka `/listen`, Aktifkan Deteksi
2. Observe live Latest probability saat Nera cries (color-coded: gray <0.2, amber 0.2-0.4, red ≥0.4)
3. Tap 💾 Dump JSON saat session selesai
4. Offline analyze di Jupyter/Python: distribution real probability vs threshold
5. Adjust constants kalau warranted, redeploy
6. **JANGAN tune dari "feel saja" tanpa baseline data** — start prob ↔ start duration interrelated

Plus `cry_events` table-level accuracy summary di /listen UI: "Heuristic accuracy 24h: N/M = X%" — surfaces real performance vs tagged ground truth.

## Tier 1.5 — heuristic reason categorization (NO ML)

PR #140 added Path C (heuristic) + Path D (manual tag) reason categorization. Path A (ML classifier on Donate-a-Cry) **deferred** until ≥50 tagged events accumulate (validate worth investing).

### Schema columns ([`cry_events`](../supabase/migrations/20260515020000_cry_events_reason_tags.sql))

- `suggested_reason` text — computed at INSERT, frozen snapshot. Values: `hungry | tired | diaper | discomfort | unclear`
- `suggested_confidence` text — `high | medium | low`
- `tagged_reason` text — parent ground truth, editable. Adds `'other'` enum value.
- `tagged_at` timestamptz, `tagged_by` uuid FK auth.users — audit + tracking

### Heuristic rules ([`lib/cry-detection/reason-heuristics.ts`](../lib/cry-detection/reason-heuristics.ts))

Priority order, first match wins:

1. **Currently sleeping** → DISCOMFORT (medium) — anomalous wake, cek fever/diaper/pain
2. **Feed overdue >1.5× expected interval** → HUNGRY (high)
3. **Awake > max wake window** → TIRED (high)
4. **Feed overdue >1× expected interval** → HUNGRY (medium)
5. **Awake > min wake window** → TIRED (low)
6. **Diaper old + recent feed** → DIAPER (medium) — parent focused on feed, missed diaper check
7. **None** → UNCLEAR (low)

Age-based intervals:
- Newborn (<30d): feed ~2.5h, diaper warn 90m
- 1-3mo: feed ~3h
- 3-6mo: feed ~3.5h
- 6-12mo: feed ~4h, diaper warn 120m
- 12+mo: feed ~5h

Wake windows from existing `lib/constants/wake-window.ts`.

### Tag UI

- **Realtime banner** (cross-device): inline tag buttons saat cry event arrived dari device lain. Parent confirm/correct di banner tanpa buka /listen.
- **/listen event list**: post-event tag picker per row. ✓ green badge kalau heuristic match, ✗ red kalau mismatch ("suggested: LAPAR / actual: POPOK"). Edit anytime.
- **Accuracy summary** di top /listen: "Heuristic accuracy 24h: 5/8 = 62%" (excludes unclear/other from compute).

### Path A gate (future ML)

After ≥50 tagged events, evaluate:
- Accuracy ≥70% → Path C+D sufficient, skip ML investment
- Accuracy <70% → consider Path A: MFCC+CNN trained on Donate-a-Cry corpus + Nera's tagged data as fine-tuning. Train offline (Colab), export TFJS, host di Supabase Storage seperti YAMNet. Schema ready untuk extend tanpa migration.

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
3. Observe model load: status loaded, size ≈ 16 MB, load time captured
4. Putar recorded baby cry audio dari device lain ~30cm dari mic
5. Verify state sequence: idle → cry_starting → cry_ongoing (setelah ≥1.5s sustained, current tuned threshold) → cry_ending → idle
6. Sustained 60s inference: track latency via dev console logs (every 4th sample logged)
7. Klik Dump session, save JSON
8. Validate JSON shape: session_id, device_info, active_thresholds snapshot, events_emitted, samples (≤600 FIFO)

**Note**: production `/listen` punya same diagnostic panel + dump button (NODE_ENV gate removed for production observability — see Empirical tuning loop section).

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

## Future hooks (Tier 2 ML — gated until data accumulates)

Tier 1.5 schema already ada `suggested_reason` + `tagged_reason` (PR #140). Tier 2 ML akan tambah:
- `classification_label` text — ML output, different namespace dari heuristic suggestion (mis. could include 'colic', 'pain' yang heuristic ngga cover)
- `classification_confidence` numeric — ML probability, separate from heuristic confidence

Path A trigger (after ≥50 tagged events):
1. Compute heuristic accuracy from `/listen` summary
2. If ≥70% → skip ML, Path C+D sufficient
3. If <70% → train MFCC+CNN: data = Donate-a-Cry corpus + Nera's tagged events as fine-tuning. Pipeline: Python/Colab → TFJS export → Supabase Storage host → chain after YAMNet detection (Tier 1: cry vs not → Tier 2: cry type)

Model output format untuk Tier 2: extend ke 2-stage inference — YAMNet (Tier 1: cry vs not) → custom MFCC classifier atau Spectrogram CNN (Tier 2: cry type). Schema di-design supaya bisa tambah field tanpa break existing rows.

## References

- [YAMNet TensorFlow Hub](https://www.tensorflow.org/hub/tutorials/yamnet)
- [AudioSet ontology](https://research.google.com/audioset/ontology/index.html)
- [tfjs#7540 — iOS Safari multi-thread WASM fail](https://github.com/tensorflow/tfjs/issues/7540)
- [Hugh, Hassan, Smith. Infant Sleep Machines and Hazardous Sound Pressure Levels. Pediatrics 2014;133(4):677-681](https://publications.aap.org/pediatrics/article/133/4/677/68063/) (related, for dB meter)
- [WebKit SIMD support Safari 16.4](https://webkit.org/blog/13738/web-inspector-reference-documentation/) (March 2023)
- [Save and load models — TFJS](https://www.tensorflow.org/js/guide/save_load)
