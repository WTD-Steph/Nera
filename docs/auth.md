# Auth — implementation notes

Catatan teknis tentang flow auth Supabase di Nera. Mendukung
[PROJECT_BRIEF.md](../PROJECT_BRIEF.md) §6 (Auth & Onboarding Flow).

## ⚠️ Switch dari magic link → email + password (2026-05-01)

Brief v2 awalnya pilih magic link (no password) via Supabase built-in
SMTP. Setelah testing PR #2a–#4, dua issue muncul:

1. **Rate limit Supabase built-in SMTP** — ~30 email/jam per project di Pro
   tier. Saat testing intensif (kirim ~10 magic link untuk berbagai email
   dalam <1 jam), quota habis. User-side: `429 over_email_send_rate_limit`.
2. **Site URL / redirect_to brittle** — trailing space di Site URL config
   menyebabkan `parse "...vercel.app ": invalid character " " in host name`
   error path selama 50+ menit downtime sebelum di-diagnose.

Akhirnya keputusan **switch ke email + password** untuk v1:
- `supabase.auth.signUp({email, password})` di /signup
- `supabase.auth.signInWithPassword({email, password})` di /login
- Email confirmation **disabled** di Supabase Auth → Settings agar signup
  langsung dapat session
- Tidak ada email yang dikirim Supabase = tidak ada rate limit + tidak
  ada Site URL/redirect_to validation issue
- Magic link infrastructure (`/auth/callback`, PKCE token) tetap ada
  sebagai legacy fallback untuk recovery flow future

**Trade-off yang diterima:**
- User wajib remember password (no "passwordless" UX seperti magic link)
- Reset password flow belum diintegrasikan di v1 — kalau lupa password,
  reset manual via Supabase dashboard atau pakai Supabase email reset
  (butuh re-enable email confirmation)
- Invite flow: owner copy URL invite manual (via WA/SMS) — tidak ada
  auto-email dispatch via Supabase

**Future PR follow-up (kalau email reliability worth-it):**
- Resend SMTP integration (free tier 3000 email/bulan, no aggressive
  hourly limit) untuk:
  - Magic link sebagai opsi login alternatif (bukan replace)
  - Password reset email
  - Invite email auto-dispatch (currently manual share URL)

## Stack

- Magic link only — email + cookie session, tidak ada password
- `@supabase/ssr` clients di [lib/supabase/](../lib/supabase/) untuk
  browser, server, dan middleware
- PKCE flow (default Supabase) — secure single-page-app friendly
- Server actions untuk request magic link (no client-side fetch)
- Edge middleware refresh session per request

## File map

| File | Tanggung jawab |
|------|----------------|
| [app/(auth)/login/page.tsx](../app/(auth)/login/page.tsx) | Form email, render error dari `?error=` |
| [app/(auth)/login/actions.ts](../app/(auth)/login/actions.ts) | Server action `requestMagicLink` — validate + signInWithOtp + redirect |
| [app/(auth)/verify/page.tsx](../app/(auth)/verify/page.tsx) | "Cek email" message, link kirim ulang |
| [app/auth/callback/route.ts](../app/auth/callback/route.ts) | GET handler — exchange PKCE `code` → session |
| [app/auth/signout/route.ts](../app/auth/signout/route.ts) | POST handler — signOut + redirect `/login` |
| [lib/supabase/middleware.ts](../lib/supabase/middleware.ts) | Edge middleware: refresh session + redirect logged-in user dari `/login`/`/verify` ke `/` |
| [lib/utils/origin.ts](../lib/utils/origin.ts) | `getOrigin()` dari `headers()` untuk `emailRedirectTo` aware-Vercel-preview |

## ⚠️ Sensitif: PKCE token di `auth.one_time_tokens`

Saat `signInWithOtp({ email })` dipanggil, Supabase membuat row di tabel
`auth.one_time_tokens` dengan kolom `token_hash`. **Nama kolom misleading
— nilai itu adalah token aktual yang dikirim via email**, bukan SHA hash
dari token. Format: `pkce_<64-hex>`.

Konsekuensi keamanan:

- **Treat seperti API key**: siapapun yang bisa baca `auth.one_time_tokens.token_hash`
  bisa langsung craft URL `/auth/v1/verify?token=<value>&type=signup&redirect_to=...`
  dan login sebagai user tersebut tanpa akses email
