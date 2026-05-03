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
- `households.sleep_playlist_url` nullable — DORMANT (Spotify integration removed PR #60). Column kept untuk avoid migration churn.
- `medications` table per household — `(household_id, name, default_dose, unit)` dengan `unit IN ('ml','drop','gr','tab','sachet')`. Dropdown options di LogModal med subtype. UNIQUE(household_id, name)
- `immunization_progress.doctor_name` nullable — datalist autocomplete dari past entries
- `babies.dbf_ml_per_min` nullable — fixed mode override for DBF rate. CHECK 0 < x ≤ 30
- `babies.dbf_pumping_multiplier` nullable — multiplier mode for DBF rate (× pumping). CHECK 0 < x ≤ 5
- `logs.effectiveness` nullable — DBF efektivitas: `'efektif'` (100%) / `'sedang'` (80%) / `'kurang_efektif'` (60%). Used to scale ml estimate.
- `logs.dbf_rate_override` nullable — per-row DBF rate snapshot/override (ml/menit). Auto-saved at row creation/end (forward-only behavior). Edit modal field lets user override per-session. CHECK 0 < x ≤ 30.

## DBF rate priority chain

Saat compute ml estimate (`lib/compute/dbf-estimate.ts`):
1. **`logs.dbf_rate_override`** (per-row) — paling spesifik. Auto-snapshot saat row dibuat (forward-only). User bisa edit/clear via Edit modal atau mass edit di filter `?act=dbf`.
2. **`babies.dbf_pumping_multiplier × pumping rate`** — Profile Multiplier mode. Pumping rate dari most-recent meaningful pumping (≥5 ml & ≥10 mnt).
3. **`babies.dbf_ml_per_min`** — Profile Fixed mode. Constant ml/menit.
4. **Auto pumping rate** — ketika kedua di atas null (Profile Auto mode). Pumping rate kalau ada, else fallback default.
5. **Default 4 ml/menit** — literatur lactation (Hartmann/Geddes for 0–6mo).

Mode #2/#3/#4 mutually exclusive di Profile (3-tab picker di /more/profile).

Effective ml = `duration_total × rate × effectivenessFactor` (effectiveness 1.0/0.8/0.6).

Per-feed expected target untuk top-up suggestion: `milkTargetMin / typicalFeedsPerDay(target)` — feeds 10/7/6/5 per age bucket (AAP/IDAI).

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
    household/              # member management
    profile/                # baby profile edit + DBF estimate mode picker
  growth/                   # /growth chart + history
  milestone/                # KPSP/IDAI checklist
  imunisasi/                # vaccine schedule + facility/doctor datalist
  history/                  # log riwayat dengan filter (Jakarta TZ-grouped)
  report/                   # CSV export + AI prompt copier
  stock/                    # ASI batch ledger (pumping batches with FIFO consumption)
  trend/                    # 14-hari charts + Highlights insights
  api/
    invite/, export/        # POST invite, GET CSV
  actions/                  # server actions per domain
    logs.ts                 # create/update/delete + start/end/pause/resume
                            # ongoing + pindah + bulkUpdateDbfRateAction
    growth.ts, milestone.ts, imunisasi.ts, medications.ts
  page.tsx                  # main dashboard (date picker, top-up banner,
                            # mode jam icon, mass edit DBF when act=dbf)
  layout.tsx                # root layout + PWA meta (statusBarStyle: black-translucent)
  manifest.ts               # PWA manifest (Next 14 file convention)
  icon.tsx, apple-icon.tsx  # PWA icons via ImageResponse
  globals.css               # Tailwind + flash-in keyframes

components/                 # client components
  LogModal.tsx              # log entry modal: subtype-aware, MedFields,
                            # bottle ASI/Sufor + batch picker, per-side
                            # pumping, DbfEditPerSide (start/end + auto-
                            # duration), DBF rate override field, MlInput
                            # (chip + stepper)
  OngoingCard.tsx           # ongoing sleep/pumping/dbf/hiccup card +
                            # NightLamp overlay (clock + dim toggle) +
                            # PumpingControls (Pindah/Selesai) + DbfControls
                            # (effectiveness 2-step, combo pump shortcut) +
                            # HiccupControls + EndPumpingModal
  StartOngoingButtons.tsx   # Mulai picker w/ offset + side choice + combo
                            # pump toggle (DBF) + duplicate guard
  Stopwatch.tsx             # client tick component (defer Date.now to mount)
  LiveClock.tsx             # current jam (Jakarta) + LiveDate (Indonesian
                            # day + tanggal). Hydration-safe via deferred mount.
  IdleClockMode.tsx         # fullscreen Mode Jam (kiosk view) + IdleClockToggle
                            # variant: full | icon (header circular)
  TrendCharts.tsx           # 4 daily bar charts (Susu stacked ASI/Sufor +
                            # target step line, Tidur, Pumping stacked L/R,
                            # Diaper) + SleepHeatmap + Interval histogram
  TrendHighlights.tsx       # narrative bullet insights with status icons
  FormCloser.tsx            # auto-close modal on form submission complete
  SubmitButton.tsx          # useFormStatus pending state + spinner
  LogsRealtime.tsx          # 3-layer sync: realtime + visibility + 30s poll
  GrowthChart.tsx           # recharts WHO percentile
  GrowthMeasureModal.tsx    # ukur form
  GrowthRealtime.tsx, ProgressRealtime.tsx
  PromptCopier.tsx          # AI prompt clipboard
  ImunisasiRow.tsx          # imunisasi modal with facility + doctor datalist

lib/
  supabase/                 # browser/server/middleware client
  auth/                     # getCachedUser (React cache() wrapped auth.getUser)
  household/                # getCurrentHousehold + getCurrentBaby (cached)
  compute/                  # format (Asia/Jakarta TZ-locked), stats
                            # (jakartaDayStartMs), dbf-estimate (priority chain),
                            # dbf-effectiveness (research-backed model + top-up)
  constants/                # WHO percentile, milestone, imunisasi,
                            # daily-targets (per-age bands + per-kg ml calc)
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

## Major features added post-launch

- **Auto-close + sticky Simpan modal pattern**: useFormStatus + onSubmit setTimeout for instant close, sticky footer so Simpan never falls off-screen on tablet landscape
- **Asia/Jakarta TZ-locked formatters** + datetime-local parsing with `+07:00` suffix. `jakartaDayStartMs` for "today" boundary. History page Jakarta-grouped.
- **Ongoing flow** w/ live Stopwatch, pause/resume (timestamp-shift on resume — pause time excluded), NightLamp overlay (live clock, dim/bright toggle), Cegukan/Hiccup subtype, edit + delete in Aktivitas Terbaru, "berlangsung" only for stopwatch-flow rows
- **DBF combo flow**: Pindah ke sisi lain, "Sambil pump sisi sebaliknya" toggle in Mulai picker (combo_pump_side) + inline shortcut button when DBF active without pumping
- **DBF effectiveness 2-step** (efektif/sedang/kurang_efektif × 100/80/60% factor) — research-backed (LLLI/IBCLC/AAP markers). Saved per-row as `logs.effectiveness`. Charts + estimate factor it in.
- **Top-up suggestion banner**: post-DBF redirect with `?dbf_id=...` → home page computes `expectedPerFeed - effectiveMl` against age-bucketed feeds-per-day → actionable banner with "Catat botol top-up" → opens LogModal
- **DBF rate priority chain**: row override (auto-snapshot at create/end → forward-only) > Profile multiplier × pumping > Profile fixed > pumping rate > default 4 ml/menit. Mass edit affordance in `?act=dbf` filter.
- **ASI stock batching**: pumping rows = batches; consumed_ml tracks ASI bottle feeds. Auto FIFO allocation in createLogAction; manual per-batch picker via dropdown. `/stock` page
- **Bottle content (sufor / asi)** + per-side pumping timestamps (start_l_at, end_l_at, start_r_at, end_r_at). Edit modal supports per-side edit for both pumping AND DBF (with auto-duration compute)
- **Daily targets WHO/IDAI/AAP** (`lib/constants/daily-targets.ts`) — age bucket × per-kg/hari × current weight. Per-day target lines on /trend (step-after dashed)
- **Trend page** (`/trend`): 6 charts — Susu (stacked ASI vs Sufor + target line), Tidur (cross-day-split bar + target), Pumping (stacked L/R), Diaper (pee + poop), Sleep heatmap (14d × 24h indigo gradient), Feeding interval histogram (5-min cluster dedup). Plus narrative Highlights bullets with status icons.
- **Date picker on home**: `?date=YYYY-MM-DD` (Jakarta) for Total Hari Ini + Aktivitas Terbaru. ‹ › nav + "Hari ini" reset.
- **Mode Jam (idle clock)**: fullscreen kiosk view with big jam, date, sejak terakhir cards, compact total hari ini, mulai shortcuts, reminder pill, dim/bright toggle. Accessible via ⏰ icon in header (always visible) + full button when no ongoing.
- **Cross-device sync resilience** (`LogsRealtime`): postgres_changes subscription + visibilitychange + online listener + 30s poll fallback. Handles iOS PWA WebSocket drops.
- **Sejak Terakhir Tidur** anchored at `end_timestamp` (waktu bangun), bukan `timestamp` (waktu mulai tidur). Ongoing → "sedang berjalan".
- **Server-side guard** vs duplicate ongoing rows of same subtype.
- **Display polish**: pumping/DBF row uses `|` separator antara L/R, skip null sides, sub-minute durations show seconds. Notes display inline italic in Aktivitas Terbaru. Profile saved alert prominent dengan checkmark.

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
