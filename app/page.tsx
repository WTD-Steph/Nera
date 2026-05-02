import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentHousehold } from "@/lib/household/current";
import { getCurrentBaby } from "@/lib/household/baby";
import { LogModalTrigger, type LogSubtype } from "@/components/LogModal";
import { LogsRealtime } from "@/components/LogsRealtime";
import { SubmitButton } from "@/components/SubmitButton";
import { OngoingCard } from "@/components/OngoingCard";
import { StartOngoingButton } from "@/components/StartOngoingButtons";
import { deleteLogAction } from "@/app/actions/logs";
import {
  computeTodayStats,
  computeLastByType,
  type LogRow,
} from "@/lib/compute/stats";
import {
  fmtDuration,
  fmtSleepRange,
  fmtTime,
  timeSince,
} from "@/lib/compute/format";

type SearchParams = {
  welcome?: string;
  logsaved?: string;
  logdeleted?: string;
  logerror?: string;
  ongoingstarted?: string;
};

function formatAge(dob: string): string {
  const days = Math.floor((Date.now() - new Date(dob).getTime()) / 86400000);
  if (days < 0) return "belum lahir";
  if (days === 0) return "baru lahir";
  if (days < 7) return `${days} hari`;
  if (days < 60) {
    const wk = Math.floor(days / 7);
    const rem = days % 7;
    return rem ? `${wk} mgu ${rem} hr` : `${wk} minggu`;
  }
  const months = days / 30.44;
  if (months < 12) return `${months.toFixed(1)} bulan`;
  return `${(months / 12).toFixed(1)} tahun`;
}

const QUICK_PRIMARY: { subtype: LogSubtype; label: string; emoji: string }[] = [
  { subtype: "feeding", label: "Feeding", emoji: "🍼" },
  { subtype: "pumping", label: "Pumping", emoji: "💧" },
  { subtype: "diaper", label: "Diaper", emoji: "🧷" },
  { subtype: "sleep", label: "Tidur", emoji: "🌙" },
];
const QUICK_SECONDARY: { subtype: LogSubtype; label: string; emoji: string }[] = [
  { subtype: "bath", label: "Mandi", emoji: "🛁" },
  { subtype: "temp", label: "Suhu", emoji: "🌡️" },
  { subtype: "med", label: "Obat", emoji: "💊" },
];

const SUBTYPE_LABEL: Record<string, string> = {
  feeding: "Feeding",
  pumping: "Pumping",
  diaper: "Diaper",
  sleep: "Tidur",
  bath: "Mandi",
  temp: "Suhu",
  med: "Obat",
};

