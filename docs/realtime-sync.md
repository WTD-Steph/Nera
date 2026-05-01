# Realtime sync — implementation notes

PR #5 brief (`feature/realtime-foundation`). Mendukung
[PROJECT_BRIEF.md](../PROJECT_BRIEF.md) §10 (Realtime sync — multi-user
membership).

## Pola minimal v1

Tidak ada client-side state management library, no optimistic insert,
no dedup logic. Pendekatan paling sederhana yang valid:

1. **Supabase realtime publication** — `ALTER PUBLICATION supabase_realtime
   ADD TABLE public.logs;` ([migration](../supabase/migrations/20260501123000_realtime_logs.sql)).
2. **Client subscription** — `<LogsRealtime babyId={...} />`
   ([component](../components/LogsRealtime.tsx)) mount di dashboard `/`
   dan `/history`. Subscribe ke channel `logs:{baby_id}` filtered
   `baby_id=eq.{value}`.
3. **On event → `router.refresh()`** — Next.js soft navigation re-runs
   server components, page re-fetch logs dari DB, UI update.

## Trade-off

**Pros:**
- Minimal code (~30 LOC client component)
- Leverage existing server-render path (no client state duplication)
- RLS-aware (Supabase realtime respects table policies — user hanya
  dapat events untuk row yang dia bisa SELECT via household_members
  membership)

**Cons:**
- Full re-render per event (vs surgical state update)
- Network round-trip per event untuk re-fetch
- Latency ~200ms event-to-UI

Acceptable untuk volume Nera (handful log/jam, 2 user). Kalau volume
naik (mis. 100+ log/hari) atau latency jadi terasa, upgrade ke client-
side cache + optimistic patch (PR follow-up).

## Multi-tab same-user

Saat user insert log dari tab A, server action redirect → page re-render
di tab A (immediate visibility). Realtime echo juga sampai ke tab A,
trigger `router.refresh()` lagi (idempotent — query DB ulang, sama
hasilnya). Tidak ada dedup explicit, tapi tidak ada UI artifact karena
data konsisten.

Tab B (same user, different device) dapat realtime event → refresh →
muncul log baru dari tab A.

## Cross-user (different household member)

Stephanus insert dari device A → realtime event broadcast ke channel
`logs:{baby_id}`. Istri (member of same household) subscribe ke channel
yang sama. Realtime evaluate RLS policy — istri MEMBER of household,
SELECT allowed → event delivered → istri's tab refresh → log baru muncul.

User di household lain (tidak member) — RLS evaluate, SELECT denied,
event TIDAK delivered. Privacy preserved.

## Konflik concurrent edit

Tidak diatasi explicit di v1 — Last-Write-Wins via `updated_at`. Sangat
jarang kejadian (Anda + istri sangat unlikely edit row yang SAMA
bersamaan di sub-detik window). Brief §11 Q2 sudah accept ini.

Future: kalau kejadian, upgrade ke optimistic locking via `updated_at`
precondition pada UPDATE.

## Deferred ke PR follow-up

- Optimistic insert dengan client-generated UUID (avoid roundtrip latency
  untuk own-insert)
- Dedup helper untuk skip realtime echo of own client's writes
- Visual indicator "syncing..." saat ada pending op
- Reconnect handling (realtime channel disconnect → tab reload manual)

## Realtime untuk entity lain

PR #5 hanya enable untuk `public.logs` (entity paling sering di-write).
Future PR boleh enable untuk:
- `public.babies` (jarang, tapi profile edit benefit)
- `public.household_members` (rarely changes; OK tanpa realtime)
- `public.growth_measurements` (PR #6) — ya, multi-user pengukuran
- `public.milestone_progress` / `public.immunization_progress` (PR #7) — ya
