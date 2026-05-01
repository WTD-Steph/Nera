# Nera

Baby tracker untuk Stephanus & istri — track tumbuh kembang anak selama
12 bulan pertama. Multi-user via household model, Supabase + Next.js 14,
deployed ke Vercel.

## Status

**Production live di [nera-jeanne.vercel.app](https://nera-jeanne.vercel.app).**

PR #1–#4 brief sudah merged: scaffold + auth + household + baby profile + logs.
Auth pakai **email + password** (magic link diganti karena rate-limit
issue di Supabase built-in SMTP — lihat [docs/auth.md](docs/auth.md) §Switch dari magic link).

## Stack

- Next.js 14 (App Router) + TypeScript strict + Tailwind CSS
- Supabase (Postgres + Auth + Realtime) dengan RLS — lihat brief §4–5
- Vercel hosting (auto-deploy `main`, preview per branch)
- Anthropic SDK server-side (model: Opus 4.7, env `AI_MODEL`)

## Setup lokal

Prasyarat: Node ≥ 20, npm ≥ 10.

```bash
# 1. Install deps
npm install

# 2. Copy env template
cp .env.local.example .env.local
# Isi NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ANTHROPIC_API_KEY
# Sumber: https://app.supabase.com/project/_/settings/api & https://console.anthropic.com/

# 3. Type-check + build (verifikasi setup)
npm run type-check
npm run build

# 4. Dev server
npm run dev
# → http://localhost:3000
```

## Project structure

```
app/                  # App Router pages + layout
lib/supabase/         # Browser/server/middleware Supabase clients
middleware.ts         # Session refresh (PR #1) + auth gating (PR #2a)
supabase/migrations/  # SQL migrations, applied via Supabase MCP
_reference/           # Source artifact prototype
docs/                 # Detail rich (cross-ref dari brief)
PROJECT_BRIEF.md      # Arsitektur, schema, RLS, PR sequence
```

## Vercel deploy (first time)

Import repo di [vercel.com/new](https://vercel.com/new), pilih
`WTD-Steph/Nera`, set env vars yang sama dengan `.env.local.example`,
deploy. Branch `main` → production, branch lain → preview otomatis
per push.

## Supabase Auth — dashboard config

**Authentication → Sign In / Up Settings:**
- "Enable email signup" — ON (signup pakai email + password)
- "Confirm email" — **DISABLE** (signup langsung dapat session, no email round-trip)

**URL Configuration** (legacy magic-link callback compat saja, tidak kritis):
- Site URL: `https://nera-jeanne.vercel.app` (jangan ada trailing space)
- Redirect URLs: tidak strict-required karena auth flow tidak pakai email link lagi


## Branching convention

- `feature/*` — new functionality
- `fix/*` — bug fixes
- `update/*` — incremental improvements

Tidak ada `staging` branch — preview-per-PR sudah cukup (lihat brief §11 Q6).