function logDetail(l: LogRow): string {
  if (l.subtype === "feeding") {
    if (l.amount_ml != null) return `🍼 ${l.amount_ml} ml`;
    const lMin = l.duration_l_min ?? 0;
    const rMin = l.duration_r_min ?? 0;
    return `🤱 L ${lMin}m / R ${rMin}m`;
  }
  if (l.subtype === "pumping")
    return `L ${l.amount_l_ml ?? 0} / R ${l.amount_r_ml ?? 0} ml`;
  if (l.subtype === "diaper") {
    const parts: string[] = [];
    if (l.has_pee) parts.push("💛");
    if (l.has_poop) {
      const p = [l.poop_color, l.poop_consistency].filter(Boolean).join(" ");
      parts.push(p ? `💩 ${p}` : "💩");
    }
    return parts.join(" + ");
  }
  if (l.subtype === "sleep") {
    return fmtSleepRange(l.timestamp, l.end_timestamp);
  }
  if (l.subtype === "temp") return `${l.temp_celsius}°C`;
  if (l.subtype === "med")
    return [l.med_name, l.med_dose].filter(Boolean).join(" ");
  return "";
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const household = await getCurrentHousehold();
  if (!household) redirect("/setup");

  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup/baby");

  const supabase = createClient();

  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const { data: logs } = await supabase
    .from("logs")
    .select(
      "id, subtype, timestamp, end_timestamp, amount_ml, amount_l_ml, amount_r_ml, duration_l_min, duration_r_min, has_pee, has_poop, poop_color, poop_consistency, temp_celsius, med_name, med_dose, notes",
    )
    .eq("baby_id", baby.id)
    .gte("timestamp", since)
    .order("timestamp", { ascending: false });

  const logsArray: LogRow[] = (logs ?? []) as LogRow[];
  const ongoing = logsArray.filter(
    (l) =>
      l.end_timestamp === null &&
      (l.subtype === "sleep" || l.subtype === "pumping"),
  );
  const ongoingSubtypes = new Set(ongoing.map((l) => l.subtype));
  const stats = computeTodayStats(logsArray);
  const last = computeLastByType(logsArray);
  const recent = logsArray.slice(0, 6);

  const welcome = searchParams.welcome;
  const welcomeMsg =
    welcome === "baby"
      ? `Profil ${baby.name} tersimpan.`
      : welcome === "joined"
        ? `Selamat datang ke keluarga ${household.household_name}!`
        : null;

  const logsaved = searchParams.logsaved;
  const logdeleted = searchParams.logdeleted;
  const logerror = searchParams.logerror;

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6 md:max-w-2xl lg:max-w-3xl">
      <LogsRealtime babyId={baby.id} />
      <header className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-pink-400 text-2xl shadow-sm">
          <span aria-hidden>👶</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-bold text-gray-900">{baby.name}</div>
          <div className="text-xs text-gray-500">
            {formatAge(baby.dob)} ·{" "}
            {baby.gender === "female" ? "Perempuan" : "Laki-laki"} ·{" "}
            {household.household_name}
          </div>
        </div>
        <Link
          href="/more/profile"
          className="text-xs text-rose-600 hover:underline"
        >
          Edit
        </Link>
      </header>

      {welcomeMsg ? (
        <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-800">
          {welcomeMsg}
        </div>
      ) : null}
      {logsaved ? (
        <div className="mt-3 rounded-2xl border border-green-100 bg-green-50 p-3 text-xs text-green-800">
          {SUBTYPE_LABEL[logsaved] ?? "Log"} tersimpan.
        </div>
      ) : null}
      {logdeleted ? (
        <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
          Log dihapus.
        </div>
      ) : null}
      {logerror ? (
        <div className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">
          {logerror}
        </div>
      ) : null}

      {ongoing.length > 0 ? (
        <section className="mt-5 space-y-2">
          {ongoing.map((l) => (
            <OngoingCard
              key={l.id}
              id={l.id}
              subtype={l.subtype as "sleep" | "pumping"}
              startIso={l.timestamp}
            />
          ))}
        </section>
      ) : null}

      <section className="mt-5">
        <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700">
          Mulai Sekarang
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {!ongoingSubtypes.has("sleep") ? (
            <StartOngoingButton
              subtype="sleep"
              label="Mulai Tidur"
              emoji="🌙"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-rose-100 bg-rose-50/40 p-3 text-rose-400">
              <span className="text-2xl" aria-hidden>
                🌙
              </span>
              <span className="text-[11px] font-semibold">
                Tidur berlangsung
              </span>
            </div>
          )}
          {!ongoingSubtypes.has("pumping") ? (
            <StartOngoingButton
              subtype="pumping"
              label="Mulai Pumping"
              emoji="💧"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-rose-100 bg-rose-50/40 p-3 text-rose-400">
              <span className="text-2xl" aria-hidden>
                💧
              </span>
              <span className="text-[11px] font-semibold">
                Pumping berlangsung
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="mt-5">
        <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700">
          Catat Cepat
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {QUICK_PRIMARY.map((q) => (
            <LogModalTrigger
              key={q.subtype}
              subtype={q.subtype}
              className="flex flex-col items-center gap-1 rounded-2xl border border-white bg-rose-50 p-3 shadow-sm transition-transform active:scale-95"
            >
              <span className="text-2xl" aria-hidden>
                {q.emoji}
              </span>
              <span className="text-[11px] font-semibold text-rose-700">
                {q.label}
              </span>
            </LogModalTrigger>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {QUICK_SECONDARY.map((q) => (
            <LogModalTrigger
              key={q.subtype}
              subtype={q.subtype}
              className="flex items-center justify-center gap-1.5 rounded-2xl border border-gray-100 bg-white px-2 py-2 shadow-sm transition-transform active:scale-95"
            >
              <span aria-hidden>{q.emoji}</span>
              <span className="text-xs font-medium text-gray-700">
                {q.label}
              </span>
            </LogModalTrigger>
          ))}
        </div>
      </section>

      <section className="mt-5">
        <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700">
          Total Hari Ini
        </h2>
        <div className="space-y-2.5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <StatRow
            label="🍼 Susu"
            value={`${stats.feedingMlTotal} ml`}
            sub={
              stats.feedingMlCount > 0
                ? `${stats.feedingMlCount}×`
                : undefined
            }
          />
          <StatRow
            label="🤱 DBF"
            value={fmtDuration(stats.dbfMinTotal)}
            sub={stats.dbfCount > 0 ? `${stats.dbfCount}×` : undefined}
          />
          {stats.pumpML > 0 ? (
            <StatRow
              label="💧 Pumping"
              value={`${stats.pumpML} ml`}
              sub={`${stats.pumpCount}×`}
            />
          ) : null}
          <StatRow
            label="🌙 Tidur"
            value={fmtDuration(stats.sleepMin)}
            sub={
              stats.sleepCount > 0 ? `${stats.sleepCount} sesi` : undefined
            }
          />
          <StatRow
            label="🧷 Diaper"
            value={`${stats.diaperCount}×`}
            sub={
              stats.diaperCount > 0
                ? `${stats.diaperPeeCount} 💛 · ${stats.diaperPoopCount} 💩`
                : undefined
            }
          />
        </div>
      </section>

      <section className="mt-5">
        <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700">
          Sejak Terakhir
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <SinceCard label="Feeding" log={last.feeding} />
          <SinceCard label="Diaper" log={last.diaper} />
          <SinceCard label="Tidur" log={last.sleep} />
        </div>
      </section>

      <section className="mt-5">
        <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700">
          Aktivitas Terbaru
        </h2>
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {recent.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Belum ada catatan. Tap tombol di atas untuk mulai.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recent.map((l, idx) => (
                <div
                  key={l.id}
                  className={`flex items-center gap-3 px-4 py-3${
                    idx === 0 && (logsaved || searchParams.ongoingstarted)
                      ? " flash-in"
                      : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-gray-800">
                        {SUBTYPE_LABEL[l.subtype] ?? l.subtype}
                      </span>
                      {logDetail(l) ? (
                        <span className="truncate text-xs text-gray-500">
                          • {logDetail(l)}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {fmtTime(l.timestamp)} · {timeSince(l.timestamp)}
                    </div>
                  </div>
                  <form action={deleteLogAction}>
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="return_to" value="/" />
                    <SubmitButton
                      pendingText="…"
                      className="text-[11px] text-gray-400 hover:text-red-600"
                    >
                      Hapus
                    </SubmitButton>
                  </form>
                </div>
              ))}
            </div>
          )}
        </div>
        <Link
          href="/history"
          className="mt-2 block text-center text-xs font-semibold text-rose-600 hover:underline"
        >
          Lihat semua riwayat →
        </Link>
      </section>

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Link
          href="/growth"
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          📈 Tumbuh
        </Link>
        <Link
          href="/milestone"
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          🎯 Milestone
        </Link>
        <Link
          href="/imunisasi"
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          💉 Imunisasi
        </Link>
        <Link
          href="/report"
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          📥 Laporan
        </Link>
        <Link
          href="/more/household"
          className="col-span-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          👨‍👩‍👧 Keluarga
        </Link>
      </div>
      <form action="/auth/signout" method="post" className="mt-2">
        <SubmitButton
          pendingText="Keluar…"
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Keluar
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-[11px] text-gray-400">
        {user.email} · {household.role === "owner" ? "Owner" : "Member"}
      </p>
    </main>
  );
}

function SinceCard({
  label,
  log,
}: {
  label: string;
  log: LogRow | null;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-0.5 text-sm font-bold text-gray-800">
        {log ? timeSince(log.timestamp) : "—"}
      </div>
      {log ? (
        <div className="text-[11px] text-gray-400">{fmtTime(log.timestamp)}</div>
      ) : null}
    </div>
  );
}

function StatRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex-1 text-sm text-gray-600">{label}</span>
      <span className="text-sm font-bold text-gray-800">{value}</span>
      {sub ? (
        <span className="w-24 text-right text-[11px] text-gray-400">
          {sub}
        </span>
      ) : null}
    </div>
  );
}
