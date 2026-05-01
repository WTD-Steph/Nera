# Operations — env vars, deploy, config

Setup + ongoing maintenance untuk Nera production.

## Env vars

Semua di Vercel project settings → Environment Variables. Scope: Production + Preview minimal (Development optional, hanya untuk `vercel dev` lokal yang tidak kita pakai).

| Variable | Required | Value |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | `https://glbkdemanhkybwdlmjns.supabase.co` (project Nera, ap-southeast-1) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | JWT anon key dari Supabase → Project Settings → API |
| `ANTHROPIC_API_KEY` | optional | belum dipakai (in-app AI di-defer); set kalau later butuh |
| `AI_MODEL` | optional | default `claude-opus-4-7` di code, override kalau perlu downgrade ke `claude-sonnet-4-6` |

⚠️ **JANGAN trailing space** di value (lihat [troubleshooting.md §4](troubleshooting.md#4-magic-link-redirect_to-trailing-space)). Klik di akhir field untuk verify cursor di posisi terakhir character.

## Supabase Auth dashboard config

[Supabase Dashboard → Authentication](https://app.supabase.com/project/glbkdemanhkybwdlmjns/auth/providers):

### Sign In / Up Settings
- **Enable email signup**: ON
- **Confirm email**: **DISABLE** (signup langsung dapat session, tidak perlu email round-trip)
- **Secure email change**: default OK
- **Secure password change**: default OK

### URL Configuration
- **Site URL**: `https://nera-jeanne.vercel.app` (production domain)
- **Additional Redirect URLs**: Tidak strict-required karena auth flow tidak pakai email link (legacy /auth/callback masih ada untuk recovery future). Kalau mau aman:
  - `https://nera-jeanne.vercel.app/auth/callback`
  - `https://nera-*-wtd-stephs-projects.vercel.app/auth/callback` (preview wildcard)
  - `http://localhost:3000/auth/callback`

### Email Templates
Default OK. Tidak dipakai di happy path karena no magic link / no email confirmation. Kalau later butuh:
- Magic Link template (untuk recovery)
- Reset Password template

## Vercel config

[Vercel Dashboard → Project nera](https://vercel.com/wtd-stephs-projects/nera):

### Production Domain
- **nera-jeanne.vercel.app** (default Vercel subdomain, free)
- Custom domain: defer kalau butuh

### Build & Development Settings
- **Framework**: Next.js (auto-detected)
- **Build Command**: `npm run build` (default)
- **Install Command**: `npm install` (default)
- **Root Directory**: `./` (default)
- **Node version**: 24.x (auto via package.json `engines.node >=20`)

### Git Integration
- **Production Branch**: `main`
- **Deploy Hooks**: tidak dipakai
- **Ignored Build Step**: default (build setiap push)

## Deploy procedure

Auto-deploy dari Git:
1. Merge PR ke `main` → Vercel auto-detect → build → promote ke production (~2-3 menit)
2. Branch lain (feature/*, update/*, fix/*) → preview deployment otomatis per push

Manual redeploy (kalau butuh fresh env apply):
1. Vercel Dashboard → Deployments → latest production
2. Menu (⋮) → Redeploy
3. Uncheck "Use existing build cache" untuk fresh env vars
4. Redeploy

Rollback:
1. Vercel Dashboard → Deployments
2. Pilih deployment lama yang green
3. Menu (⋮) → "Promote to Production"
4. Production switch instant (Cloudflare cache flush)

## Database migrations

Migrations live in `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`. Pakai timestamp prefix untuk ordering.

### Apply ke dev project
Via Supabase MCP `apply_migration` — auto-tracked di `_migrations` table:
```
apply_migration(project_id="glbkdemanhkybwdlmjns", name="<name>", query="<sql>")
```

### Apply ke production project (kalau split prod)
Currently dev project = production project. Future kalau split:
1. Buat project Supabase baru untuk production
2. Update Vercel env vars (`NEXT_PUBLIC_SUPABASE_URL`, anon key)
3. Apply semua migrations dari `supabase/migrations/` via MCP atau Supabase CLI
4. Set Auth dashboard config (per atas)
5. Redeploy

### Drop / rollback migrations
Tidak ada rollback automatic. Kalau perlu undo:
1. Tulis SQL DROP di migration file baru (`<timestamp>_drop_<feature>.sql`)
2. Apply via MCP
3. App code adjustment

## Realtime publication

Tabel yang di-publish ke `supabase_realtime`:
- `public.logs`
- `public.growth_measurements`
- `public.milestone_progress`
- `public.immunization_progress`

Tabel yang TIDAK di-realtime (rare changes, OK polling-only):
- `public.babies`
- `public.households`, `public.household_members`, `public.household_invitations`

Tambah table ke realtime:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.<new_table>;
```

Cek list:
```sql
SELECT pubname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

## Backup

Supabase auto-backup (daily, 7-day retention di Pro plan). Bisa download dari dashboard → Database → Backups.

Untuk export user-side (data Anda): `/report` page → Download CSV. Atau langsung query via Supabase SQL Editor.

## Monitoring

### Vercel
- Logs: Project → Deployments → click deployment → Logs tab (limited to ~24h)
- Analytics: Project → Analytics (visitor + perf metrics, basic free tier)

### Supabase
- Postgres logs: Project → Logs → Postgres
- Auth logs: Project → Logs → Auth
- API logs (PostgREST): Project → Logs → API
- Database performance: Project → Reports

### Setiap aksi via MCP
Saat development pakai MCP:
- `mcp__vercel__getDeploymentEvents` — build/runtime events
- `mcp__supabase__get_logs service=postgres|auth|api` — backend logs
- `mcp__supabase__get_advisors type=security|performance` — recommendations

## User management

### Reset password user
Belum ada flow di app. Manual:
1. Supabase Dashboard → Authentication → Users
2. Cari user → click → "Reset password"
3. Kirim link manual ke user via email/WA

### Hapus user lama
- Authentication → Users → cari → Delete
- Cascade delete: `auth.users` ON DELETE CASCADE ke `household_members`, `babies.created_by` jadi NULL, dst

### Promote user ke owner
Kalau Anda undang istri sebagai member tapi mau jadikan co-owner:
```sql
UPDATE public.household_members
SET role = 'owner'
WHERE household_id = '<household-uuid>'
  AND user_id = '<user-uuid>';
```
Run via Supabase MCP execute_sql atau dashboard SQL editor.

## Cost monitoring

### Supabase Pro plan
- $25/month base
- Includes: 8GB database, 100GB bandwidth, 250GB file storage, 100K MAU
- Realtime: 200 concurrent peak, 2M messages/month
- Saat ini Nera usage <<1% quota

### Vercel
- Hobby plan: free, 100GB bandwidth, 100k function invocations
- Saat ini Nera usage minimal (Anda + istri = 2 user)

### Anthropic API (kalau enable in-app AI later)
- Opus 4.7: ~$15/M input tokens, $75/M output
- Estimasi 5-10 prompts/hari × ~2K tokens average ≈ $0.30/bulan
- Defer; currently pakai prompt-paste eksternal di /report

## Disaster recovery

### Supabase project rusak / dihapus
1. Buat project baru
2. Update Vercel env vars
3. Apply migrations via MCP
4. Restore data dari Supabase backup (paid feature) atau dari CSV export user
5. Redeploy

### Vercel project rusak
1. Re-import dari `WTD-Steph/Nera` GitHub
2. Set env vars
3. Auto-deploy

### Lost local repo
- Clone `git clone https://github.com/WTD-Steph/Nera.git`
- `npm install`
- Copy `.env.local.example` → `.env.local`, fill from Vercel env

## Emergency contacts

- Stephanus: stephanus@wethedaily.com
- Supabase support: [supabase.com/support](https://supabase.com/dashboard/support/new) (Pro plan tier)
- Vercel support: [vercel.com/help](https://vercel.com/help) (Hobby tier = community)
