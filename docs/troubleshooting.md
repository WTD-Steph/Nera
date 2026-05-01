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
