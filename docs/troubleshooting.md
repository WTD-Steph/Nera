# Troubleshooting — known issues & recovery

Catatan insiden + fix yang ditemui selama development. Reference saat menghadapi symptom serupa.

## 1. Postgres backend SEGV (signal 11) saat PostgREST schema introspection

**Symptom:**
- REST API alternating `503 PGRST001 no connection to the server` ↔ `503 PGRST002 schema cache rebuild` permanent loop
- Postgres logs: `server process (PID xxxx) was terminated by signal 11: Segmentation fault`, `database system was interrupted`, `database system is in recovery mode`
- Project status di Supabase dashboard tetap `ACTIVE_HEALTHY` (false healthy)
- Tidak pulih via `NOTIFY pgrst, 'reload schema'`, `pg_terminate_backend`, atau pause+restore project

**Root cause:**
SECURITY DEFINER function di-reference dari RLS policy expression. Postgres 17.x deterministically segfault saat PostgREST schema introspection mencoba evaluate policy yang reference helper function dengan SECURITY DEFINER + SET search_path.

**Recovery:**
1. DROP semua RLS policy yang reference SECURITY DEFINER helper
2. Tunggu PostgREST recover (1-3 menit setelah drop, observe via curl REST endpoint)
3. Re-add policy dengan direct EXISTS subquery (no SECURITY DEFINER reference)
4. Untuk operasi yang butuh bypass RLS, pindahkan ke SECURITY DEFINER **RPC** dipanggil dari app code (TIDAK dari policy)

