# Architecture overview

High-level walkthrough Nera. Mendukung [PROJECT_BRIEF.md](../PROJECT_BRIEF.md) §3-5 dengan focus pada implementation reality (post 13 PR merged).

## Layer

```
┌────────────────────────────────────────────┐
│ Browser (mobile-first, tablet/desktop OK)  │
│ - PWA installable (manifest + iOS meta)    │
│ - Realtime subscription via @supabase/ssr  │
└──────────────────┬─────────────────────────┘
                   │ HTTPS
┌──────────────────▼─────────────────────────┐
│ Vercel Edge + Lambda (Next.js 14)          │
│ - Middleware (session refresh, redirect)   │
│ - Server Components (data fetch + render)  │
│ - Server Actions (mutations via formData)  │
│ - API routes (/api/invite, /api/export)    │
│ - PWA icon routes (Edge runtime)           │
└──────────────────┬─────────────────────────┘
                   │ Postgres wire + REST
┌──────────────────▼─────────────────────────┐
│ Supabase (ap-southeast-1, Singapore)       │
│ - Postgres 17 dengan RLS per-row           │
│ - PostgREST untuk REST API + realtime      │
│ - GoTrue auth (email + password)           │
│ - Realtime publication: logs, growth,      │
│   milestone_progress, immunization_progress│
└────────────────────────────────────────────┘
```

## Data model

```
┌──────────────┐
│ auth.users   │ (Supabase managed)
└──────┬───────┘
       │ FK pada created_by, user_id, invited_by, etc
       │
       ├─────────► households
       │              │ id, name, created_by, audit
       │              │
       │              ├──► household_members
       │              │       (household_id, user_id, role)
       │              │       PRIMARY KEY (household_id, user_id)
       │              │       role enum 'owner' | 'member'
       │              │
       │              └──► household_invitations
       │                      (token, invited_email, role,
       │                       expires_at, accepted_at)
       │
       │     ┌────────► babies
       │     │             (household_id FK, name, gender, dob,
       │     │              birth_weight_kg, birth_height_cm)
       │     │
       │     ├────────► logs
       │     │             (baby_id FK, subtype enum, timestamp,
       │     │              fields per subtype dengan partial CHECK)
       │     │             — feeding: amount_ml + bottle_content
       │     │               ('sufor'|'asi') ATAU duration_l/r_min
       │     │             — pumping: amount_l/r_ml + per-side
       │     │               start_l_at, end_l_at, start_r_at, end_r_at
       │     │             — pumping batches: consumed_ml tracks how
       │     │               much fed back via ASI bottle feeds
       │     │             — sleep: end_timestamp nullable (ongoing)
       │     │
       │     ├────────► growth_measurements
       │     │             (baby_id FK, measured_at,
       │     │              weight_kg, height_cm, head_circ_cm)
       │     │
       │     ├────────► milestone_progress
       │     │             PRIMARY KEY (baby_id, milestone_key)
       │     │
       │     └────────► immunization_progress
       │                   PRIMARY KEY (baby_id, vaccine_key)
       │                   + doctor_name (datalist autocomplete)
       │
       │  household-scoped:
       │     households.sleep_playlist_url (per-household night-lamp
       │       Spotify URL override, NULL = app default)
       │
       │     ├────────► medications
       │                   (household_id FK, name, default_dose, unit
       │                    IN ('ml','drop','gr','tab','sachet'))
       │                   UNIQUE(household_id, name)
```

Semua tabel kecuali `auth.*` ada di schema `public`. Semua punya RLS enabled.

## RLS strategy

Pelajaran utama dari PR #2b (lihat [troubleshooting.md](troubleshooting.md) §SEGV): JANGAN pakai SECURITY DEFINER function di policy expression. Pattern:

### Tabel `household_members`
- SELECT: `user_id = auth.uid()` saja (self-only, anti `42P17` recursion)
- DELETE: `user_id = auth.uid()` saja (self-leave only)
- INSERT/UPDATE: tidak ada policy direct → harus via RPC
- Cross-member ops via SECURITY DEFINER RPC: `list_household_members(h_id)`, `remove_household_member(h_id, target_user_id)`

