# Nera — Baby Tracker, Project Brief

> Phase 1 deliverable. Belum ada code production yang ditulis. Dokumen ini
> wajib di-approve sebelum lanjut Phase 2 (PR #1 scaffold).
>
> **Status:** Draft v1 — disusun 2026-04-30 setelah review prototype artifact
> dan brief Anda. Source artifact ada di [_reference/baby-tracker-artifact.tsx](_reference/baby-tracker-artifact.tsx)
> (paste-nya ter-truncate menjelang akhir; tidak menghalangi Phase 1, akan
> di-refine PR-by-PR jika ada gap).
>
> **Convention:** Brief Anda diadopsi sebagai default. Bagian di mana saya
> menyimpang atau memperhalus diberi label **[REFINEMENT]** dengan reasoning.
> Pertanyaan yang masih perlu jawaban Anda dikumpulkan di §11.

---

## 1. Ringkasan

Migrasi prototype baby tracker dari single-file React artifact ke production
stack Next.js 14 + Supabase + Vercel + GitHub. Multi-user dengan model
**household** (Anda + istri akses bayi yang sama). Magic-link auth, RLS-enforced
data isolation, realtime sync, AI analysis via server-side Anthropic API.
Mobile-first PWA, Bahasa Indonesia.

Target durasi pakai: 12 bulan tracking bayi pertama. Scope feature parity
dengan prototype, tapi struktur data & flow direset untuk multi-user safety.

---

## 2. Tech Stack (Confirmed)

| Layer          | Pilihan                                                       |
|----------------|---------------------------------------------------------------|
| Framework      | Next.js 14 (App Router), TypeScript strict, Tailwind CSS      |
| DB             | Supabase Postgres dengan RLS                                  |
| Auth           | Supabase Auth — email magic link                              |
| Hosting        | Vercel (auto-deploy `main` → production, branch lain → preview) |
| Charts         | Recharts                                                      |
| Icons          | lucide-react                                                  |
| AI             | Anthropic API via Next.js API route (server-only key)         |
| State          | React state + Supabase realtime (no Redux/Zustand)            |
| PWA            | `next-pwa` + manifest + custom service worker                 |
| Test           | Vitest (unit) + Playwright (e2e golden path)                  |
| Lint/Format    | ESLint (next/core-web-vitals) + Prettier + TypeScript strict  |
| Repo           | GitHub `WTD-Steph/Nera`, branching `feature/`, `fix/`, `update/` |

**[REFINEMENT — minor]** Saya tambah `next-pwa` sebagai library default untuk
PWA daripada manual SW dari nol — battle-tested di Next.js 14 dan handle
Workbox config otomatis. Buka untuk diganti kalau Anda preferensi vanilla SW.

---

## 3. Struktur Folder

```
Nera/
├─ _reference/                       # artifact lama, dokumentasi spec
│  └─ baby-tracker-artifact.tsx
├─ docs/                             # detail rich (cross-ref dari CLAUDE.md)
│  ├─ schema.md                      # ERD + rationale
│  ├─ rls-policies.md                # RLS narrative + test cases
│  ├─ realtime-sync.md               # konflik handling, channel design
│  └─ ai-prompt.md                   # versioning prompt template
├─ app/
│  ├─ (auth)/                        # group route — public
│  │  ├─ login/page.tsx              # magic link request
│  │  ├─ verify/page.tsx             # post-magic-link callback
│  │  └─ invite/[token]/page.tsx     # accept household invitation
│  ├─ (onboarding)/                  # group route — auth required, no household
│  │  └─ setup/page.tsx              # create household + first baby
│  ├─ (app)/                         # group route — auth + household required
│  │  ├─ layout.tsx                  # bottom nav + header
│  │  ├─ page.tsx                    # Beranda (dashboard)
│  │  ├─ growth/page.tsx             # Tumbuh
│  │  ├─ milestone/page.tsx          # Milestone
│  │  ├─ history/page.tsx            # Riwayat
│  │  └─ more/                       # Lainnya
│  │     ├─ page.tsx
│  │     ├─ profile/page.tsx
│  │     ├─ household/page.tsx       # manage members + invitations
│  │     └─ imunisasi/page.tsx
│  ├─ api/
│  │  ├─ ai-analysis/route.ts        # POST — SSE stream Anthropic
│  │  ├─ invite/route.ts             # POST — create invite, send email
│  │  └─ export/route.ts             # GET — CSV (server-side gen)
│  ├─ layout.tsx                     # root, theme, font
│  └─ globals.css
├─ components/
│  ├─ shell/                         # ModalShell, BottomNav, Header
│  ├─ logs/                          # LogRow, LogModal (per-subtype forms)
│  ├─ growth/                        # ChartCard, GrowthForm, AIAnalysisModal
│  ├─ milestone/                     # MilestoneList
│  ├─ ui/                            # Field, NumberInput, SelectChips, Button
│  └─ icons.ts                       # lucide re-export + LOG_TYPES map
├─ lib/
│  ├─ supabase/                      # browser client, server client, middleware client
│  │  ├─ client.ts
│  │  ├─ server.ts
│  │  └─ middleware.ts
│  ├─ constants/
│  │  ├─ who-percentiles.ts          # WHO_W_BOY, WHO_W_GIRL, WHO_H_BOY, WHO_H_GIRL
│  │  ├─ milestones.ts               # MILESTONES_LIST
│  │  └─ imunisasi.ts                # IMUNISASI_LIST
│  ├─ compute/                       # PURE FN — easily unit-testable
│  │  ├─ age.ts                      # ageInMonths, formatAge, timeSince
│  │  ├─ today-stats.ts              # computeTodayStats
│  │  ├─ last-by-type.ts             # computeLastByType
│  │  └─ format.ts                   # fmtTime, fmtDate, fmtDuration
│  ├─ realtime/                      # subscription helpers
│  └─ ai/
│     └─ build-context.ts            # build prompt context dari supabase rows
├─ hooks/
│  ├─ use-baby.ts                    # active baby + household
│  ├─ use-logs.ts                    # logs + realtime + optimistic insert
│  ├─ use-growth.ts
│  ├─ use-milestones.ts
│  └─ use-imunisasi.ts
├─ types/
│  ├─ supabase.ts                    # generated dari `supabase gen types`
│  └─ domain.ts                      # alias yang lebih ergonomis
├─ supabase/
│  ├─ migrations/                    # version-controlled SQL
│  │  └─ 2026XXXXXX_initial.sql
│  └─ seed.sql                       # opsional, dev data
├─ public/
│  ├─ manifest.json
│  ├─ icons/                         # PWA icons
│  └─ sw.js                          # generated by next-pwa
├─ tests/
│  ├─ unit/                          # vitest
│  └─ e2e/                           # playwright
├─ .env.local.example
├─ CLAUDE.md                         # bullet pointers ≤600 char each
├─ PROJECT_BRIEF.md                  # this file
├─ README.md
├─ next.config.js
├─ tailwind.config.ts
├─ tsconfig.json
├─ package.json
└─ playwright.config.ts
```

---

## 4. Database Schema — Final

Schema mengikuti proposal Anda dengan tiga refinement. Semua DDL di bawah ini
adalah versi yang akan saya migrasi di PR #2–#6.

### 4.1 Auth & Household

```sql
CREATE TABLE households (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE household_members (
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);
CREATE INDEX household_members_user_idx ON household_members(user_id);

CREATE TABLE household_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  invited_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  token        text UNIQUE NOT NULL,
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX household_invitations_email_idx ON household_invitations(invited_email)
  WHERE accepted_at IS NULL;
```

### 4.2 Babies

```sql
CREATE TABLE babies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name            text NOT NULL,
  gender          text NOT NULL CHECK (gender IN ('female','male')),
  dob             date NOT NULL,
  birth_weight_kg numeric(4,2) NOT NULL CHECK (birth_weight_kg > 0),
  birth_height_cm numeric(4,1) NOT NULL CHECK (birth_height_cm > 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX babies_household_idx ON babies(household_id);
```

### 4.3 Logs

**[REFINEMENT — single table dengan partial CHECK]** Saya pertahankan one-table
design (sederhana, mudah query lintas subtype, single realtime channel), tapi
saya tambah partial CHECK constraint per subtype agar buggy insert tertangkap
di DB. Reasoning: tanpa CHECK, bug di client bisa simpan log `sufor` tanpa
`amount_ml` dan baru terdeteksi saat render. Trade-off: schema sedikit lebih
panjang, tapi worth it.

Pertimbangan alternatif yang saya tolak:
- Tabel terpisah per subtype (8 tabel) → query history lintas-tipe jadi UNION 8x, realtime channel ribet, low ROI.
- Single `payload jsonb` column → kehilangan typed indexing, butuh JSON path query, harder to evolve.

```sql
CREATE TABLE logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id         uuid NOT NULL REFERENCES babies(id) ON DELETE CASCADE,
  subtype         text NOT NULL CHECK (subtype IN (
                    'sufor','dbf','pumping','pipis','poop',
                    'sleep','bath','temp','med'
                  )),
  timestamp       timestamptz NOT NULL,
  end_timestamp   timestamptz,
  amount_ml       numeric(6,1),
  amount_l_ml     numeric(6,1),
  amount_r_ml     numeric(6,1),
  duration_l_min  int,
  duration_r_min  int,
  poop_color      text,
  poop_consistency text,
  temp_celsius    numeric(4,2),
  med_name        text,
  med_dose        text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Partial CHECK: validasi field per subtype
  CONSTRAINT logs_sufor_chk   CHECK (subtype <> 'sufor'   OR amount_ml IS NOT NULL),
  CONSTRAINT logs_dbf_chk     CHECK (subtype <> 'dbf'     OR (duration_l_min IS NOT NULL OR duration_r_min IS NOT NULL)),
  CONSTRAINT logs_pumping_chk CHECK (subtype <> 'pumping' OR (amount_l_ml IS NOT NULL OR amount_r_ml IS NOT NULL)),
  CONSTRAINT logs_temp_chk    CHECK (subtype <> 'temp'    OR temp_celsius IS NOT NULL),
  CONSTRAINT logs_med_chk     CHECK (subtype <> 'med'     OR med_name IS NOT NULL),
  CONSTRAINT logs_sleep_end_chk CHECK (end_timestamp IS NULL OR end_timestamp >= timestamp)
);
CREATE INDEX logs_baby_ts_idx         ON logs(baby_id, timestamp DESC);
CREATE INDEX logs_baby_subtype_ts_idx ON logs(baby_id, subtype, timestamp DESC);
```

### 4.4 Growth Measurements

**[REFINEMENT — terpisah dari logs]** Anda sudah memutuskan ini di brief.
Saya konfirmasi: growth lebih natural sebagai measurement series (chart-first,
WHO percentile join, sparse cadence — sebulan sekali, bukan harian seperti
logs). Birth measurement TIDAK disimpan di tabel ini — di-derive dari
`babies.birth_weight_kg` / `birth_height_cm` saat render chart.

```sql
CREATE TABLE growth_measurements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baby_id       uuid NOT NULL REFERENCES babies(id) ON DELETE CASCADE,
  measured_at   timestamptz NOT NULL,
  weight_kg     numeric(4,2) NOT NULL CHECK (weight_kg > 0),
  height_cm     numeric(4,1) NOT NULL CHECK (height_cm > 0),
  head_circ_cm  numeric(4,1) CHECK (head_circ_cm IS NULL OR head_circ_cm > 0),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX growth_baby_ts_idx ON growth_measurements(baby_id, measured_at DESC);
```

### 4.5 Milestone & Immunization Progress

```sql
CREATE TABLE milestone_progress (
  baby_id       uuid NOT NULL REFERENCES babies(id) ON DELETE CASCADE,
  milestone_key text NOT NULL,
  achieved_at   timestamptz NOT NULL DEFAULT now(),
  noted_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (baby_id, milestone_key)
);

CREATE TABLE immunization_progress (
  baby_id     uuid NOT NULL REFERENCES babies(id) ON DELETE CASCADE,
  vaccine_key text NOT NULL,
  given_at    date NOT NULL,
  facility    text,
  notes       text,
  noted_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (baby_id, vaccine_key)
);
```

### 4.6 `updated_at` Trigger

**[REFINEMENT — added]** Semua tabel data (households, babies, logs,
growth_measurements) punya `updated_at`. Saya pasang trigger generik supaya
realtime sync bisa pakai LWW (last-write-wins) tanpa app code yang perlu
ingat update kolom.

```sql
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER set_updated_at_households
  BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- ... ulangi untuk babies, logs, growth_measurements
```

### 4.7 Helper Function untuk RLS

```sql
-- True kalau auth.uid() adalah member dari household yang own baby_id
CREATE OR REPLACE FUNCTION is_household_member_of_baby(b_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM babies b
    JOIN household_members hm ON hm.household_id = b.household_id
    WHERE b.id = b_id AND hm.user_id = auth.uid()
  );
$$;
```

---

## 5. RLS Policies

Semua tabel **enable RLS**. Detail policy ada di `docs/rls-policies.md` saat
PR #2 mendarat — di sini ringkasannya:

| Tabel                  | SELECT                                   | INSERT                              | UPDATE / DELETE                          |
|------------------------|------------------------------------------|-------------------------------------|------------------------------------------|
| `households`           | Member of that household                 | Authenticated user (auto-add as owner) | Owner only                          |
| `household_members`    | Member of same household                 | Owner of that household             | Owner only (untuk member lain); self-leave OK |
| `household_invitations`| Owner of household OR `invited_email = auth.email()` | Owner only             | Owner only (atau `accepted_at` self-set saat accept) |
| `babies`               | `is_household_member_of_baby(id)`        | Member of `household_id`            | Member                                   |
| `logs`                 | `is_household_member_of_baby(baby_id)`   | Member                              | Member                                   |
| `growth_measurements`  | `is_household_member_of_baby(baby_id)`   | Member                              | Member                                   |
| `milestone_progress`   | `is_household_member_of_baby(baby_id)`   | Member                              | Member                                   |
| `immunization_progress`| `is_household_member_of_baby(baby_id)`   | Member                              | Member                                   |

**[REFINEMENT — owner permission untuk delete data]** Anda menulis "Member
household bisa view/edit semua data household-nya, Owner bisa invite member
lain". Saya extend: member bisa CRUD log/growth/milestone/imunisasi (data
operasional), tapi **delete baby**, **delete household**, dan **manage
members/invites** owner-only. Reasoning: delete baby = catastrophic; lebih
baik konfirmasi tier owner. Mohon konfirmasi jika setuju.

