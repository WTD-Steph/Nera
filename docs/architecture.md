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

## CSV + AI report

`/report` page = single hub:
- **CSV**: GET `/api/export` → `text/csv` blob, UTF-8 BOM untuk Excel ID. Format: 5 sections (profil, BB/PB pengukuran, log aktivitas, milestone, imunisasi)
- **AI prompt**: client comp `<PromptCopier>` build prompt dari context (profil + 7-day log summary + growth history) + user pilih preset/custom → clipboard API → user paste ke Claude.ai/ChatGPT/Gemini eksternal

In-app AI integration di-defer (tidak ada Anthropic SDK call dari Nera). Trade-off lihat brief §15 deviation note di [PR #12 commit](https://github.com/WTD-Steph/Nera/pull/12).