### Tabel `households`, `household_invitations`
- SELECT/UPDATE/DELETE pakai EXISTS subquery ke `household_members` (yang RLS-nya self-only, jadi tidak recursive)
- INSERT direct denied; pakai RPC `create_household_with_owner(name)` untuk bootstrap

### Tabel `babies`, `logs`, `growth_measurements`, `*_progress`
- SELECT/INSERT/UPDATE: any household member via `EXISTS (SELECT FROM babies JOIN household_members)` 2-table join
- DELETE pada `babies`, `growth_measurements`, `logs`: created_by self OR owner (per-table variant)
- Realtime publication enabled untuk auto-sync antar device

## Auth flow

Lihat [auth.md](auth.md) untuk detail. Singkat:

1. `/signup` → form email + password → `signUp({email, password})` → langsung dapat session
2. `/login` → `signInWithPassword({email, password})` → session cookie
3. Middleware refresh session per request, redirect /login → / kalau already authenticated
4. Server actions + RLS gate semua CRUD per user

## Onboarding chain

```
/login or /signup → success
    ↓
    /  (server check: has session?)
    ↓ (yes, continue)
    has household_members row?
    ├─ no → /setup (create household via RPC)
    │       → /setup/baby (create baby row)
    │       → / dengan ?welcome=baby
    └─ yes → has babies row in household?
            ├─ no → /setup/baby
            └─ yes → render dashboard
```

## Realtime sync

Per [realtime-sync.md](realtime-sync.md):

- Tabel `logs`, `growth_measurements`, `milestone_progress`, `immunization_progress` di-publish via `supabase_realtime`
- Client subscribe per baby_id channel: `logs:{baby_id}`, `growth:{baby_id}`, etc
- On INSERT/UPDATE/DELETE event → `router.refresh()` (Next.js soft nav re-fetch server data)
- RLS-aware: realtime respects table policies, user dapat events hanya untuk row yang dia bisa SELECT

## State management

Tidak ada Redux/Zustand/etc. Pendekatan minimal:

- **Server state** = source of truth, fetch fresh per page render
- **Client state** = local component state untuk modal open/close, form input transient
- **Realtime** trigger `router.refresh()` → server re-fetch → re-render
- Tidak ada client-side cache, tidak ada optimistic insert (server action redirect sudah kasih instant feedback)

Trade-off: full re-render per realtime event. OK untuk volume Nera (handful log/jam, 2 user). Kalau volume naik signifikan, upgrade ke surgical state patches.

## File-based routing

Pakai Next.js 14 App Router conventions. Lihat [CLAUDE.md](../CLAUDE.md) §"Stable file map" untuk file tree.

## Forms & mutations

Pattern: server action + form action

```tsx
// app/actions/<domain>.ts
"use server";
export async function fooAction(formData: FormData) {
  // validate, mutate via supabase client (RLS enforces)
  redirect("/?fooSaved=1");
}

// page.tsx (server component)
import { fooAction } from "@/app/actions/foo";
<form action={fooAction}>
  <input name="bar" />
  <button type="submit">Submit</button>
</form>
```

Untuk form yang butuh client state (modal, conditional fields), wrap di client component yang mounts hidden input + form action.

## Ongoing log flows (sleep + pumping)

Sleep dan pumping bisa di-log dua cara:

1. **Catat manual** (Catat Cepat → Tidur / Pumping) → buka LogModal dengan field lengkap (start, end, ml, durasi). Cocok untuk retroactive entry.
2. **Mulai sekarang + stopwatch** → insert row dengan `end_timestamp = NULL`, render OngoingCard dengan live stopwatch + Stop button. Cocok untuk track real-time.

### Sleep ongoing
- `Mulai Tidur` → INSERT `subtype=sleep, timestamp=now(), end_timestamp=null`
- OngoingCard: stopwatch ticks, 🌑 Mode Night Lamp button, "Bangun · Stop" button
- Night-lamp overlay: black bg + dim red, fullscreen (Fullscreen API + theme-color black + html/body bg black for safe-area), Spotify "Putar musik tidur" link (`households.sleep_playlist_url` atau default Baby Sleep playlist)
- "Bangun · Stop" → `endOngoingSleepAction` UPDATE end_timestamp = now()

