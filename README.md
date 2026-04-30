# Nera

Baby tracker untuk Stephanus & istri — track tumbuh kembang anak selama
12 bulan pertama. Multi-user via household model, Supabase + Next.js 14,
deployed ke Vercel.

## Status

**Phase 1 — planning.** Belum ada code production. Lihat
[PROJECT_BRIEF.md](PROJECT_BRIEF.md) untuk arsitektur lengkap, schema, dan PR
sequence.

Source artifact prototype (Claude artifact React single-file) ada di
[_reference/baby-tracker-artifact.tsx](_reference/baby-tracker-artifact.tsx)
sebagai functional spec.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Supabase (Postgres + Auth + Realtime) dengan RLS
- Vercel hosting, GitHub branching `feature/`, `fix/`, `update/`
- Recharts, lucide-react, Anthropic SDK (server-side)
- PWA: `next-pwa`

## Setup (akan diisi di PR #1)

```bash
# placeholder — instructions akan ada setelah PR #1 scaffold
npm install
cp .env.local.example .env.local
# edit .env.local dengan SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY
npm run dev
```