- **JANGAN log nilai ini** ke console.log, Sentry, audit log app, atau
  CSV export. Whitelist kolom saat query — jangan pakai `SELECT *` ke
  tabel auth schema dari app code
- **JANGAN expose ke user-facing endpoint** sekalipun via debug page
- **Akses via Supabase MCP execute_sql** harus dianggap sensitif —
  sama seperti akses service_role key. Saat dipakai untuk testing, bersihkan
  user test dari `auth.users` setelahnya kalau perlu

Pengetahuan ini di-discover saat e2e test PR #2a (Playwright via Supabase
MCP) — saya pakai `token_hash` langsung di verify URL untuk auto-test
magic link tanpa baca email. Berfungsi sebagai bukti kerentanan.

Mitigasi yang sudah ada:

- Tabel `auth.*` hanya bisa di-baca via service_role atau Supabase MCP
  (yang punya akses postgres-level). Anon key + RLS tidak punya akses
- App code Nera tidak pernah query `auth.one_time_tokens` — hanya
  Supabase library yang menangani auth state

## Edge cases — TODO untuk PR cleanup future

Belum di-cover di PR #2a, log untuk PR cleanup berikutnya:

- [ ] **Magic link expiry** — Supabase default OTP TTL 60 menit. UX:
      kalau user klik link expired, callback dapat error
      `otp_expired` / `pkce_grant_required`. Saat ini route
      `/auth/callback` redirect ke `/login?error=Gagal verifikasi link.`
      generik. Bisa diperhalus dengan pesan "Link sudah kedaluwarsa,
      silakan minta link baru" + auto-redirect ke /login dengan email
      pre-filled.
- [ ] **Multi-tab logout** — kalau user logout di tab A, tab B masih
      hold cookie cached di-memory React state. Idle 5–10 detik baru
      next request validate ke server. Untuk UX lebih responsive: pasang
      `BroadcastChannel('supabase-auth')` listener di komponen root, atau
      pakai `supabase.auth.onAuthStateChange` di provider client.
- [ ] **Callback dengan invalid session** — `?code=` tidak valid (random
      string injected manual). Sekarang fallback "Gagal verifikasi link.
      Minta link baru.", tapi tidak rate-limited — attacker bisa flood
      callback. Mitigasi: rate limit per IP di middleware atau Vercel
      Edge Config.
- [ ] **Email enumeration** — submit email yang tidak ada di system
      tetap dapat respon "magic link dikirim" (Supabase default). Saat
      ini diharapkan-aman karena attacker tidak tahu apakah email valid
      tanpa akses ke email tersebut. Dokumentasi untuk awareness, bukan
      bug.
- [ ] **Rate limiting `signInWithOtp`** — Supabase default rate limit
      ~30 req/jam per IP. Belum tested apa yang terjadi saat hit. UX
      ideal: pesan "Terlalu banyak percobaan, coba lagi 1 jam lagi".
- [ ] **Session refresh failure** — kalau `getUser()` di middleware fail
      (network blip ke Supabase), kita tidak ada graceful degradation —
      middleware throw → 500. Bisa wrap dengan try/catch + `console.error`
      + lanjut sebagai unauthenticated.