### Pumping ongoing — per-side flow
- `Mulai Pumping` tile expands inline ke 3 buttons: 🤱 Kiri / 🤱 Kanan / 🤱🤱 Dua-duanya
- INSERT log dengan `start_l_at`/`start_r_at`/both di-set ke now (sesuai pilihan)
- OngoingCard PumpingControls computed state dari per-side flags:
  - `Kiri aktif` / `Kanan aktif` badge ditampilkan sesuai side dengan start set + end null
  - `Pindah ke X` button hanya muncul kalau salah satu side belum pernah dipakai (single-side mode). After Pindah → both sides pernah aktif → button hilang
  - `Selesai · Catat ml` selalu ada → buka EndPumpingModal
- `pumpingPindahAction`: single UPDATE end_X_at=now + start_other_at=now (atomic side-switch)
- `endOngoingPumpingAction`: read existing per-side state, set end_l/r_at=now untuk side yang masih aktif (untuk parent yang langsung Selesai tanpa Pindah), scrub start/end side dengan ml=0

## ASI stock batching

Pumping log = batch. Produced ml = `amount_l_ml + amount_r_ml`. Consumed via `consumed_ml` column. Remaining = produced - consumed_ml.

- `/stock` page: header summary (tersisa, batch aktif, total produksi/dipakai) + list batches dengan progress bar (penuh / sebagian / habis)
- `Stok ASI` card di home page: total tersisa + batch aktif count → link ke /stock
- **Auto FIFO allocation**: saat `createLogAction` insert feeding row dengan `bottle_content='asi'` dan `amount_ml > 0`, query pumping batches order by timestamp ASC, increment consumed_ml across batches sampai feed amount habis. Multiple batches bisa di-touch dalam satu feed kalau perlu.
- **Manual batch picker**: LogModal feeding dengan ASI selected menampilkan dropdown "Batch ASI" dengan options "Auto · FIFO" + tiap batch dengan remaining ml. User pilih → batch_id ke server → batch tersebut di-prioritize di queue, sisa spill FIFO ke batch lain
- DBF feeding tidak count terhadap stock (langsung dari source). Sufor bottle feed juga tidak (bukan ASI).

## Timezone (Asia/Jakarta)

Vercel runtime UTC; browser any TZ; semua wall-clock display + parse explicitly Asia/Jakarta.

- `lib/compute/format.ts` `fmtTime` pakai `toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta", hour:"2-digit", minute:"2-digit", hour12: false })` → "HH:MM" colon (id-ID locale render dengan period "HH.MM" yang user found confusing)
- `fmtDate` pakai id-ID locale + timeZone Jakarta → "2 Mei 2026"
- `fmtSleepRange` + `pumpDur` derive durasi dari ISO timestamps tanpa raw `getHours()`
- Server actions `isoOrNull` parse `<input type="datetime-local">` value (no TZ) dengan append `+07:00` suffix sebelum `new Date()` → Jakarta-local input properly converted to UTC instant
- Hydration safety: locale + TZ stable di server (UTC runtime) dan client (Jakarta browser) menghasilkan output identik → no #418/#423/#425 mismatch

## CSV + AI report

`/report` page = single hub:
- **CSV**: GET `/api/export` → `text/csv` blob, UTF-8 BOM untuk Excel ID. Format: 5 sections (profil, BB/PB pengukuran, log aktivitas, milestone, imunisasi)
- **AI prompt**: client comp `<PromptCopier>` build prompt dari context (profil + 7-day log summary + growth history) + user pilih preset/custom → clipboard API → user paste ke Claude.ai/ChatGPT/Gemini eksternal

In-app AI integration di-defer (tidak ada Anthropic SDK call dari Nera). Trade-off lihat brief §15 deviation note di [PR #12 commit](https://github.com/WTD-Steph/Nera/pull/12).
