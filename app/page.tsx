import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentHousehold } from "@/lib/household/current";
import { getCurrentBaby } from "@/lib/household/baby";
import {
  LogModalTrigger,
  EditLogModalTrigger,
  type LogSubtype,
} from "@/components/LogModal";
import type { Medication } from "@/app/actions/medications";
import { LogsRealtime } from "@/components/LogsRealtime";
import { SubmitButton } from "@/components/SubmitButton";
import { OngoingCard } from "@/components/OngoingCard";
import { StartOngoingButton } from "@/components/StartOngoingButtons";
import { IdleClockToggle } from "@/components/IdleClockMode";
import {
  deleteLogAction,
  resumeOngoingLogAction,
  expireStalePausedLogs,
} from "@/app/actions/logs";
import {
  computeTodayStats,
  computeLastByType,
  type LogRow,
} from "@/lib/compute/stats";
import {
  fmtDuration,
  fmtSleepRange,
  fmtTime,
  pumpDur,
  timeSince,
} from "@/lib/compute/format";
import {
  getTargetForAge,
  computeMilkTarget,
} from "@/lib/constants/daily-targets";
import { dbfEstimateMl } from "@/lib/compute/dbf-estimate";

type SearchParams = {
  welcome?: string;
  logsaved?: string;
  logerror?: string;
  ongoingstarted?: string;
  act?: string;
  darklamp?: string;
};

type ActFilter = "bottle" | "dbf" | "pumping" | "sleep" | "diaper";
const ACT_LABEL: Record<ActFilter, string> = {
  bottle: "🍼 Susu",
  dbf: "🤱 DBF",
  pumping: "💧 Pumping",
  sleep: "🌙 Tidur",
  diaper: "🧷 Diaper",
};
function parseAct(s: string | undefined): ActFilter | null {
  if (
    s === "bottle" ||
    s === "dbf" ||
    s === "pumping" ||
    s === "sleep" ||
    s === "diaper"
  ) {
    return s;
  }
  return null;
}
function matchesAct(l: LogRow, act: ActFilter): boolean {
  switch (act) {
    case "bottle":
      return l.subtype === "feeding" && l.amount_ml != null;
    case "dbf":
      return (
        l.subtype === "feeding" &&
        (l.duration_l_min != null ||
          l.duration_r_min != null ||
          l.start_l_at != null ||
          l.start_r_at != null)
      );
    case "pumping":
      return l.subtype === "pumping";
    case "sleep":
      return l.subtype === "sleep";
    case "diaper":
      return l.subtype === "diaper";
  }
}

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
  med: "Obat / Suplemen",
};