Item-item ini tidak blocking PR berikutnya, tapi worth diaddress sebelum
production launch (sekitar PR #5 / #6 saat realtime + monitoring landed).

## Dashboard config required (one-time)

Sudah dibuat note di [README](../README.md), tapi rekap untuk reference:

**Supabase → Authentication → URL Configuration**:
- Site URL: production URL Vercel (atau custom domain)
- Additional Redirect URLs:
  - `http://localhost:3000/auth/callback`
  - `https://nera-git-main-wtd-stephs-projects.vercel.app/auth/callback`
  - `https://nera-*-wtd-stephs-projects.vercel.app/auth/callback` (preview wildcard)

Tanpa whitelist → error "Redirect URL not allowed" pasca-klik magic link.

## ⚠️ Pitfall: SECURITY DEFINER function di RLS policy → Postgres SEGV (signal 11)

Di PR #2b saya original-nya pakai SECURITY DEFINER helper functions
(`is_household_member`, `is_household_owner`, `is_household_member_of_baby`)
di RLS policy expression. Pattern ini **memicu Postgres backend SEGV**
setiap kali PostgREST melakukan schema cache introspection di Postgres
17.6.x. Symptom: postgres logs penuh dengan
`server process (PID xxxx) was terminated by signal 11: Segmentation fault`,
dan REST API alternating PGRST001 (no connection) ↔ PGRST002 (schema
cache rebuild) tanpa pernah stabilize.

Mitigation tidak bisa via NOTIFY pgrst, pg_terminate_backend, atau pause+
restore project — bug deterministik tied ke schema. Harus drop policy yang
memakai SECURITY DEFINER helper.

**Don't:**
```sql
CREATE FUNCTION public.is_household_member(h uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER ...;
CREATE POLICY foo ON tbl USING (public.is_household_member(id));
-- ↑ SEGV pada introspection
```

**Do — direct EXISTS subquery dalam policy:**
```sql
CREATE POLICY foo ON tbl USING (
  EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.household_id = tbl.id AND hm.user_id = auth.uid()
  )
);
```

**Caveat — recursion**: kalau policy ada di table yang sama dengan
table di EXISTS, postgres TIDAK auto-disable RLS recursion (kontradiksi
dengan dokumentasi yang sempat saya asumsikan). `SELECT FROM tbl` di
dalam policy of `tbl` akan trigger `42P17 infinite recursion`.

Solution untuk self-referencing table: SELECT/DELETE policy dibatasi ke
self-only (`user_id = auth.uid()`), dan operasi cross-member dilakukan
via SECURITY DEFINER **RPC** yang dipanggil dari app code (TIDAK
direferensikan di policy expression). Lihat `list_household_members()`
dan `remove_household_member()` di [migration](../supabase/migrations/20260501073000_household.sql)
sebagai contoh.

Pelajaran: **SECURITY DEFINER functions OK di-define dan OK di-call dari
app, tapi JANGAN dipakai di RLS policy expression.**

## ⚠️ Pitfall: `SET LOCAL ROLE` di Supabase MCP `execute_sql` bisa crash PostgREST

Saat e2e test PR #2b, saya pakai `BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '...'; ... ROLLBACK;` di
`mcp__supabase__execute_sql` untuk simulasi RLS sebagai user. Query
return `Connection terminated unexpectedly`.

Setelah itu, **PostgREST instance jadi rusak** — semua REST API call
(termasuk dari Next.js app via @supabase/ssr) return `503 PGRST001 no
connection to the server`. Postgres direct (via MCP execute_sql) tetap
healthy, tapi REST layer tidak bisa pulih sampai trigger ulang.

**Recovery:**
1. `NOTIFY pgrst, 'reload schema'` + `NOTIFY pgrst, 'reload config'`
2. Kalau masih stuck: `pg_terminate_backend(pid)` semua koneksi
   PostgREST → triggers reconnect with fresh state. Setelah itu butuh
   ~1–3 menit untuk schema cache rebuilt
3. PGRST002 muncul saat schema cache lagi loading — itu tahap recovery
   normal, lanjut ke 200/401

**Don't:**
- `SET LOCAL ROLE authenticated` di execute_sql untuk simulate user — gunakan
  pendekatan lain (test user real signed-in via Playwright + auth flow)
- Modifikasi role grants saat connection pool aktif

**Do:**
- Test RLS via real session: login user di browser, query via app, observe
- Atau buat dedicated test user dengan service_role di staging env

## E2E test reference

Test plan PR #2a (semua pass via Playwright MCP + Supabase MCP, lihat
[PR #2 comment](https://github.com/WTD-Steph/Nera/pull/2#issuecomment-4358176994)):

1. Belum login → `/` redirect `/login`
2. Submit email valid → `/verify?email=...`
3. Submit email invalid → `/login?error=...`
4. Magic link click → `/auth/callback?code=` → `/` logged-in
5. `/` tampil email + tombol Keluar
6. Logged-in akses `/login` → middleware redirect `/`
7. Klik Keluar → `/login`

Otomatisasi test 4: ambil token dari `auth.one_time_tokens.token_hash`
via Supabase MCP, craft verify URL langsung. Lihat warning di atas —
teknik ini sengaja di-document karena bermanfaat untuk e2e CI later
(dengan ephemeral test users), tapi production code TIDAK BOLEH
mengandalkan akses ini.