**Prevent:**
- Code review setiap RLS migration: search "SECURITY DEFINER" di policy file → reject kalau di-reference dari `USING (...)` atau `WITH CHECK (...)`
- Pakai pattern di [CLAUDE.md §RLS pattern](../CLAUDE.md#rls-pattern-per-pelajaran-pr-2b)

## 2. PostgREST connection pool corruption setelah `SET LOCAL ROLE`

**Symptom:**
- Setelah jalan SQL `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{...}'; SELECT ...; ROLLBACK;` di Supabase MCP execute_sql, query return `Connection terminated unexpectedly`
- Setelah itu PostgREST permanently return `503 PGRST001 no connection to server`
- Postgres direct (via execute_sql) tetap healthy

**Root cause:**
SET LOCAL ROLE merusak connection state di pgbouncer/supavisor pooler yang dipakai PostgREST. Connection di-return ke pool dengan state corrupt.

**Recovery:**
- `pg_terminate_backend` semua koneksi PostgREST (`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'postgrest'`)
- Tunggu re-establish (1-3 menit)
- Kalau masih stuck >10 menit: pause + restore project via Supabase MCP atau dashboard

**Prevent:**
- ❌ JANGAN pakai `SET LOCAL ROLE` di Supabase MCP execute_sql untuk RLS testing
- ✅ Test RLS as authenticated user via real session: login via Playwright + auth flow, query lewat browser/server client (yang automatically apply RLS)

## 3. Vercel preview/production 500 MIDDLEWARE_INVOCATION_FAILED

**Symptom:**
- `https://<deploy>.vercel.app/...` return `500 INTERNAL_SERVER_ERROR Code: MIDDLEWARE_INVOCATION_FAILED`
- Build logs clean
- Local `npm run dev` works

**Root cause possibilities:**
1. Env var `NEXT_PUBLIC_SUPABASE_URL` punya value placeholder (`https://aBcDe.supabase.co`) atau salah host → DNS NXDOMAIN saat middleware fetch → `getUser()` throw → middleware throw → 500
2. Env var TIDAK ada di scope deployment (Production vs Preview vs Development)
3. Env var di-set tapi deployment dibuat sebelum env var di-save → existing deploy pakai old env. Need redeploy

**Diagnose:**
```bash
# Cek DNS resolve
nslookup <supabase-host>.supabase.co

# Cek deployment env list via Vercel MCP
mcp__vercel__getDeployment dengan deploymentId
# Look at "env" array — listing names yang seharusnya available
```

**Recovery:**
1. Verify Vercel project env vars: value benar (no placeholder, no trailing space), scope checked (Production + Preview minimal)
2. Trigger redeploy (push commit, atau dashboard → Redeploy → uncheck "Use existing build cache")
3. Test ulang

## 4. Magic link "redirect_to" trailing space

**Symptom:**
- Magic link click → land di Supabase verify URL dengan `redirect_to=<host>%20` (note `%20` URL-encoded space)
- Supabase log: `parse "<host> ": invalid character " " in host name`
- 500 error path muncul

**Root cause:**
Site URL di Supabase Auth → URL Configuration ada trailing space saat copy-paste setup.

**Recovery:**
- Edit Site URL — hapus space di akhir, save
- Tidak ada masalah retroaktif (link baru valid setelah save)

**Prevent:**
- Saat copy-paste URL ke config field, klik di akhir field untuk verify cursor di posisi terakhir character bukan spasi tersembunyi
- Pakai email + password (lihat [auth.md §Switch dari magic link](auth.md)) — tidak ada Site URL validation di happy path

## 5. Supabase email rate limit

**Symptom:**
- `signInWithOtp` atau `signUp` (jika email confirmation enabled) error `429 over_email_send_rate_limit`
- Supabase auth log: `email rate limit exceeded`

**Root cause:**
Supabase built-in SMTP free tier ~4 email/jam, Pro tier ~30 email/jam per project. Hit dengan signup/login intensif saat testing.

**Recovery:**
- Tunggu 1 jam rolling window
- ATAU disable email confirmation di Supabase Auth → Settings (kalau pakai password auth, tidak butuh email)
- Future: integrate Resend SMTP (free 3000/bulan, no aggressive hourly limit) — defer ke PR follow-up

## 6. Vercel MCP scope 403

**Symptom:**
- `mcp__claude_ai_Vercel__get_runtime_logs`, `get_deployment_build_logs`, etc return `403 forbidden ... Trying to access resource under scope "wtd-stephs-projects". You must re-authenticate to this scope`

**Root cause:**
Vercel MCP server auth tidak punya scope ke team `wtd-stephs-projects` (team_c9df61AmROoQrX4TYEoN7lZ6).

**Recovery:**
- User-side: `/mcp` → reauth `claude_ai_Vercel` MCP dengan team scope
- Workaround: pakai `mcp__vercel__getDeployments`, `mcp__vercel__getDeployment`, `mcp__vercel__getDeploymentEvents` (other Vercel MCP, no scope issue) untuk basic health checks. Limited dibanding `claude_ai_Vercel` (no runtime logs)

## 7. GitHub MCP write 401

**Symptom:**
- `mcp__github__create_pull_request`, `add_issue_comment`, `create_issue` return `401 Authentication Failed: Requires authentication`
- `get_pull_request`, `list_pull_requests`, `get_file_contents` work fine

**Root cause:**
GitHub MCP token punya read scope tapi tidak write.

**Recovery:**
- User-side: `/mcp` → reauth GitHub MCP dengan `repo` write scope
- Workaround: pakai `gh` CLI (sudah authenticated dengan repo + workflow scope di setup awal). All commands work: `gh pr create`, `gh pr merge`, `gh pr comment`, `gh pr edit`

## 8. Stale Playwright Chrome instance

**Symptom:**
- `mcp__playwright__browser_navigate` return `Browser is already in use for C:\...\mcp-chrome-XXXXX, use --isolated to run multiple instances of the same browser`

**Root cause:**
Previous Claude session leave Chrome instances running, lock file at user-data-dir.

**Recovery:**
```powershell
# Find Playwright-managed Chrome PIDs
Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -like "*mcp-chrome*"
} | Select-Object ProcessId, CommandLine

# Kill all (parent process cascade-terminates children)
Stop-Process -Id <main-PID> -Force
```

Setelah kill, retry `browser_navigate`.

## 9. PostgREST returning 503 saat schema baru di-apply

**Symptom:**
Migration sukses via apply_migration, tapi `/rest/v1/<new-table>` return 503 PGRST002 sebentar.

**Root cause:**
PostgREST belum reload schema cache. Migration apply via Supabase MCP biasanya auto-trigger reload, tapi kadang lag.

**Recovery:**
- `NOTIFY pgrst, 'reload schema'` via execute_sql
- Tunggu 1-3 detik, retry endpoint

**Prevent:**
- Setelah apply_migration, jangan langsung query baru. Tunggu sedetik atau eksplisit NOTIFY.

## 10. Recharts heavy client bundle

**Symptom:**
- `/growth` page First Load JS 256 kB (~3x lipat halaman lain)

**Root cause:**
Recharts bundle ~100 kB. Diimport di components/GrowthChart.tsx (client component).

**Acceptable for v1:**
- Hanya di-load saat user buka /growth
- Mobile 4G sudah cukup cepat (<1s)

**Future optimization:**
- Pakai Recharts `import { LineChart } from "recharts/es6"` untuk tree-shaking
- Atau alternative chart lib lebih kecil (chart.js, observable plot, victory)
- Defer ke kalau perf jadi issue di production

## 11. React hydration mismatch (#418/#423/#425) dari time-rendering

**Symptom:**
- Console errors: `Minified React error #425 / #418 / #423`
- Client-side text differs dari server-rendered text
- Often pada client components yang render times (`Stopwatch`, `OngoingCard` `fmtClock`, etc)

**Root cause:**
Server (Vercel UTC) dan client (browser local TZ, e.g. Asia/Jakarta UTC+7) menghasilkan `getHours()` / `Date.now()` value berbeda. SSR HTML pakai server result, React di-client expect same → mismatch saat hydrate.

**Recovery:**
- Untuk wall-clock display: pakai `toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta", ... })` di `lib/compute/format.ts` — explicit timezone bikin server + client output identical
- Untuk runtime values (`Date.now()`, stopwatch elapsed): defer ke client. Initialize state ke `null` / placeholder (`--:--`), isi value di `useEffect` setelah mount
- Lihat `components/Stopwatch.tsx` + `components/OngoingCard.tsx` `fmtClock` sebagai reference

**Prevent:**
- JANGAN pakai raw `new Date().getHours()` / `getMinutes()` di komponen yang render server-side
- JANGAN pakai `useState(() => Date.now())` initial expression — server vs client run berbeda
- Pakai helper di `lib/compute/format.ts` (TZ-locked) atau defer-to-mount pattern

## 12. iOS PWA cache aggressively, no auto-update on deploy

**Symptom:**
- Vercel deploy fresh code, but iOS PWA standalone (Add to Home Screen) keeps showing old version
- User force-refresh tidak help; close+reopen kadang help kadang tidak

**Root cause:**
Tidak ada service worker. iOS Safari standalone caches HTML aggressively. Tanpa SW, pure browser cache control via `Cache-Control` header — Vercel sets immutable on `_next/static/*` chunks (which is correct), tapi entry HTML can be stuck.

**Recovery (for user):**
- Force-quit dari app switcher (swipe up + flick card away), reopen → biasanya pull versi baru
- Pull-to-refresh inside app sometimes works
- Last resort: uninstall + re-add PWA dari Safari

**Prevent / future fix:**
- Implement service worker dengan `skipWaiting` + `clients.claim` (next-pwa atau workbox) — defer ke kalau update friction jadi keluhan rutin
- Atau lighter: client-side polling endpoint `/__version` saat focus, prompt "Versi baru tersedia, refresh?"

## 13. Future-dated sleep / log creates konfusi UX

**Symptom:**
- User sees "Tidur sedang berlangsung" tapi stopwatch shows `00:00` indefinitely
- User confused "kenapa tidur selesai tiba2?"

**Root cause:**
LogModal Catat Cepat → Tidur memungkinkan enter both `Waktu` (start) dan `Bangun (kosongkan jika masih tidur)` (end). User typed both dengan times di future relative to current time, atau end yang masuk akal tapi entered as future. End-timestamp di-set, sleep terlihat "completed" walaupun start masih di future.

**Diagnose:**
```sql
SELECT id, timestamp, end_timestamp, created_at, updated_at
FROM public.logs
WHERE subtype = 'sleep' AND end_timestamp IS NOT NULL
  AND created_at = updated_at  -- single-INSERT, no later UPDATE
ORDER BY timestamp DESC;
```
Rows dengan `created_at = updated_at` di-INSERT lengkap — biasanya manual entry, bukan ongoing-then-stopped.

**Prevent / mitigate:**
- Edukasi user: Mulai Tidur (Mulai Sekarang) untuk ongoing dengan stopwatch; Catat Cepat → Tidur untuk retroactive entry only
- Kalau masalah jadi rutin: hapus Tidur dari Catat Cepat, atau warn kalau start > now()

## 14. RLS update policy gotcha (households owner-only silent fail)

**Symptom:**
- Member (non-owner) updates a household-scoped field via the app → server action redirects "saved" tapi DB unchanged

**Root cause:**
`households_update_owner` RLS policy: `EXISTS (... AND hm.role = 'owner')`. Non-owner doesn't satisfy → RLS silently rejects (0 rows affected, no error).

**Prevent:**
- Server actions yang touch owner-only fields explicit check `current.role === 'owner'` dulu sebelum UPDATE — bukan rely RLS error. Lihat `app/more/household/actions.ts` `updateSleepPlaylistAction` sebagai reference

## 15. Datetime-local form input parsed as UTC instead of Jakarta

**Symptom:**
- User types `14:30` (Jakarta) di `<input type="datetime-local">`
- DB stores `14:30 UTC` (= `21:30` Jakarta) — 7-hour offset bug
- Display shows `21:30` Jakarta time (correct rendering, wrong source)

**Root cause:**
`<input type="datetime-local">` value format `YYYY-MM-DDTHH:mm` no TZ suffix. Server (Vercel UTC) `new Date(raw)` interprets as UTC. User intended Jakarta local.

**Recovery:**
- Server actions append `+07:00` suffix sebelum `new Date()` — see `app/actions/logs.ts` + `app/actions/growth.ts` `isoOrNull` helper

**Prevent:**
- Setiap server action yang parse `datetime-local` HARUS pakai `isoOrNull` (atau equivalent) yang append TZ
- Don't pass raw `new Date(formData.get(...))` ke DB

## 16. iOS PWA white strip below status bar in night-lamp

**Symptom:**
- Night-lamp mode shows pure black bg
- iPad PWA standalone: thin white/colored line right below the iOS status bar

**Root cause:**
`apple-mobile-web-app-status-bar-style: default` (or omitted) renders the iOS status bar with system tint. Page bg doesn't extend underneath. With `viewport-fit=cover` page extends visually but only into the safe-area below — top safe-area still drawn by system.

**Recovery:**
- Set `appleWebApp.statusBarStyle: "black-translucent"` in app/layout.tsx → iOS overlays status bar transparently on top of the page
- Combined with html/body bg manipulation in NightLamp useEffect (paint black on mount, restore on unmount), the entire visible viewport including under the status bar is black

**Prevent:**
- Test full-screen black overlays on real iOS PWA, not just desktop browser
- See `components/OngoingCard.tsx` NightLamp useEffect untuk pattern

## Diagnostic commands cheat-sheet

```bash
# REST API health
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://<project>.supabase.co/rest/v1/" \
  -H "apikey: <anon-jwt>"

# Postgres direct via Supabase MCP
mcp__supabase__execute_sql project_id=<id> query="SELECT 1"

# Postgres logs (last 24h)
mcp__supabase__get_logs project_id=<id> service=postgres

# Auth logs
mcp__supabase__get_logs project_id=<id> service=auth

# Deployment status
mcp__vercel__getDeployments app=nera limit=3

# Vercel build/runtime events
mcp__vercel__getDeploymentEvents deploymentId=dpl_XXX
```
