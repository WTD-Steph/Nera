# test-fixtures/

## `synthetic-cry.wav`

**SYNTHETIC** audio fixture (NOT real baby cry) untuk Playwright
`--use-file-for-fake-audio-capture` validation flag.

- Format: 16-bit PCM, 16 kHz, mono, 60 seconds, ~1.83 MB
- Generated via `node scripts/generate-fake-audio.mjs`
- Signal: 500 Hz fundamental + 2 harmonics dengan vibrato (5 Hz) +
  wail envelope (0.5 Hz). Cry-like frekuensi content tapi BUKAN real
  recording.

### Why synthetic, not Donate-a-Cry corpus?

PR B pre-merge validation initially targeted Donate-a-Cry corpus
(Apache 2.0, github.com/gveres/donateacry-corpus) per real-cry preference.
Found di runtime: corpus uses `.caf` (iOS) + `.3gp` (Android) formats,
not WAV. Chrome's `--use-file-for-fake-audio-capture` expects WAV PCM.

Options considered:
- ffmpeg convert .3gp → WAV: ffmpeg not in environment
- Freesound CC0 alternative: extra licensing review per file
- Synthetic generation: deterministic, license-free, immediate

**Synthetic chosen** untuk metrics validation specifically (load time,
cold start, sustained latency, bundle wire payload) — these metrics are
content-independent. Detection accuracy NOT validated via this fixture
(YAMNet likely won't classify synthetic as "Baby cry").

### Real-cry validation

Defer ke hands-on Mac Safari + iPhone procedures di
[docs/cry-detection.md](../docs/cry-detection.md). Real recordings
(istri Anda recording sample, atau real cry from Nera di production)
akan validate detection accuracy organic via TuningSessionDump.
