# Nera

Baby tracker untuk Stephanus & istri — track tumbuh kembang anak selama
12 bulan pertama. Multi-user via household model, Supabase + Next.js 14,
deployed ke Vercel.

## Status

**PR #1 — scaffold.** Next.js 14 + Tailwind + Supabase clients + middleware
session refresh. Belum ada auth flow, schema, atau feature page. Lihat
[PROJECT_BRIEF.md](PROJECT_BRIEF.md) untuk arsitektur dan PR sequence.

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

## Branching convention

- `feature/*` — new functionality
- `fix/*` — bug fixes
- `update/*` — incremental improvements

Tidak ada `staging` branch — preview-per-PR sudah cukup (lihat brief §11 Q6).
