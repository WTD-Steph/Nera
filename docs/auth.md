# Auth — implementation notes

Catatan teknis tentang flow auth Supabase di Nera. Mendukung
[PROJECT_BRIEF.md](../PROJECT_BRIEF.md) §6 (Auth & Onboarding Flow).

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