function logDetail(l: LogRow, dbfRate: number): string {
  // Ongoing pumping / DBF rows have null ml and null durations — show
  // which side is active rather than "L 0 / R 0 ml".
  const isOngoing = l.end_timestamp === null;
  if (l.subtype === "feeding") {
    if (l.amount_ml != null) {
      const src =
        l.bottle_content === "asi"
          ? "ASI"
          : l.bottle_content === "sufor"
            ? "Sufor"
            : null;
      return src ? `🍼 ${src} ${l.amount_ml} ml` : `🍼 ${l.amount_ml} ml`;
    }
    if (isOngoing && (l.start_l_at || l.start_r_at)) {
      const lActive = !!l.start_l_at && !l.end_l_at;
      const rActive = !!l.start_r_at && !l.end_r_at;
      if (lActive && rActive) return `🤱 Dua sisi aktif`;
      if (lActive) return `🤱 Kiri aktif`;
      if (rActive) return `🤱 Kanan aktif`;
      return `🤱 berlangsung`;
    }
    const lMin = l.duration_l_min ?? 0;
    const rMin = l.duration_r_min ?? 0;
    const lMl = Math.round(lMin * dbfRate);
    const rMl = Math.round(rMin * dbfRate);
    return `🤱 L ${lMin}m (≈${lMl} ml) · R ${rMin}m (≈${rMl} ml)`;
  }
  if (l.subtype === "pumping") {
    if (isOngoing) {
      const lActive = !!l.start_l_at && !l.end_l_at;
      const rActive = !!l.start_r_at && !l.end_r_at;
      if (lActive && rActive) return `Dua sisi aktif`;
      if (lActive) return `Kiri aktif`;
      if (rActive) return `Kanan aktif`;
      return `berlangsung`;
    }
    const lDur = pumpDur(l.start_l_at, l.end_l_at);
    const rDur = pumpDur(l.start_r_at, l.end_r_at);
    const lFmt =
      `L ${l.amount_l_ml ?? 0} ml` + (lDur ? ` · ${lDur} mnt` : "");
    const rFmt =
      `R ${l.amount_r_ml ?? 0} ml` + (rDur ? ` · ${rDur} mnt` : "");
    return `${lFmt}  ·  ${rFmt}`;
  }
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
    const range = fmtSleepRange(l.timestamp, l.end_timestamp);
    const quality =
      l.sleep_quality === "nyenyak"
        ? " · 😴 nyenyak"
        : l.sleep_quality === "gelisah"
          ? " · 😣 gelisah"
          : l.sleep_quality === "sering_bangun"
            ? " · 😢 sering bangun"
            : "";
    return `${range}${quality}`;
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

  // Sweep ongoing sessions paused > 10 min before fetching the page
  // data — gives the user a stale state cleaned up on first visit.
  await expireStalePausedLogs(baby.id);

  const supabase = createClient();

  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const [
    { data: logs },
    { data: medsData },
    { data: stockData },
    { data: latestWeightData },
  ] = await Promise.all([
      supabase
        .from("logs")
        .select(
          "id, subtype, timestamp, end_timestamp, amount_ml, amount_l_ml, amount_r_ml, duration_l_min, duration_r_min, has_pee, has_poop, poop_color, poop_consistency, temp_celsius, med_name, med_dose, bottle_content, consumed_ml, start_l_at, end_l_at, start_r_at, end_r_at, paused_at, started_with_stopwatch, sleep_quality, notes",
        )
        .eq("baby_id", baby.id)
        .gte("timestamp", since)
        .order("timestamp", { ascending: false }),
      supabase
        .from("medications")
        .select("id, name, default_dose, unit")
        .eq("household_id", household.household_id)
        .order("name", { ascending: true }),
      supabase
        .from("logs")
        .select(
          "id, timestamp, amount_l_ml, amount_r_ml, consumed_ml",
        )
        .eq("baby_id", baby.id)
        .eq("subtype", "pumping")
        .not("end_timestamp", "is", null)
        .order("timestamp", { ascending: true }),
      supabase
        .from("growth_measurements")
        .select("weight_kg")
        .eq("baby_id", baby.id)
        .order("measured_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  const medications = (medsData ?? []) as Medication[];
  const stockBatches = (stockData ?? []).map((b) => {
    const produced = (b.amount_l_ml ?? 0) + (b.amount_r_ml ?? 0);
    const consumed = b.consumed_ml ?? 0;
    return {
      id: b.id,
      timestamp: b.timestamp,
      produced,
      consumed,
      remaining: Math.max(0, produced - consumed),
    };
  });
  const stockTotalMl = stockBatches.reduce((s, b) => s + b.remaining, 0);
  const stockBatchCount = stockBatches.filter((b) => b.remaining > 0).length;
  const asiBatchOptions = stockBatches
    .filter((b) => b.remaining > 0)
    .map((b) => ({
      id: b.id,
      startedAtIso: b.timestamp,
      remainingMl: b.remaining,
    }));

  const logsArray: LogRow[] = (logs ?? []) as LogRow[];
  const ongoing = logsArray.filter(
    (l) =>
      l.end_timestamp === null &&
      l.started_with_stopwatch === true &&
      (l.subtype === "sleep" ||
        l.subtype === "pumping" ||
        l.subtype === "feeding" ||
        l.subtype === "hiccup"),
  );
  const ongoingSubtypes = new Set(
    ongoing.map((l) =>
      l.subtype === "feeding" ? "dbf" : l.subtype,
    ),
  );
  const stats = computeTodayStats(logsArray);
  const last = computeLastByType(logsArray);
  const target = getTargetForAge(baby.dob);
  const currentWeightKg = (() => {
    const raw = latestWeightData?.weight_kg ?? baby.birth_weight_kg ?? null;
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  const milkTarget = computeMilkTarget(target, currentWeightKg);
  const dbfEst = dbfEstimateMl(stats.dbfMinTotal, logsArray, {
    fixedMlPerMin: baby.dbf_ml_per_min,
    pumpingMultiplier: baby.dbf_pumping_multiplier,
  });
  const milkTotalMl = stats.feedingMlTotal + dbfEst.ml;
  const milkBreakdownParts: string[] = [];
  if (stats.feedingMlCount > 0) {
    milkBreakdownParts.push(
      `${stats.feedingMlTotal} ml botol (${stats.feedingMlCount}×)`,
    );
  }
  if (stats.dbfCount > 0) {
    milkBreakdownParts.push(
      `≈${dbfEst.ml} ml dari ${fmtDuration(stats.dbfMinTotal)} DBF`,
    );
  }
  const milkBreakdown =
    milkBreakdownParts.length > 0 ? milkBreakdownParts.join(" · ") : undefined;
  const totalBoobsLMin = stats.dbfMinL + stats.pumpMinL;
  const totalBoobsRMin = stats.dbfMinR + stats.pumpMinR;
  const feedingReminder = (() => {
    if (!last.feeding) return null;
    const minsSince =
      (Date.now() - new Date(last.feeding.timestamp).getTime()) / 60000;
    if (minsSince < 240) return null;
    const hours = Math.floor(minsSince / 60);
    const mins = Math.round(minsSince % 60);
    const text = `Sudah ${hours}j ${mins}m belum minum`;
    return {
      text,
      tone: minsSince >= 480 ? ("urgent" as const) : ("warning" as const),
    };
  })();
  const activeAct = parseAct(searchParams.act);
  const filteredLogs = activeAct
    ? logsArray.filter((l) => matchesAct(l, activeAct))
    : logsArray;
  const recent = filteredLogs.slice(0, activeAct ? 20 : 6);

  const welcome = searchParams.welcome;
  const welcomeMsg =
    welcome === "baby"
      ? `Profil ${baby.name} tersimpan.`
      : welcome === "joined"
        ? `Selamat datang ke keluarga ${household.household_name}!`
        : null;

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
      {logerror ? (
        <div className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">
          {logerror}
        </div>
      ) : null}

      {ongoing.length > 0 ? (
        <section className="mt-5 space-y-2">
          {ongoing.map((l, idx) => {
            const cardSubtype: "sleep" | "pumping" | "dbf" | "hiccup" =
              l.subtype === "feeding"
                ? "dbf"
                : (l.subtype as "sleep" | "pumping" | "hiccup");
            // Auto-open dark lamp once after manual sleep submit with
            // empty Bangun. Match by subtype, only first such row.
            const shouldAutoOpenLamp =
              idx === 0 &&
              searchParams.darklamp === "sleep" &&
              cardSubtype === "sleep";
            return (
              <OngoingCard
                key={l.id}
                id={l.id}
                subtype={cardSubtype}
                startIso={l.timestamp}
                pausedAtIso={l.paused_at}
                pumpStartLAt={l.start_l_at}
                pumpEndLAt={l.end_l_at}
                pumpStartRAt={l.start_r_at}
                pumpEndRAt={l.end_r_at}
                dbfMlPerMin={dbfEst.mlPerMin}
                autoOpenLamp={shouldAutoOpenLamp}
              />
            );
          })}
        </section>
      ) : null}

      <section className="mt-5">
        <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700">
          Mulai Sekarang
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {!ongoingSubtypes.has("sleep") ? (
            <StartOngoingButton
              subtype="sleep"
              label="Tidur"
              emoji="🌙"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-rose-100 bg-rose-50/40 p-3 text-rose-400">
              <span className="text-2xl" aria-hidden>
                🌙
              </span>
              <span className="text-[11px] font-semibold text-center leading-tight">
                Tidur berlangsung
              </span>
            </div>
          )}
          {!ongoingSubtypes.has("dbf") ? (
            <StartOngoingButton subtype="feeding" label="DBF" emoji="🤱" />
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-rose-100 bg-rose-50/40 p-3 text-rose-400">
              <span className="text-2xl" aria-hidden>
                🤱
              </span>
              <span className="text-[11px] font-semibold text-center leading-tight">
                DBF berlangsung
              </span>
            </div>
          )}
          {!ongoingSubtypes.has("pumping") ? (
            <StartOngoingButton
              subtype="pumping"
              label="Pumping"
              emoji="💧"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-rose-100 bg-rose-50/40 p-3 text-rose-400">
              <span className="text-2xl" aria-hidden>
                💧
              </span>
              <span className="text-[11px] font-semibold text-center leading-tight">
                Pumping berlangsung
              </span>
            </div>
          )}
          {!ongoingSubtypes.has("hiccup") ? (
            <StartOngoingButton
              subtype="hiccup"
              label="Cegukan"
              emoji="🤧"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-rose-100 bg-rose-50/40 p-3 text-rose-400">
              <span className="text-2xl" aria-hidden>
                🤧
              </span>
              <span className="text-[11px] font-semibold text-center leading-tight">
                Cegukan berlangsung
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
              asiBatches={q.subtype === "feeding" ? asiBatchOptions : undefined}
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
              medications={q.subtype === "med" ? medications : undefined}
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

      {stockBatches.length > 0 ? (
        <section className="mt-5">
          <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700">
            Stok ASI
          </h2>
          <Link
            href="/stock"
            className="block rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 shadow-sm hover:bg-emerald-50"
          >
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-xs text-emerald-700/80">
                  Tersisa
                </div>
                <div className="text-2xl font-bold text-emerald-700">
                  {stockTotalMl} <span className="text-sm font-medium text-emerald-700/70">ml</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-emerald-700/80">Batch aktif</div>
                <div className="text-base font-bold text-emerald-700">
                  {stockBatchCount}
                </div>
              </div>
            </div>
            <div className="mt-1 text-[11px] text-emerald-700/60">
              FIFO · ASI botol auto-deduct dari batch terlama →
            </div>
          </Link>
        </section>
      ) : null}

      <section className="mt-5">
        <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700">
          Total Hari Ini
        </h2>
        <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <StatRow
            label="🍼 Susu"
            value={`${milkTotalMl} ml`}
            sub={`${milkTarget.min}–${milkTarget.max} ml`}
            progress={milkTotalMl / milkTarget.min}
            detail={milkBreakdown}
            href="/?act=bottle#aktivitas"
            active={activeAct === "bottle"}
          />
          <StatRow
            label="🌙 Tidur"
            value={fmtDuration(stats.sleepMin)}
            sub={`${target.sleepHoursMin}–${target.sleepHoursMax} jam`}
            progress={stats.sleepMin / 60 / target.sleepHoursMin}
            detail={
              stats.sleepCount > 0 ? `${stats.sleepCount} sesi` : undefined
            }
            href="/?act=sleep#aktivitas"
            active={activeAct === "sleep"}
          />
          <StatRow
            label="💛 Pipis"
            value={`${stats.diaperPeeCount}×`}
            sub={`${target.peeMin}–${target.peeMax}×`}
            progress={stats.diaperPeeCount / target.peeMin}
            href="/?act=diaper#aktivitas"
            active={activeAct === "diaper"}
          />
          <StatRow
            label="💩 BAB"
            value={`${stats.diaperPoopCount}×`}
            sub={`${target.poopMin}–${target.poopMax}×`}
            progress={stats.diaperPoopCount / target.poopMin}
            href="/?act=diaper#aktivitas"
            active={activeAct === "diaper"}
          />
          {stats.pumpCount > 0 ? (
            <div className="border-t border-gray-100 pt-3">
              <StatRow
                label="💧 Pumping"
                value={`${stats.pumpML} ml`}
                sub={`${stats.pumpCount} batch`}
                detail={`Kiri ${stats.pumpMlL} ml${
                  stats.pumpMinL > 0 ? ` / ${fmtDuration(stats.pumpMinL)}` : ""
                } · Kanan ${stats.pumpMlR} ml${
                  stats.pumpMinR > 0 ? ` / ${fmtDuration(stats.pumpMinR)}` : ""
                }`}
                href="/?act=pumping#aktivitas"
                active={activeAct === "pumping"}
              />
            </div>
          ) : null}
          {totalBoobsLMin > 0 || totalBoobsRMin > 0 ? (
            <div className="border-t border-gray-100 pt-3">
              <StatRow
                label="🤱 Total Boobs"
                value={`L ${fmtDuration(totalBoobsLMin)} · R ${fmtDuration(totalBoobsRMin)}`}
                detail={`L ≈${Math.round(stats.dbfMinL * dbfEst.mlPerMin) + stats.pumpMlL} ml · R ≈${Math.round(stats.dbfMinR * dbfEst.mlPerMin) + stats.pumpMlR} ml (DBF estimasi + Pumping per sisi)`}
              />
            </div>
          ) : null}
          <p className="border-t border-gray-100 pt-2 text-[10px] leading-snug text-gray-400">
            Target referensi WHO/IDAI/AAP usia{" "}
            {Math.floor(
              (Date.now() - new Date(baby.dob).getTime()) / 86400000,
            )}{" "}
            hari
            {milkTarget.source === "weight"
              ? `, susu ${target.milkMlPerKgMin}–${target.milkMlPerKgMax} ml/kg/hari × ${currentWeightKg} kg`
              : ""}
            . DBF estimasi{" "}
            {dbfEst.source === "multiplier" && dbfEst.pumpingRate != null
              ? `${dbfEst.mlPerMin.toFixed(1)} ml/menit (${baby.dbf_pumping_multiplier}× pumping ${dbfEst.pumpingRate.toFixed(1)} ml/menit)`
              : dbfEst.source === "fixed"
                ? `${dbfEst.mlPerMin} ml/menit (override fixed)`
                : dbfEst.source === "pumping"
                  ? `${dbfEst.mlPerMin.toFixed(1)} ml/menit dari pumping terakhir`
                  : `default ${dbfEst.mlPerMin} ml/menit`}{" "}
            — bukan ukuran pasti. Selalu konsultasi DSA untuk evaluasi medis.
          </p>
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

      <section id="aktivitas" className="mt-5 scroll-mt-4">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-gray-700">
            Aktivitas Terbaru
          </h2>
          {activeAct ? (
            <Link
              href="/#aktivitas"
              className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-200"
            >
              {ACT_LABEL[activeAct]} <span aria-hidden>✕</span>
            </Link>
          ) : null}
        </div>
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {recent.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              {activeAct
                ? `Belum ada catatan ${ACT_LABEL[activeAct]} hari ini.`
                : "Belum ada catatan. Tap tombol di atas untuk mulai."}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recent.map((l, idx) => {
                // "Berlangsung" only applies to Mulai-flow sessions of
                // duration-based subtypes (sleep, pumping, feeding/DBF).
                // Diaper/bath/temp/med are point-in-time events; never
                // ongoing even with stale flags.
                const isOngoingType =
                  l.subtype === "sleep" ||
                  l.subtype === "pumping" ||
                  l.subtype === "feeding";
                const ongoing =
                  isOngoingType &&
                  l.end_timestamp === null &&
                  l.started_with_stopwatch;
                const paused = ongoing && l.paused_at !== null;
                const rowBg = paused
                  ? "bg-amber-50/60 border-l-4 border-l-amber-300"
                  : ongoing
                    ? "bg-rose-50/50 border-l-4 border-l-rose-300"
                    : "";
                const flash =
                  idx === 0 &&
                  (searchParams.logsaved || searchParams.ongoingstarted)
                    ? " flash-in"
                    : "";
                return (
                <div
                  key={l.id}
                  className={`flex items-center gap-3 px-4 py-3 ${rowBg}${flash}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-gray-800">
                        {SUBTYPE_LABEL[l.subtype] ?? l.subtype}
                      </span>
                      {paused ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700">
                          ⏸ dijeda
                        </span>
                      ) : ongoing ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-1.5 py-px text-[10px] font-semibold text-rose-700">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
                          </span>
                          berlangsung
                        </span>
                      ) : null}
                      {logDetail(l, dbfEst.mlPerMin) ? (
                        <span className="truncate text-xs text-gray-500">
                          • {logDetail(l, dbfEst.mlPerMin)}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {fmtTime(l.timestamp)} · {timeSince(l.timestamp)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {(() => {
                      // Lanjutkan only on completed (end_timestamp set)
                      // sleep / pumping / DBF rows, when no ongoing of
                      // same logical type already exists.
                      if (!l.end_timestamp) return null;
                      const sameTypeOngoing =
                        l.subtype === "sleep"
                          ? ongoingSubtypes.has("sleep")
                          : l.subtype === "pumping"
                            ? ongoingSubtypes.has("pumping")
                            : l.subtype === "feeding" &&
                                (l.start_l_at !== null || l.start_r_at !== null)
                              ? ongoingSubtypes.has("dbf")
                              : true;
                      const supportsResume =
                        l.subtype === "sleep" ||
                        l.subtype === "pumping" ||
                        (l.subtype === "feeding" &&
                          (l.start_l_at !== null || l.start_r_at !== null));
                      if (!supportsResume || sameTypeOngoing) return null;
                      return (
                        <form action={resumeOngoingLogAction}>
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="return_to" value="/" />
                          <SubmitButton
                            pendingText="…"
                            className="text-[11px] font-semibold text-rose-600 hover:underline"
                          >
                            ▶ Lanjutkan
                          </SubmitButton>
                        </form>
                      );
                    })()}
                    <div className="flex items-center gap-2 leading-none">
                      {!ongoing ? (
                        <EditLogModalTrigger
                          log={l}
                          medications={medications}
                          returnTo="/"
                          className="text-[11px] leading-none text-gray-400 hover:text-rose-600"
                        >
                          Edit
                        </EditLogModalTrigger>
                      ) : null}
                      <form action={deleteLogAction} className="contents">
                        <input type="hidden" name="id" value={l.id} />
                        <input type="hidden" name="return_to" value="/" />
                        <SubmitButton
                          pendingText="…"
                          className="text-[11px] leading-none text-gray-400 hover:text-red-600"
                        >
                          Hapus
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                </div>
                );
              })}
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

      {ongoing.length === 0 ? (
        <div className="mt-5">
          <IdleClockToggle
            sinceFeeding={
              last.feeding ? timeSince(last.feeding.timestamp) : null
            }
            sinceSleep={last.sleep ? timeSince(last.sleep.timestamp) : null}
            sinceDiaper={
              last.diaper ? timeSince(last.diaper.timestamp) : null
            }
            reminder={feedingReminder}
            stats={{
              milkTotalMl,
              milkTargetMin: milkTarget.min,
              milkTargetMax: milkTarget.max,
              sleepMin: stats.sleepMin,
              sleepTargetHoursMin: target.sleepHoursMin,
              sleepTargetHoursMax: target.sleepHoursMax,
              peeCount: stats.diaperPeeCount,
              peeTargetMin: target.peeMin,
              poopCount: stats.diaperPoopCount,
              poopTargetMin: target.poopMin,
            }}
            ongoingSubtypes={Array.from(ongoingSubtypes)}
          />
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Link
          href="/trend"
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          📊 Trend
        </Link>
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
  progress,
  detail,
  href,
  active,
}: {
  label: string;
  value: string;
  /** Target text shown right of value (e.g. "600–800 ml"). */
  sub?: string;
  /** 0..1+ progress against target min. Renders progress bar when set. */
  progress?: number;
  /** Optional small line below the row (breakdown, per-side detail). */
  detail?: string;
  href?: string;
  active?: boolean;
}) {
  const pct = progress != null ? Math.min(1, Math.max(0, progress)) : null;
  const barColor =
    progress == null
      ? "bg-gray-300"
      : progress >= 1
        ? "bg-emerald-500"
        : progress >= 0.6
          ? "bg-amber-400"
          : "bg-rose-400";
  const inner = (
    <div className="w-full">
      <div className="flex items-baseline gap-3">
        <span className="flex-1 truncate text-sm text-gray-600">{label}</span>
        <span className="text-sm font-bold text-gray-800">{value}</span>
        {sub ? (
          <span className="w-24 text-right text-[11px] text-gray-400">
            / {sub}
          </span>
        ) : null}
      </div>
      {pct != null ? (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full ${barColor} transition-[width]`}
            style={{ width: `${Math.round(pct * 100)}%` }}
          />
        </div>
      ) : null}
      {detail ? (
        <div className="mt-0.5 text-[11px] text-gray-500">{detail}</div>
      ) : null}
    </div>
  );
  if (!href) {
    return <div>{inner}</div>;
  }
  return (
    <Link
      href={href}
      className={`-mx-2 block rounded-lg px-2 py-1 transition-colors ${
        active ? "bg-rose-50 ring-1 ring-rose-200" : "hover:bg-gray-50"
      }`}
    >
      {inner}
    </Link>
  );
}
