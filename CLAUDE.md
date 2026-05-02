# CLAUDE.md

Quick-orientation file for Claude Code agents working on Nera. Bullet
pointers ≤600 char, detail rich di [docs/](docs/) dengan cross-ref.

## Project

- **Nera** — multi-user baby tracker untuk Stephanus + istri, track tumbuh kembang anak (Nera, lahir April 2026) selama 12 bulan pertama. Production live di [nera-jeanne.vercel.app](https://nera-jeanne.vercel.app)
- Private app, audience 2-4 user maks (parents + caregivers). Bukan untuk public release
- Stack: Next.js 14 App Router + TS strict + Tailwind, Supabase (Postgres+Auth+RLS+Realtime) di project `glbkdemanhkybwdlmjns` (ap-southeast-1), Vercel hosting, GitHub `WTD-Steph/Nera`
- Detail arsitektur: [PROJECT_BRIEF.md](PROJECT_BRIEF.md) v2 (final). Architecture overview di [docs/architecture.md](docs/architecture.md)

## Critical pitfalls — JANGAN ulangi

Dokumen lengkap insiden + fix: [docs/troubleshooting.md](docs/troubleshooting.md).

- **SECURITY DEFINER function di RLS policy expression → Postgres SEGV**. Pattern itu memicu `signal 11 Segmentation fault` di Postgres 17.x saat PostgREST schema introspection. Pakai direct EXISTS subquery di policy. Helper SECURITY DEFINER OK di-define + di-call dari app, TAPI tidak boleh di-reference dari policy
- **`SET LOCAL ROLE authenticated` di Supabase MCP `execute_sql` crash PostgREST connection pool**. Symptom: `429 PGRST001/002` permanent loop. Recovery butuh pause+restore project. JANGAN simulate RLS as authenticated via SET LOCAL — pakai real session via Playwright + auth flow
- **household_members policy SELECT/DELETE = self-only** untuk avoid `42P17 infinite recursion`. Cross-member ops via SECURITY DEFINER RPC (`list_household_members`, `remove_household_member`) yang dipanggil dari app, NOT direferensikan di policy

## Auth

- **Email + password** (signUp / signInWithPassword), BUKAN magic link. Magic link dropped karena Supabase built-in SMTP rate limit + Site URL validation issues. Detail di [docs/auth.md](docs/auth.md) §"Switch dari magic link"
- Supabase Auth → Settings → "Confirm email" harus **DISABLE** supaya signUp langsung dapat session (no email round-trip)
- Invite flow: owner generate URL via /more/household → copy → share manual via WA/SMS. Invitee daftar di /signup dengan email yang diundang → /invite/{token} → Accept

## Schema commitments — JANGAN ubah

- Subtypes log: `feeding`, `pumping`, `diaper`, `sleep`, `bath`, `temp`, `med` (consolidated dari original 9 di brief). `feeding` punya amount_ml ATAU duration_l/r_min. `diaper` punya has_pee/has_poop boolean
- `logs.bottle_content` enum: `'sufor' | 'asi' | NULL`. Diisi saat feeding+sufor (bottle); NULL untuk DBF dan log lama. Pakai untuk bedakan ASI perah vs formula di tampilan + ASI stock allocation
- `logs.consumed_ml` numeric DEFAULT 0 — track berapa ml dari pumping batch sudah dikonsumsi via ASI bottle feeds. CHECK >= 0. Stock remaining = (amount_l_ml + amount_r_ml) - consumed_ml
- `logs.start_l_at, end_l_at, start_r_at, end_r_at` timestamptz nullable — per-side pumping window. Overall `timestamp` / `end_timestamp` derived dari min(starts) / max(ends). CHECK end_X >= start_X per sisi kalau both set
- ID stable di constants — `MILESTONES_LIST` (32 items KPSP/IDAI), `IMUNISASI_LIST` (21 vaccines IDAI). `id` field pair dengan `*_progress.{milestone,vaccine}_key`. Jangan rename setelah ada data
- `babies.gender` enum: `'female' | 'male'` (CHECK constraint). Tidak ada non-binary di v1
- `household_members.role`: `'owner' | 'member'` (CHECK constraint)
- `household_invitations.role`: same enum, default `'member'`
- `households.sleep_playlist_url` nullable — per-household override untuk night-lamp Spotify link. NULL = default Baby Sleep playlist (`37i9dQZF1DX0DxcHtn4Hwo`)
- `medications` table per household — `(household_id, name, default_dose, unit)` dengan `unit IN ('ml','drop','gr','tab','sachet')`. Dropdown options di LogModal med subtype. UNIQUE(household_id, name)
- `immunization_progress.doctor_name` nullable — datalist autocomplete dari past entries

## Wall-clock TZ commitment

Semua wall-clock display + parse locked ke `Asia/Jakarta` (GMT+7), terlepas server (Vercel UTC) atau client (any). Pakai `lib/compute/format.ts` `fmtTime` (en-GB locale, HH:MM colon), `fmtDate` (id-ID locale "2 Mei 2026"), `fmtSleepRange`, `pumpDur` helpers — JANGAN raw `getHours()` yang TZ-dependent. Server actions parse `<input type="datetime-local">` dengan append `+07:00` suffix sebelum `new Date()` — see `app/actions/logs.ts` `isoOrNull`. Hydration-safe: same locale + TZ on both sides.

## Workflow conventions

- **Branch:** `feature/`, `fix/`, `update/`, `docs/` prefix. main = production auto-deploy Vercel
- **Migrations:** SQL di `supabase/migrations/` (version control) + apply via Supabase MCP `apply_migration` (auto-tracked di `_migrations` table). Bukan via Supabase CLI / dashboard
- **Commit message:** prefix sesuai branch type, message singkat. End dengan `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` saat commit dari Claude Code
- **PR:** `gh pr create` (GitHub MCP write 401, fallback gh CLI). Setiap PR: type-check + lint + build verify. E2E via Playwright + Supabase MCP saat applicable
- **Deliverable report tiap PR:** state migration applied/committed/pushed, branch + remote, verification output, screenshot kalau UI changes
- **WAJIB verify UI changes via Playwright sebelum claim "fixed"**. Type-check + build hijau ≠ feature works. Submit-button labels, modal close, form pending states, redirect targets — semua harus diuji end-to-end di Playwright (login → klik → observe DOM/screenshot) sebelum bilang task selesai. Bila prod butuh deploy dulu, tunggu Vercel deploy lalu test di nera-jeanne.vercel.app. Bila local, `npm run dev` dulu

## RLS pattern (per pelajaran PR #2b)

```sql
-- DO: direct EXISTS dengan join cross-table di policy expression
CREATE POLICY foo ON public.bar
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.babies b
      JOIN public.household_members hm ON hm.household_id = b.household_id
      WHERE b.id = bar.baby_id AND hm.user_id = auth.uid()
    )
  );
```

```sql
-- DON'T: SECURITY DEFINER helper di policy expression (SEGV trigger)
CREATE POLICY foo ON public.bar
  FOR SELECT USING (public.is_household_member_of_baby(bar.baby_id));
```

Untuk operasi yang butuh bypass RLS (cross-member ops di table dengan self-only RLS), pakai SECURITY DEFINER **RPC** dipanggil dari app code (bukan dari policy). Contoh: `list_household_members(uuid)`, `remove_household_member(uuid, uuid)`, `create_household_with_owner(text)`, `accept_household_invitation(text)`.

## Tooling state

- **Supabase MCP** — semua tools work (apply_migration, execute_sql, get_logs, generate_typescript_types). Pakai untuk semua migrations. PAT-level auth, tidak baca env var app
- **Vercel MCP** — `mcp__vercel__getDeployments`/`getDeployment`/`getDeploymentEvents` work tanpa auth scope issue. `mcp__claude_ai_Vercel__*` (richer tools, runtime logs) butuh team scope reauth — currently 403 untuk `wtd-stephs-projects`
- **GitHub MCP** — read ops (get_pull_request, list_pull_requests) work; write ops (create_pull_request, add_issue_comment) return 401. Fallback: `gh` CLI (sudah authenticated dengan repo + workflow scope)
- **Playwright MCP** — works untuk e2e. Stale Chrome instances bisa block (kill via PowerShell `Stop-Process` chrome PID kalau "Browser is already in use")
- **GitHub MCP write fallback** — pakai `gh pr create`, `gh pr merge`, `gh pr comment` via Bash

## Common commands

```bash
# Dev
npm run dev          # http://localhost:3000

# Verifikasi sebelum commit
npm run type-check   # tsc --noEmit (strict + noUncheckedIndexedAccess)
npm run lint         # next lint
npm run build        # full Next.js build

# Git workflow
git checkout -b feature/<name>
# ... edit files ...
git add -A && git commit -m "feat: ..."
git push -u origin feature/<name>
gh pr create --base main --head feature/<name> --title "..." --body "..."
gh pr merge <num> --merge --delete-branch
```

## Stable file map

```
app/                        # Next.js App Router
  (auth)/                   # public auth area
    login/, signup/         # email + password forms
  auth/                     # post-auth callbacks
    callback/, signout/
  setup/                    # onboarding (household → baby)
  invite/[token]/           # accept invite
  more/                     # secondary nav
    household/              # member management + Preferensi (sleep playlist URL)
    profile/                # baby profile edit
  growth/                   # /growth chart + history
  milestone/                # KPSP/IDAI checklist
  imunisasi/                # vaccine schedule + facility/doctor datalist
  history/                  # log riwayat dengan filter
  report/                   # CSV export + AI prompt copier
  stock/                    # ASI batch ledger (pumping batches with FIFO consumption)
  api/
    invite/, export/        # POST invite, GET CSV
  actions/                  # server actions per domain
    logs.ts                 # createLogAction, startOngoingLogAction,
                            # endOngoingSleepAction, endOngoingPumpingAction,
                            # pumpingPindahAction, deleteLogAction
    growth.ts, milestone.ts, imunisasi.ts, medications.ts
  page.tsx                  # main dashboard
  layout.tsx                # root layout + PWA meta (statusBarStyle: black-translucent)
  manifest.ts               # PWA manifest (Next 14 file convention)
  icon.tsx, apple-icon.tsx  # PWA icons via ImageResponse
  globals.css               # Tailwind + flash-in keyframes

components/                 # client components
  LogModal.tsx              # log entry modal: subtype-aware, MedFields dropdown,
                            # bottle ASI/Sufor + batch picker, per-side pumping
  OngoingCard.tsx           # ongoing sleep/pumping card + NightLamp overlay +
                            # PumpingControls (Pindah/Selesai), EndPumpingModal
  StartOngoingButtons.tsx   # Mulai Tidur + Mulai Pumping side picker
  Stopwatch.tsx             # client tick component (defer Date.now to mount)
  FormCloser.tsx            # auto-close modal on form submission complete
  SubmitButton.tsx          # useFormStatus pending state + spinner
  LogsRealtime.tsx          # logs realtime subscription → router.refresh()
  GrowthChart.tsx           # recharts WHO percentile
  GrowthMeasureModal.tsx    # ukur form
  GrowthRealtime.tsx, ProgressRealtime.tsx
  PromptCopier.tsx          # AI prompt clipboard
  ImunisasiRow.tsx          # imunisasi modal with facility + doctor datalist

lib/
  supabase/                 # browser/server/middleware client
  auth/                     # getCachedUser (React cache() wrapped auth.getUser)
  household/                # getCurrentHousehold + getCurrentBaby (cached)
  compute/                  # pure helpers (format, stats) — Asia/Jakarta TZ-locked
  constants/                # WHO percentile, milestone, imunisasi
  report/                   # CSV + AI prompt builders

supabase/migrations/        # SQL files, version controlled
types/supabase.ts           # generated via Supabase MCP

docs/                       # detail-rich docs (see below)
PROJECT_BRIEF.md            # arsitektur lengkap + PR sequence v2
README.md                   # setup + deploy
CLAUDE.md                   # this file
```

## Documentation map

- [docs/architecture.md](docs/architecture.md) — high-level architecture + ERD + RLS strategy
- [docs/auth.md](docs/auth.md) — auth flow, magic-link → password switch, edge cases
- [docs/realtime-sync.md](docs/realtime-sync.md) — Supabase realtime subscription pattern
- [docs/troubleshooting.md](docs/troubleshooting.md) — known issues + recovery procedures (SEGV, PGRST stuck, MCP scope, env vars)
- [docs/operations.md](docs/operations.md) — env vars, Supabase + Vercel config, deploy procedure

## Major features added post-launch (PRs #14–#34)

- **Auto-close + sticky Simpan modal pattern**: useFormStatus + onSubmit setTimeout for instant close, sticky footer so Simpan never falls off-screen on tablet landscape
- **Asia/Jakarta TZ-locked formatters** + datetime-local parsing with `+07:00` suffix
- **Ongoing sleep/pumping** with live Stopwatch, NightLamp overlay (Spotify link + per-household URL pref), Pumping side picker (Kiri/Kanan/Dua) + Pindah action
- **ASI stock batching**: pumping rows = batches; consumed_ml tracks ASI bottle feeds. Auto FIFO allocation in createLogAction; manual per-batch picker via dropdown. `/stock` page lists batches with progress bar
- **Bottle content (sufor / asi)** + per-side pumping timestamps (start_l_at, end_l_at, start_r_at, end_r_at)
- **Medications dropdown** (per-household, with units ml/drop/gr/tab/sachet); Vitamin D seeded
- **Imunisasi facility + doctor** as datalist autocomplete from past entries
- **Total Hari Ini** with DBF L/R + Pumping per-side + batch count detail
- **Flash-in animation** on first Aktivitas Terbaru row after submit

## Active follow-ups

- Edit log on tap recent activity (currently delete + add new)
- Service worker untuk offline read + PWA auto-update (currently: user force-quit + reopen for new deploy on iOS standalone)
- Push notifications reminder imunisasi (defer ke browser PWA push API)
- Resend SMTP integration (kalau email reliability worth-it untuk reset password / invite email)
- Reset password flow (currently: manual via Supabase dashboard)
- Multi-baby support saat anak ke-2 (flow di /more/babies/new — schema ready, UI defer)
- Stock allocation re-balance saat ASI feed dihapus (currently consumed_ml tetap terpakai walaupun row dihapus)
- DBF stopwatch ongoing flow (currently DBF hanya manual log, no Mulai DBF + Stopwatch)
- Optimistic insert dengan client-generated UUID (current realtime: full re-render via router.refresh, OK untuk volume low)