Test cases (akan jadi Playwright e2e di PR #2):
1. User A buat household, invite B → B accept → B bisa SELECT/INSERT logs
2. User C tanpa invite → tidak bisa SELECT data household A
3. User A delete log → realtime delete di session B
4. User A leave household → tidak lagi bisa SELECT data household A
5. Member (non-owner) coba delete baby → policy denial

---

## 6. Auth & Onboarding Flow

```
┌─────────────────────┐
│ /login              │
│ (email magic link)  │
└──────────┬──────────┘
           │ user clicks link in email
           v
┌─────────────────────┐
│ /verify             │── creates auth.users row if new
│ (callback)          │
└──────────┬──────────┘
           │
           v
   ┌───────────────┐
   │ middleware:   │
   │ has session?  │── no  ──> /login
   │ has household?│
   └───────┬───────┘
           │
     ┌─────┴─────┐
     v           v
 has h/h?    no h/h?
     │           │
     │           v
     │     ┌─────────────────┐
     │     │ /setup          │
     │     │ - create h/h    │── insert households + household_members(owner)
     │     │ - create baby   │── insert babies
     │     └────────┬────────┘
     │              │
     v              v
   ┌──────────────────┐
   │ /(app)/...       │
   │ Beranda etc      │
   └──────────────────┘

INVITE FLOW:
/invite/[token] ──> if logged in ──> insert household_members + redirect /(app)
                ──> if not        ──> /login (with `?next=/invite/[token]`)
                                  ──> after magic link, resume invite
```

**Middleware (Next.js)**: cek session via Supabase server client. Protected
routes redirect ke `/login` kalau no session, ke `/setup` kalau session tapi
no household membership.

**Invite delivery**: PR #2 awal pakai server-side function yang generate
magic link via Supabase admin API + render template ke email user via
Supabase built-in SMTP. Tidak perlu third-party email service untuk v1.
Kalau Supabase free tier rate-limit hit, baru migrate ke Resend/SendGrid.

---

## 7. Component Tree (Highlights)

```
RootLayout
└─ AppLayout (shell + bottom nav + header)
   ├─ Beranda (/)
   │  ├─ Header (greeting + age + name)
   │  ├─ QuickLogGrid     [opens] LogModal
   │  ├─ SinceLastCards
   │  ├─ TodayStatsCard
   │  └─ RecentActivityList → LogRow [tap] LogModal(edit)
   │
   ├─ Growth (/growth)
   │  ├─ LatestMeasurementCard
   │  ├─ AskClaudeButton  [opens] AIAnalysisModal
   │  ├─ ChartCard (BB, WHO ref)
   │  ├─ ChartCard (PB, WHO ref)
   │  └─ MeasurementHistoryList
   │
   ├─ Milestone (/milestone)
   │  ├─ ProgressHeader
   │  └─ MilestoneGroup × 12   (highlight current month)
   │
   ├─ History (/history)
   │  ├─ FilterChips
   │  └─ DayGroup × N → LogRow → LogModal(edit)
   │
   └─ More (/more)
      ├─ SettingItem → /more/profile (ProfileForm)
      ├─ SettingItem → /more/household (MembersList + InviteForm)
      ├─ SettingItem → /more/imunisasi (ImunisasiChecklist)
      ├─ SettingItem → ExportCSVButton
      ├─ SettingItem → ResetDataButton (owner-only, double confirm)
      └─ LogoutButton

LogModal (kondisional rendering per subtype)
├─ shared: Field timestamp, Field notes
└─ subtype-specific:
   ├─ sufor:   amount_ml
   ├─ dbf:     duration_l_min, duration_r_min
   ├─ pumping: amount_l_ml, amount_r_ml
   ├─ pipis:   (none)
   ├─ poop:    poop_color (chips), poop_consistency (chips)
   ├─ sleep:   end_timestamp (optional)
   ├─ bath:    (none)
   ├─ temp:    temp_celsius
   └─ med:     med_name, med_dose

AIAnalysisModal
├─ Preset prompts (4 buttons)
├─ Custom textarea
├─ Streaming response area (markdown render)
└─ Disclaimer footer
```

---

## 8. API Routes

Hanya tiga endpoint server-side. Semua CRUD lain via Supabase client + RLS.

### `POST /api/ai-analysis`

- **Body**: `{ promptType: 'preset:growth' | 'preset:feeding-sleep' | 'preset:diaper' | 'preset:age-tips' | 'custom', customPrompt?: string, babyId: string }`
- **Auth**: middleware-enforced session; baby_id RLS check via server client
- **Process**:
  1. Server fetch baby + 7-day log summary + growth history (server Supabase client honoring RLS)
  2. Build prompt context (`lib/ai/build-context.ts`)
  3. Call Anthropic API dengan `claude-sonnet-4-6` (atau model terbaru saat implement) with `stream: true`
  4. Pipe SSE chunks ke client via `text/event-stream`
- **Env**: `ANTHROPIC_API_KEY` (Vercel env var, server-only)
- **Rate limit**: simple in-memory token bucket per user (3 req/menit) untuk v1; Upstash kalau perlu lebih kuat

### `POST /api/invite`

- **Body**: `{ email: string }`
- **Auth**: must be owner of `household_id` (derived from session)
- **Process**: generate cryptographic token, insert `household_invitations`, dispatch email via Supabase admin auth (sebagai magic link variant) atau template email manual
- **Response**: `{ inviteUrl: string }`

### `GET /api/export`

- **Query**: `?babyId=...`
- **Auth**: RLS via server client
- **Response**: `text/csv` dengan format yang sama dengan prototype (profile + logs + milestones + imunisasi). UTF-8 BOM untuk Excel ID-friendly.

**[REFINEMENT — server CSV]** Prototype generate CSV di client. Saya pindah
ke server karena: (a) data dapat tumbuh besar (12 bulan × ~20 log/hari ≈ 7K
rows), (b) butuh server Supabase client untuk RLS-honored query yang lengkap.
Kalau Anda preferensi tetap client (no roundtrip), bisa kita revert.

---

## 9. AI Analysis — Detail

**Prompt template versi 1** (file: `docs/ai-prompt.md`, code: `lib/ai/prompt.ts`):

```
SYSTEM:
Anda adalah asisten parenting yang membantu orangtua memahami data tumbuh
kembang bayi. Berikan analisis yang berimbang, berbasis fakta, dan ramah
dalam Bahasa Indonesia. Sebutkan jika data terbatas. Selalu tegaskan bahwa
konsultasi dokter anak diperlukan untuk evaluasi medis. Hindari membuat
diagnosis. Jawaban maksimal 300 kata, gunakan paragraf pendek dan bullet
jika perlu.

USER:
DATA BAYI:
- Nama: {name}
- Jenis Kelamin: {gender}
- Tanggal Lahir: {dob}
- Usia Saat Ini: {ageMonths} bulan

RIWAYAT PERTUMBUHAN:
{growthLines}

RINGKASAN 7 HARI TERAKHIR:
{summaryLines}

PERTANYAAN ORANGTUA:
{userPrompt}
```

**Preset prompts** (Bahasa Indonesia, sama dengan prototype):
1. "Bagaimana pertumbuhan {nama} dibandingkan referensi WHO?"
2. "Apakah pola makan dan tidur 7 hari terakhir terlihat sehat?"
3. "Apakah pola pipis dan poop dalam batas normal untuk usia ini?"
4. "Saran umum untuk usia {ageMonths} bulan?"

**Streaming**: server route emit `data: <chunk>\n\n` SSE; client `EventSource`
parse, append ke state. Final event `data: [DONE]`.

**Cost guardrail**: `max_tokens: 1000`, no images/tools, prompt context
dipotong ke 7-day window (bukan all-time).

**Caching (future)**: prompt caching Anthropic potensial saat user run multi
prompt back-to-back; brief tidak include caching di v1 karena prompt context
berubah setiap kali (ada timestamp). Bisa di-add di PR follow-up kalau bill
tinggi.

---

## 10. Migration Plan — Artifact → Production

| Artifact concept                          | Production target                                                  |
|-------------------------------------------|--------------------------------------------------------------------|
| `window.storage[STORAGE_KEY]`             | Supabase tables, RLS-protected, realtime                            |
| `data.profile`                            | `babies` row (1 per baby) + `households` row (parent group)        |
| `data.logs[]` (subtype `growth`)          | **Split**: 8 ops subtypes → `logs`; `growth` → `growth_measurements` |
| `data.milestones{}` map                   | `milestone_progress` rows (PK: baby_id+milestone_key)              |
| `data.immunizations{}` map                | `immunization_progress` rows                                        |
| Field naming (`warna`, `value`, `name`)   | Renamed to `poop_color`, `temp_celsius`, `med_name` (English schema, Indonesian UI) |
| Constants (WHO, IMUNISASI_LIST, MILESTONES_LIST) | Tetap di `lib/constants/` — tidak di DB                     |
| Compute helpers (today stats, age, etc.)  | `lib/compute/*.ts`, pure functions, unit tested                    |
| Client-side AI call                       | Server route `/api/ai-analysis` dengan key di env var              |
| Client-side CSV export                    | Server route `/api/export`                                         |
| Single-user state                         | Multi-user via household + RLS + realtime                          |
| Persistence: `useEffect` write to storage | Optimistic insert + Supabase mutation + realtime reconciliation    |
| First-run: empty profile prompt           | Onboarding flow `/setup`                                           |
| Tabs (state-based)                        | Next.js routes `/`, `/growth`, `/milestone`, `/history`, `/more`   |

**Visual fidelity**: rose/pink palette + gradient ungu-rose AI button +
bottom-sheet modals + bottom nav 5-tab → port apa adanya. Tailwind classes
copy paste dari artifact, tidak perlu redesign.

**Bug yang saya temukan di prototype** (akan saya fix di production, tidak
diport apa adanya):
1. `LogRow` tidak handle subtype `pipis`/`bath` di `detail` builder — fine,
   karena field `detail` opsional. Tapi UI bisa lebih ramah dengan label
   "—" ketimbang string kosong. **Status**: minor, fix di PR #4.
2. `formatAge` precision drift di edge case (>12 bulan: tampil "1.0 tahun"
   sampai 1.083 tahun). **Status**: keep behavior, sufficient for v1.
3. `computeTodayStats` pakai `+l.amount || 0` yang gagal kalau `amount = 0`
   string vs number, tapi `+'0' || 0` → 0 jadi safe. **Status**: no fix.
4. AI fetch tanpa abort/timeout. **Status**: fix di PR #7 — add `AbortController`
   on unmount + 60s timeout.

---

## 11. Workflow Decisions — Jawaban 6 Pertanyaan Anda

### Q1: Ada keputusan teknis di atas yang Anda usulkan ubah?

Empat refinement saya (sudah di-flag di body brief):

1. **Server-side CSV export** (§8) — daripada client-side, untuk handling data
   yang tumbuh + RLS-honored fetch.
2. **Partial CHECK constraints di `logs`** (§4.3) — catch buggy insert at DB
   level, bukan baru ketahuan saat render.
3. **`updated_at` + trigger di semua tabel** (§4.6) — enabler untuk LWW
   conflict resolution di realtime sync.
4. **Owner-only delete pada baby/household + manage members** (§5) — guard
   destructive ops.

Tidak ada penolakan terhadap stack/auth/realtime decisions Anda.

### Q2: Strategi handle konflik concurrent edit (Anda & istri input log bersamaan)?

**Default: Last-Write-Wins (LWW)** dengan `updated_at` timestamp.

Kasus per kasus:
- **INSERT log baru bersamaan** (Anda log sufor, istri log pipis di waktu
  hampir sama): No conflict. Dua row terpisah. Realtime broadcast keduanya
  ke kedua client. **Done.**
- **UPDATE row yang sama bersamaan** (Anda dan istri sama-sama edit log
  sufor yang sama): Last write wins. Tidak ada warning konflik di v1
  (kemungkinan kejadian sangat rendah, tidak worth UX cost).
- **DELETE bersamaan**: idempotent — kedua delete sukses, tinggal log hilang.
- **Optimistic insert race**: client generate UUID v4 lokal, insert ke
  Supabase. Realtime echo di-skip kalau UUID sudah ada di local state
  (deduplication).

**Kalau di future ada keluhan ("istri saya edit, tapi tertimpa")**, baru
upgrade ke optimistic locking via `updated_at` precondition (`UPDATE ...
WHERE updated_at = $expected`).

Detail di `docs/realtime-sync.md` (PR #10).

### Q3: Schema design — normalisasi/denormalisasi yang diusulkan?

Schema seperti yang saya tulis di §4 sudah hasil keputusan trade-off:

- **Normalisasi**: household → baby → log/growth (3 level). Ini wajib untuk
  RLS dan tidak bisa di-flatten.
- **Denormalisasi yang ditolak**: caching `today_stats` ke `babies` row
  (premature; client compute murah dari index).
- **Denormalisasi yang ditolak**: materialized view untuk `last_by_type`
  (overkill; query `ORDER BY ts DESC LIMIT 1` index-backed sudah cukup).
- **Constants di code, bukan DB** (WHO percentile, milestones, imunisasi):
  setuju dengan brief Anda. Tidak butuh CRUD, version-controlled lebih baik
  di code.

Tidak ada perubahan schema lain yang saya usulkan.

### Q4: Test strategy — unit, e2e (Playwright), atau visual regression?

**v1 plan:**
- **Vitest unit tests** untuk `lib/compute/*.ts` (helpers murni — easiest win,
  prevent regression di today stats / age calc / chart data prep).
- **Playwright e2e** untuk 3 golden paths:
  1. Sign up → create household → create baby → log sufor → see in dashboard
  2. Sign in → invite member → second user accept → see same data
  3. Add growth measurement → see in chart
- **No visual regression** untuk v1. Mobile UI iterate cepat, snapshot tests
  jadi noise.
- **No component-level tests** kecuali komponen punya logic non-trivial
  (LogModal mungkin, kalau form validation rumit).

CI: GitHub Actions run `vitest` + `playwright` di tiap PR. Vercel preview
URL dipakai sebagai Playwright base URL kalau testing against deployed
preview, atau local dev server kalau di CI.

### Q5: Error handling & monitoring — Sentry? Supabase logs? Vercel observability?

**v1 plan: pakai built-in saja, no Sentry**.

- **Vercel Functions logs** untuk API route errors (`/api/ai-analysis`,
  `/api/invite`, `/api/export`). Sufficient untuk debug bug occasional.
- **Supabase logs + advisor** untuk DB issues (slow query, missing index,
  RLS misconfiguration via `mcp__supabase__get_advisors`).
- **Client-side error boundary**: React Error Boundary di root, tampil
  fallback UI + log ke `/api/log-error` (server route, console.error,
  picked up by Vercel).
- **No PII leak**: pastikan log tidak include nama bayi / email user.

**Trigger untuk add Sentry**: kalau setelah 1 bulan production ada >3
incident yang root cause-nya susah ditracing dari Vercel logs alone, baru
add Sentry (free tier cukup).

### Q6: Deployment strategy — preview branch per PR, atau staging branch?

**Preview per PR, no staging branch**.

- `main` → production (auto-deploy Vercel).
- Branch lain → preview deployment Vercel (URL `nera-<hash>.vercel.app`).
- Tiap PR otomatis dapat preview URL, di-comment ke PR oleh Vercel bot.
- Smoke test manual di preview URL sebelum merge.
- Tidak ada `staging` branch — preview-per-PR sudah kasih isolation
  yang sama dengan less overhead.

**Catatan Supabase env**: 
- Dev: pakai shared dev project (`*-dev.supabase.co`), seed data lokal.
- Production: project terpisah. Migrations applied via MCP `apply_migration`
  ke production hanya setelah verified di dev.
- **Branching Supabase** (Supabase native feature) saya skip untuk v1
  — overhead tinggi untuk solo dev.

---

## 12. PR Sequence — Confirmed

Saya konfirmasi sequence Anda. Tambahan: tiap PR akan punya verification
checklist + commit message format konsisten.

| #   | Branch                         | Scope                                                                  | Verification                                  |
|-----|--------------------------------|------------------------------------------------------------------------|-----------------------------------------------|
| 1   | `feature/scaffold`             | Next.js init, Tailwind, Supabase client stubs, env, Vercel deploy, README | `next build` pass, deploy berhasil, env stub |
| 2   | `feature/auth-household`       | Migrations households + invitations + RLS, magic link flow, `/setup`, `/invite/[token]`, member mgmt | Test: signup/login, invite-accept, RLS denial |
| 3   | `feature/baby-profile`         | Migrations babies, onboarding baby creation, profile edit              | Test: create baby, edit, RLS                  |
| 4   | `feature/logs`                 | Migrations logs, LogModal per subtype, dashboard quick log, today stats, since-last cards, recent activity, history view + filter | Test: insert all 9 subtypes, filter accuracy  |
| 5   | `feature/growth`               | Migrations growth, ChartCard with WHO ref (girl & boy), measurement form, history list | Visual check chart, percentile alignment      |
| 6   | `feature/milestone-imunisasi`  | Migrations milestone + imunisasi progress, checklist views             | Toggle checks persisted, current-month highlight |
| 7   | `feature/ai-analysis`          | API route `/api/ai-analysis` (SSE), `lib/ai/build-context`, AIAnalysisModal | Test: 4 preset prompts, custom prompt, abort  |
| 8   | `feature/csv-export`           | API route `/api/export`, button di More                                | Download CSV, validasi format                 |
| 9   | `feature/pwa`                  | manifest, service worker via next-pwa, install prompt, offline read    | Lighthouse PWA audit ≥90, mobile install      |
| 10  | `feature/realtime`             | Realtime subscription per baby, optimistic insert, dedup, reconcile    | Two-tab test: insert one, see in other        |

**Setiap PR deliverable report**: state migration applied/committed/pushed,
branch + remote, verification output, screenshot kalau UI.

---

## 13. Open Questions untuk Anda

Mohon konfirmasi/jawab sebelum saya kick off PR #1:

1. **Project path lokal**: saya pakai `C:\Users\steph\Nera` (mencocokkan
   pola `C:\Users\steph\ERP-2.0`). OK atau Anda preferensi lain?

2. **Owner-only destructive ops** (§5 footnote): saya restrict delete baby,
   delete household, dan manage members ke owner. Member biasa tetap bisa
   CRUD logs/growth/milestone/imunisasi. Setuju?

3. **Server-side CSV export** (§8): saya pindah dari client ke server. Setuju
   atau revert ke client-only?

4. **Supabase project**: punya 1 project untuk dev + 1 untuk prod, atau pakai
   1 project saja untuk hemat? Kalau 1 saja, brief saya akan ganti — pakai
   `WHERE` filter di policy untuk env separation, tidak ideal tapi cukup.
   **Default saya: 2 projects.**

5. **Email delivery untuk magic link & invite**: Supabase built-in SMTP
   (free tier, low rate limit) cukup untuk start, atau langsung integrate
   Resend dari awal? **Default saya: Supabase built-in untuk v1.**

6. **AI model**: saya tulis Sonnet 4.6 sebagai default (latest at brief
   time). Anda mau tetap Sonnet, atau coba Opus 4.7 untuk analisis lebih
   detail dengan biaya lebih tinggi? **Default saya: Sonnet 4.6.**

7. **Reset Data button**: prototype punya tombol "Hapus semua catatan
   (profil tetap)". Untuk multi-user, ini destructive untuk istri Anda
   juga. **Saran saya: hilangkan tombol ini di v1, ganti dengan per-row
   delete saja.** Setuju?

8. **Onboarding deep-link untuk istri**: saat istri pertama login (lewat
   invite), apa landing page-nya — Beranda dengan baby yang sudah ada,
   atau ada welcome screen "Selamat datang ke household X"? **Default
   saya: redirect langsung ke Beranda.**

9. **Bayi ke-2 di future**: brief Anda bilang "siapkan untuk anak ke-2
   nanti, tapi UI v1 cukup single-baby". Schema sudah support multi-baby
   per household. **UI v1 akan: pilih baby pertama otomatis, no baby
   switcher di nav.** Setuju?

10. **Artifact paste truncated**: saya berhasil ekstrak 95% dari paste
    Anda — yang hilang hanya AIAnalysisModal render UI + LogModal form +
    main App component routing. Brief saya cover semua itu via spec.
    Apakah Anda mau paste ulang ekor file untuk lengkapnya disimpan di
    `_reference/`? Tidak blocking — saya bisa lanjut tanpa.

---

## 14. Risiko & Mitigasi

| Risiko                                         | Mitigasi                                                  |
|-----------------------------------------------|-----------------------------------------------------------|
| RLS misconfiguration → data leak antar household | Test e2e di PR #2 dengan 2 user fixture; `mcp__supabase__get_advisors` per migration |
| Realtime spam saat banyak insert              | Debounce listener; channel filtered ke baby_id, bukan global |
| Anthropic API rate limit / outage             | Graceful fallback "AI sedang sibuk, coba lagi"; rate limit per user di server |
| PWA cache stale setelah deploy                | Service worker `cleanupOutdatedCaches: true`; version bump |
| Magic link email landing di spam              | DKIM/SPF Supabase default; siapkan FAQ "Cek folder spam"  |
| Data loss saat backend bug                    | Supabase Point-in-Time Recovery (paid tier) — evaluate kalau >100 logs/baby |
| `birth_*` di babies row tidak update kalau user salah input | Edit profile UI di /more/profile bisa edit semua field termasuk birth_* |

---

## 15. Setelah Brief Approved

Begitu Anda approve dokumen ini (atau request revisi), saya kick off PR #1
`feature/scaffold`. Ekspektasi: scaffold selesai dalam 1 sesi kerja dengan
deliverable Vercel preview URL + basic Supabase client setup + smoke test
landing page.

— ditulis oleh Claude (Opus 4.7), 2026-04-30, untuk Stephanus.
