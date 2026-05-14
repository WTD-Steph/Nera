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
  bulkUpdateDbfRateAction,
  logDbfTampunganAction,
  startOngoingLogAction,
} from "@/app/actions/logs";
import {
  startHandoverAction,
  endHandoverAction,
} from "@/app/actions/handover";
import { summarizeHandoverActivity } from "@/lib/compute/handover";
import { assessWake, getWakeWindow } from "@/lib/constants/wake-window";
import { getCurrentRegression } from "@/lib/constants/sleep-regressions";
import { computeCryCauses } from "@/lib/compute/cry-diagnostic";
import { logDetail } from "@/lib/compute/log-detail";
import {
  computeLastEnded,
  fmtSelesaiLalu,
  fmtGap,
} from "@/lib/compute/last-ended";
import { CupFeedTrigger } from "@/components/CupFeedTrigger";
import { getCupFeedPace, getBottleFeedPace } from "@/lib/constants/cup-feed";
import { computeRealtimeAdvice } from "@/lib/compute/sleep-coach-realtime";
import { CryDiagnostic } from "@/components/CryDiagnostic";
import { WakeWindowCard } from "@/components/WakeWindowCard";
import {
  RoutineChecklist,
  type RoutineItem,
  type RoutineLogToday,
} from "@/components/RoutineChecklist";
import {
  computeTodayStats,
  computeLastByType,
  jakartaDayStartMs,
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
import {
  EFFECTIVENESS_EMOJIS,
  EFFECTIVENESS_LABELS,
  suggestTopUp,
  type EffectivenessLevel,
} from "@/lib/compute/dbf-effectiveness";

type SearchParams = {
  welcome?: string;
  logsaved?: string;
  logerror?: string;
  ongoingstarted?: string;
  act?: string;
  darklamp?: string;
  /** YYYY-MM-DD (Asia/Jakarta). Default = today. */
  date?: string;
  /** ID of just-completed DBF row → show top-up suggestion banner. */
  dbf_id?: string;
  /** Total minutes of that DBF (kiri+kanan). */
  dbf_dur?: string;
  /** ID of just-completed pumping row → show rate comparison banner. */
  pump_id?: string;
  /** Handover toast: "started" | "ended" → show post-action confirmation. */
  handover?: string;
  /** "1" = user dismissed tampungan banner; keep dbf_id so other banners stay. */
  tampungan_skip?: string;
  /** "1" = user dismissed top-up suggestion; keep dbf_id so other banners stay. */
  topup_skip?: string;
};

function parseJakartaDate(s: string | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    return null;
  }
  // Build Jakarta midnight for that date
  const offsetMs = 7 * 60 * 60 * 1000;
  const utcMs = Date.UTC(y, mo - 1, d, 0, 0, 0);
  return utcMs - offsetMs;
}

/** Capitalize email local-part for display: "putri@..." → "Putri". */
function nameFromEmail(email: string | null | undefined): string {
  if (!email) return "Partner";
  const local = email.split("@")[0] ?? "user";
  if (local.length === 0) return "Partner";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function jakartaDayKey(ms: number): string {
  const offsetMs = 7 * 60 * 60 * 1000;
  const local = new Date(ms + offsetMs);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
}

function jakartaDayLabel(ms: number, todayMs: number): string {
  const k = jakartaDayKey(ms);
  if (k === jakartaDayKey(todayMs)) return "Hari ini";
  if (k === jakartaDayKey(todayMs - 86400000)) return "Kemarin";
  const offsetMs = 7 * 60 * 60 * 1000;
  const local = new Date(ms + offsetMs);
  const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const BULAN = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];
  return `${HARI[local.getUTCDay()]}, ${local.getUTCDate()} ${BULAN[local.getUTCMonth()]}`;
}

type ActFilter = "bottle" | "dbf" | "pumping" | "sleep" | "diaper";
const ACT_LABEL: Record<ActFilter, string> = {
  bottle: "🍼 Susu",
  dbf: "🤱 DBF",
  pumping: "💧 Pumping",
  sleep: "😴 Tidur",
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
  { subtype: "sleep", label: "Tidur", emoji: "😴" },
];
const QUICK_SECONDARY: { subtype: LogSubtype; label: string; emoji: string }[] = [
  { subtype: "bath", label: "Mandi", emoji: "🫧" },
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
  hiccup: "Cegukan",
  tummy: "Tummy Time",
};

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

  // Date filter: if ?date= is set, expand fetch window to cover that
  // day. Otherwise default 36-hour rolling window for today's view.
  const todayMsForFetch = jakartaDayStartMs();
  const selectedDayMsForFetch =
    parseJakartaDate(searchParams.date) ?? todayMsForFetch;
  // Always fetch from min(selectedDay - 12h, now - 36h) to ensure we have
  // both the requested day and recent activity for "Sejak Terakhir".
  const earliestMs = Math.min(
    selectedDayMsForFetch - 12 * 60 * 60 * 1000,
    Date.now() - 36 * 60 * 60 * 1000,
  );
  const since = new Date(earliestMs).toISOString();
  const [
    { data: logs },
    { data: medsData },
    { data: stockData },
    { data: latestWeightData },
    { data: activeHandoverData },
    { data: householdMembersData },
    { data: poop7dData },
    { data: routinesData },
    { data: routineLogsTodayData },
  ] = await Promise.all([
      supabase
        .from("logs")
        .select(
          "id, subtype, timestamp, end_timestamp, amount_ml, amount_asi_ml, amount_sufor_ml, amount_spilled_ml, spilled_attribution, amount_l_ml, amount_r_ml, duration_l_min, duration_r_min, has_pee, has_poop, poop_color, poop_consistency, temp_celsius, med_name, med_dose, bottle_content, consumed_ml, start_l_at, end_l_at, start_r_at, end_r_at, paused_at, started_with_stopwatch, sleep_quality, avg_db_a, max_db_a, effectiveness, dbf_rate_override, bath_pijat_ilu, bath_clean_tali_pusat, notes",
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
      supabase
        .from("handovers")
        .select("id, started_by, started_by_email, started_at")
        .eq("household_id", household.household_id)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.rpc("list_household_members", {
        h_id: household.household_id,
      }),
      // BAB 7-day window — newborn poop sering cuma 0-2× per hari, jadi
      // today-only avg interval rarely meaningful. Pull 7-day timestamps
      // (poop entries only) untuk hitung avg interval yang representative.
      supabase
        .from("logs")
        .select("timestamp")
        .eq("baby_id", baby.id)
        .eq("subtype", "diaper")
        .eq("has_poop", true)
        .gte(
          "timestamp",
          new Date(Date.now() - 7 * 86400000).toISOString(),
        )
        .order("timestamp", { ascending: true }),
      // Daily routines + today's logs
      supabase
        .from("routines")
        .select("id, name, emoji, needs_duration, display_order")
        .eq("baby_id", baby.id)
        .order("display_order", { ascending: true }),
      supabase
        .from("routine_logs")
        .select("id, routine_id, logged_at, duration_min")
        .eq("baby_id", baby.id)
        .gte(
          "logged_at",
          new Date(jakartaDayStartMs()).toISOString(),
        )
        .order("logged_at", { ascending: false }),
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
        l.subtype === "hiccup" ||
        l.subtype === "tummy"),
  );
  const ongoingSubtypes = new Set(
    ongoing.map((l) =>
      l.subtype === "feeding" ? "dbf" : l.subtype,
    ),
  );
  const lastEnded = computeLastEnded(logsArray);
  const nowMsForGap = Date.now();
  // Selected date: from ?date=YYYY-MM-DD (Jakarta) or today.
  const todayMs = jakartaDayStartMs();
  const selectedDayMs = parseJakartaDate(searchParams.date) ?? todayMs;
  const selectedDayKey = jakartaDayKey(selectedDayMs);
  const selectedDayLabel = jakartaDayLabel(selectedDayMs, todayMs);
  const isToday = selectedDayKey === jakartaDayKey(todayMs);
  // Total count = calendar day (Jakarta 00:00–23:59). Easy to compare
  // hari demi hari, match user's mental model of 'hari ini berapa'.
  const stats = computeTodayStats(logsArray, selectedDayMs);
  // Avg metrics window — beda dari Total count untuk kasih pandangan
  // yang lebih representative:
  //   - Tidur, Pipis: 24 jam terakhir (rolling) — newborn tidak ngikut
  //     calendar day, pola lebih kelihatan dari last-24h sample
  //   - BAB: 7 hari terakhir (separate query) — frequency 0-2×/hari,
  //     butuh window lebih panjang
  const avgWindowMs = isToday ? Date.now() - 86400000 : selectedDayMs;
  const last = computeLastByType(logsArray);
  const dayPrev = jakartaDayKey(selectedDayMs - 86400000);
  const dayNext = jakartaDayKey(selectedDayMs + 86400000);
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
  // Merged feeding session count — entries dalam window 60 menit
  // dianggap satu sesi (mis. DBF + Sufor + ASIP top-up dalam 1 sesi makan).
  // Raw event counts (botol 12×, DBF 5×) tetap ditampilkan untuk granularity,
  // tapi sesi count lebih representative untuk 'frekuensi makan'.
  const SESSION_MERGE_MIN = 60;
  const feedingSessionCount = (() => {
    const startMs = selectedDayMs;
    const endMs = startMs + 86400000;
    const ts = logsArray
      .filter((l) => l.subtype === "feeding")
      .map((l) => new Date(l.timestamp).getTime())
      .filter((t) => t >= startMs && t < endMs)
      .sort((a, b) => a - b);
    if (ts.length === 0) return 0;
    let sessions = 1;
    for (let i = 1; i < ts.length; i++) {
      const a = ts[i - 1];
      const b = ts[i];
      if (a !== undefined && b !== undefined) {
        if ((b - a) / 60000 > SESSION_MERGE_MIN) sessions += 1;
      }
    }
    return sessions;
  })();
  const milkBreakdownParts: string[] = [];
  if (feedingSessionCount > 0) {
    const avgMl = Math.round(milkTotalMl / feedingSessionCount);
    milkBreakdownParts.push(
      `${feedingSessionCount} sesi · avg ${avgMl} ml/sesi`,
    );
  }
  if (stats.feedingMlCount > 0) {
    milkBreakdownParts.push(
      `${stats.feedingMlTotal} ml botol (${stats.feedingMlCount}×)`,
    );
  }
  if (stats.dbfCount > 0) {
    milkBreakdownParts.push(
      `≈${dbfEst.ml} ml dari ${fmtDuration(stats.dbfMinTotal)} DBF (${stats.dbfCount}×)`,
    );
  }
  const milkBreakdown =
    milkBreakdownParts.length > 0 ? milkBreakdownParts.join(" · ") : undefined;
  // Susu breakdown: ASI vs Sufor (by source, not delivery method).
  // ASI = bottle ASI + DBF estimate. Sufor = bottle sufor only.
  // Iterate logs filtered to selected day's window.
  const susuBreakdown = (() => {
    let asiBottle = 0;
    let suforBottle = 0;
    const startMs = selectedDayMs;
    const endMs = startMs + 86400000;
    for (const l of logsArray) {
      if (l.subtype !== "feeding") continue;
      if (l.amount_ml == null || l.amount_ml <= 0) continue;
      const t = new Date(l.timestamp).getTime();
      if (t < startMs || t >= endMs) continue;
      // Pakai breakdown amount_asi_ml + amount_sufor_ml saat ada (untuk
      // mix mode + new rows). Fallback ke bottle_content untuk legacy
      // rows yang belum ada breakdown.
      if (l.amount_asi_ml != null || l.amount_sufor_ml != null) {
        asiBottle += l.amount_asi_ml ?? 0;
        suforBottle += l.amount_sufor_ml ?? 0;
      } else if (l.bottle_content === "asi") {
        asiBottle += l.amount_ml;
      } else {
        suforBottle += l.amount_ml;
      }
    }
    const dbfMl = dbfEst.ml; // DBF is breastmilk → ASI
    return {
      asi: asiBottle + dbfMl,
      sufor: suforBottle,
      asiBottle,
      suforBottle,
      dbfMl,
    };
  })();
  const susuSourceBreakdown = (() => {
    const parts: string[] = [];
    if (susuBreakdown.asi > 0) {
      parts.push(`🤱 ASI ≈${Math.round(susuBreakdown.asi)} ml`);
    }
    if (susuBreakdown.sufor > 0) {
      parts.push(`🥛 Sufor ${Math.round(susuBreakdown.sufor)} ml`);
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  })();
  const totalBoobsLMin = stats.dbfMinL + stats.pumpMinL;
  const totalBoobsRMin = stats.dbfMinR + stats.pumpMinR;
  // Pumping rate banner — after Selesai, compare current rate to avg
  // of last 5 prior pumpings. Visible saat redirect with ?pump_id=X.
  const pumpRateBanner = (() => {
    if (!searchParams.pump_id) return null;
    const cur = logsArray.find(
      (l) => l.id === searchParams.pump_id && l.subtype === "pumping",
    );
    if (!cur) return null;
    const sideMins = (start: string | null, end: string | null) => {
      if (!start || !end) return 0;
      return Math.max(
        0,
        (new Date(end).getTime() - new Date(start).getTime()) / 60000,
      );
    };
    const totalMl =
      (cur.amount_l_ml ?? 0) + (cur.amount_r_ml ?? 0);
    const totalMin =
      sideMins(cur.start_l_at, cur.end_l_at) +
      sideMins(cur.start_r_at, cur.end_r_at);
    if (totalMl <= 0 || totalMin <= 0) return null;
    const curRate = totalMl / totalMin;
    // Last 5 prior pumpings (excluding current)
    const prior = logsArray
      .filter(
        (l) =>
          l.subtype === "pumping" &&
          l.id !== searchParams.pump_id &&
          l.end_timestamp != null,
      )
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, 5);
    const priorRates: number[] = [];
    for (const p of prior) {
      const ml = (p.amount_l_ml ?? 0) + (p.amount_r_ml ?? 0);
      const min =
        sideMins(p.start_l_at, p.end_l_at) +
        sideMins(p.start_r_at, p.end_r_at);
      if (ml > 0 && min > 0) priorRates.push(ml / min);
    }
    const avgPrior =
      priorRates.length > 0
        ? priorRates.reduce((s, r) => s + r, 0) / priorRates.length
        : null;
    return {
      curRate,
      curMl: totalMl,
      curMin: Math.round(totalMin),
      avgPrior,
      priorCount: priorRates.length,
    };
  })();

  // For Mode Jam + Sejak Terakhir cards: sleep "since" anchor = end
  // time (waktu bangun), not start. For currently-ongoing sleep,
  // surface "sedang berjalan". Aligns Mode Jam with regular SinceCard.
  const sleepSinceText = (() => {
    if (!last.sleep) return null;
    if (last.sleep.end_timestamp == null) return "sedang berjalan";
    return timeSince(last.sleep.end_timestamp);
  })();
  // Wake window assessment — counts minutes since last sleep ended,
  // bucketed by baby age. Surfaces 'overtired risk' when awake too long.
  const wakeAssessment = (() => {
    if (!last.sleep || !last.sleep.end_timestamp) return null;
    const awakeMin = Math.max(
      0,
      Math.round(
        (Date.now() - new Date(last.sleep.end_timestamp).getTime()) / 60000,
      ),
    );
    const window = getWakeWindow(baby.dob);
    return assessWake(awakeMin, window);
  })();
  // Sleep regression — banner saat in-window OR upcoming dalam 14 hari
  const sleepRegression = getCurrentRegression(baby.dob);
  // Realtime sleep coach advice — compact pill di top, full detail di
  // /sleep-coach page.
  const realtimeAdvice = computeRealtimeAdvice(logsArray, baby.dob);
  // Cry diagnostic — rank kemungkinan penyebab nangis dari log terbaru
  const lastTemp =
    logsArray.find((l) => l.subtype === "temp") ?? null;
  const lastBath =
    logsArray.find((l) => l.subtype === "bath") ?? null;
  const lastTummy =
    logsArray.find((l) => l.subtype === "tummy") ?? null;
  const isSleepOngoing = ongoingSubtypes.has("sleep");
  const ageDays = Math.floor(
    (Date.now() - new Date(baby.dob).getTime()) / 86400000,
  );
  const cryCauses = computeCryCauses({
    lastFeeding: last.feeding,
    lastDiaper: last.diaper,
    lastTemp,
    lastBath,
    lastTummy,
    wakeAssessment,
    isSleepOngoing,
    ageDays,
  });

  // Top-up suggestion after DBF Selesai. dbf_id + dbf_dur passed via
  // redirect from endOngoingDbfAction. Looks up effectiveness from the
  // row, computes suggestion using dbf-effectiveness research model.
  const topUpSuggestion = (() => {
    const dbfId = searchParams.dbf_id;
    const dbfDur = Number(searchParams.dbf_dur ?? 0);
    if (!dbfId || !Number.isFinite(dbfDur) || dbfDur <= 0) return null;
    if (searchParams.topup_skip === "1") return null;
    const dbfRow = logsArray.find((l) => l.id === dbfId);
    if (!dbfRow || dbfRow.subtype !== "feeding") return null;
    const effectiveness = (dbfRow.effectiveness ??
      null) as EffectivenessLevel | null;
    return suggestTopUp({
      durationMins: dbfDur,
      baseRate: dbfEst.mlPerMin,
      effectiveness,
      milkTargetMin: milkTarget.min,
      target,
    });
  })();
  // When DBF was sufficient (no top-up suggested) but user just ended
  // a session, surface an "OK, no top-up needed" info banner so they
  // don't wonder "kok ngga ada saran ya?".
  const topUpInfo = (() => {
    if (topUpSuggestion) return null;
    const dbfId = searchParams.dbf_id;
    const dbfDur = Number(searchParams.dbf_dur ?? 0);
    if (!dbfId || !Number.isFinite(dbfDur) || dbfDur <= 0) return null;
    if (searchParams.topup_skip === "1") return null;
    const dbfRow = logsArray.find((l) => l.id === dbfId);
    if (!dbfRow || dbfRow.subtype !== "feeding") return null;
    const eff = (dbfRow.effectiveness ?? null) as EffectivenessLevel | null;
    const factor = eff
      ? eff === "efektif"
        ? 1.0
        : eff === "sedang"
          ? 0.8
          : 0.6
      : 1.0;
    const effectiveMl = Math.round(dbfDur * dbfEst.mlPerMin * factor);
    const feedsPerDay =
      target.ageDaysMax <= 30
        ? 10
        : target.ageDaysMax <= 90
          ? 7
          : target.ageDaysMax <= 180
            ? 6
            : 5;
    const expectedPerFeed = Math.round(milkTarget.min / feedsPerDay);
    return { effectiveMl, expectedPerFeed };
  })();
  const dbfRowEffectiveness = (() => {
    if (!searchParams.dbf_id) return null;
    const row = logsArray.find((l) => l.id === searchParams.dbf_id);
    return (row?.effectiveness ?? null) as EffectivenessLevel | null;
  })();
  // Tampungan (Haakaa) prompt: only show when DBF was single-side (the
  // OTHER side is the one that may have dripped into a collector cup).
  // Both-sides DBF can't have a tampungan (no free side), nor can sessions
  // already paired with an ongoing pumping. User can dismiss via Skip
  // (?tampungan_skip=1) without affecting top-up/lanjut-tidur banners.
  const tampunganSide: "kiri" | "kanan" | null = (() => {
    if (!searchParams.dbf_id) return null;
    if (searchParams.tampungan_skip === "1") return null;
    if (ongoingSubtypes.has("pumping")) return null;
    const row = logsArray.find((l) => l.id === searchParams.dbf_id);
    if (!row || row.subtype !== "feeding") return null;
    const usedL = !!row.start_l_at;
    const usedR = !!row.start_r_at;
    if (usedL && !usedR) return "kanan";
    if (usedR && !usedL) return "kiri";
    return null;
  })();
  // Lanjut tidur button: show after DBF Selesai if there's no ongoing sleep.
  const showLanjutTidur =
    !!searchParams.dbf_id && !ongoingSubtypes.has("sleep");

  // Build a URL that preserves the post-DBF context (dbf_id + dbf_dur) so
  // dismissing one banner doesn't tear down the others.
  const postDbfHref = (extra: Record<string, string>) => {
    const params = new URLSearchParams();
    if (searchParams.dbf_id) params.set("dbf_id", searchParams.dbf_id);
    if (searchParams.dbf_dur) params.set("dbf_dur", searchParams.dbf_dur);
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
    return `/?${params.toString()}`;
  };

  const activeHandover = activeHandoverData as
    | {
        id: string;
        started_by: string;
        started_by_email: string;
        started_at: string;
      }
    | null;
  const handoverByMe = !!activeHandover && activeHandover.started_by === user.id;
  const handoverSummary = activeHandover
    ? summarizeHandoverActivity(logsArray, activeHandover.started_at)
    : null;
  const handoverDurationMins = activeHandover
    ? Math.round(
        (Date.now() - new Date(activeHandover.started_at).getTime()) / 60000,
      )
    : 0;
  const handoverPartnerName = activeHandover
    ? nameFromEmail(activeHandover.started_by_email)
    : null;
  const householdPartner = (() => {
    const members = householdMembersData as
      | { user_id: string; email: string }[]
      | null;
    if (!members) return null;
    const other = members.find((m) => m.user_id !== user.id);
    return other ? { user_id: other.user_id, email: other.email } : null;
  })();
  const partnerDisplayName = householdPartner
    ? nameFromEmail(householdPartner.email)
    : null;

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
  // Pumping reminder: 3j sejak last pumping selesai. Lactation
  // recommendation: pump every 2-3h supaya supply maintained.
  const lastPumpEnded = (() => {
    const completed = logsArray.filter(
      (l) => l.subtype === "pumping" && l.end_timestamp != null,
    );
    if (completed.length === 0) return null;
    return completed.reduce((latest, l) => {
      const t = new Date(l.end_timestamp!).getTime();
      return t > latest ? t : latest;
    }, 0);
  })();
  const pumpingReminder = (() => {
    if (lastPumpEnded == null) return null;
    if (ongoingSubtypes.has("pumping")) return null;
    const minsSince = (Date.now() - lastPumpEnded) / 60000;
    if (minsSince < 180) return null;
    const hours = Math.floor(minsSince / 60);
    const mins = Math.round(minsSince % 60);
    return {
      text: `Sudah ${hours}j ${mins}m sejak pump terakhir — supply maintain tiap 2-3j`,
      tone: minsSince >= 270 ? ("urgent" as const) : ("warning" as const),
    };
  })();
  // Active pumping check: kalau pumping ongoing lebih dari 30m, tampilkan
  // confirmation banner. User bisa Selesai sekarang atau abaikan
  // (pause/Selesai manual handled by OngoingCard).
  const longPumpOngoing = (() => {
    const ongoing = logsArray.find(
      (l) =>
        l.subtype === "pumping" &&
        l.end_timestamp == null &&
        l.started_with_stopwatch,
    );
    if (!ongoing) return null;
    const minsRunning =
      (Date.now() - new Date(ongoing.timestamp).getTime()) / 60000;
    if (minsRunning < 30) return null;
    return {
      id: ongoing.id,
      minsRunning: Math.round(minsRunning),
    };
  })();
  // (diaper computed later)
  // We'll assemble darkReminders below after diaperReminder is computed.
  // Diaper reminder: warn at 4h, urgent at 6h. Newborn pee target ~6-8×
  // per day → ~3-4h average gap. >4h is worth checking.
  const diaperReminder = (() => {
    if (!last.diaper) return null;
    const minsSince =
      (Date.now() - new Date(last.diaper.timestamp).getTime()) / 60000;
    if (minsSince < 240) return null;
    const hours = Math.floor(minsSince / 60);
    const mins = Math.round(minsSince % 60);
    const text = `Cek diaper — sudah ${hours}j ${mins}m`;
    return {
      text,
      tone: minsSince >= 360 ? ("urgent" as const) : ("warning" as const),
    };
  })();
  // Unified reminders array untuk dark mode (Mode Jam + NightLamp).
  // Show feeding/diaper/pumping warnings supaya parent yang sedang
  // monitoring dark mode tetap aware tanpa keluar mode.
  const darkReminders: { text: string; tone: "warning" | "urgent"; emoji?: string }[] =
    [];
  if (feedingReminder)
    darkReminders.push({ ...feedingReminder, emoji: "🍼" });
  if (diaperReminder)
    darkReminders.push({ ...diaperReminder, emoji: "🧷" });
  if (pumpingReminder)
    darkReminders.push({ ...pumpingReminder, emoji: "💧" });
  const activeAct = parseAct(searchParams.act);
  // Filter logs by selected day:
  // - Today + no filter: 36-hour rolling window (default home view)
  // - Today + act filter: only today's category-filtered logs
  // - Past day: that day's logs (filtered or not)
  const dayFiltered =
    isToday && !activeAct
      ? logsArray
      : logsArray.filter((l) => {
          const t = new Date(l.timestamp).getTime();
          return t >= selectedDayMs && t < selectedDayMs + 86400000;
        });
  const filteredLogs = activeAct
    ? dayFiltered.filter((l) => matchesAct(l, activeAct))
    : dayFiltered;
  const recent = filteredLogs.slice(0, activeAct || !isToday ? 30 : 6);

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
      <LogsRealtime babyId={baby.id} householdId={household.household_id} />
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
        <IdleClockToggle
          variant="icon"
          sinceFeeding={
            last.feeding ? timeSince(last.feeding.timestamp) : null
          }
          sinceSleep={sleepSinceText}
          sinceDiaper={last.diaper ? timeSince(last.diaper.timestamp) : null}
          reminder={feedingReminder}
          reminders={darkReminders}
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
        <Link
          href="/more/profile"
          className="text-xs text-rose-600 hover:underline"
        >
          Edit
        </Link>
      </header>

      {activeHandover ? (
        // Unified banner — always shows the recap regardless of which user
        // is logged in. iPad use case: shared device, partner returns and
        // taps banner directly (no need to switch login). Title + button
        // use sleeper's name (or "kamu" for self) so context is clear.
        (() => {
          const sleeperName = handoverByMe
            ? "kamu"
            : (handoverPartnerName ?? "Partner");
          const buttonName = handoverByMe
            ? "Saya"
            : (handoverPartnerName ?? "Partner");
          return (
            <section className="flash-in mt-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
              <div className="flex items-start gap-2">
                <span className="text-xl" aria-hidden>
                  🌙
                </span>
                <div className="flex-1">
                  <div className="text-sm font-bold text-indigo-900">
                    Yang terjadi sejak {sleeperName} tidur
                  </div>
                  <div className="text-[11px] text-indigo-700/80">
                    Tidur sejak {fmtTime(activeHandover.started_at)} ·{" "}
                    {fmtDuration(handoverDurationMins)}
                  </div>
                  {handoverSummary && handoverSummary.bullets.length > 0 ? (
                    <div className="mt-2 space-y-0.5 text-[12px] text-indigo-900">
                      {handoverSummary.bullets.map((b, i) => (
                        <div key={i}>· {b}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-[12px] italic text-indigo-700/80">
                      Belum ada catatan.
                    </div>
                  )}
                  {handoverSummary && handoverSummary.recent.length > 0 ? (
                    <details className="mt-2 text-[11px]">
                      <summary className="cursor-pointer text-indigo-700/80 hover:text-indigo-900">
                        Lihat detail ({handoverSummary.total})
                      </summary>
                      <div className="mt-1 space-y-0.5 text-indigo-800/90">
                        {handoverSummary.recent.map((r, i) => (
                          <div key={i}>
                            <span className="font-medium text-indigo-700">
                              {r.time}
                            </span>{" "}
                            · {r.text}
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  <form action={endHandoverAction} className="mt-3">
                    <input type="hidden" name="id" value={activeHandover.id} />
                    <input type="hidden" name="return_to" value="/" />
                    <SubmitButton
                      pendingText="…"
                      className="w-full rounded-xl bg-indigo-500 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-600"
                    >
                      ✓ {buttonName} sudah bangun
                    </SubmitButton>
                  </form>
                </div>
              </div>
            </section>
          );
        })()
      ) : null}
      {welcomeMsg ? (
        <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-800">
          {welcomeMsg}
        </div>
      ) : null}
      {searchParams.handover === "ended" ? (
        <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800">
          ✓ Sudah ditandai bangun.
        </div>
      ) : null}
      {logerror ? (
        <div className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">
          {logerror}
        </div>
      ) : null}
      <CryDiagnostic
        causes={cryCauses}
        asiBatches={asiBatchOptions}
        babyName={baby.name}
      />
      <Link
        href="/sleep-coach"
        className={`mt-3 flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-xs shadow-sm hover:opacity-90 ${
          realtimeAdvice.tone === "alert"
            ? "border-red-200 bg-red-50/70 text-red-900"
            : realtimeAdvice.tone === "warn"
              ? "border-amber-200 bg-amber-50/70 text-amber-900"
              : "border-emerald-200 bg-emerald-50/50 text-emerald-900"
        }`}
      >
        <span className="text-base" aria-hidden>
          {realtimeAdvice.emoji}
        </span>
        <span className="flex-1">
          <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-70">
            Sleep Coach
          </span>
          <span className="block font-semibold">{realtimeAdvice.primary}</span>
        </span>
        <span className="text-[10px] opacity-60">→</span>
      </Link>
      {wakeAssessment ? <WakeWindowCard assessment={wakeAssessment} /> : null}
      {feedingReminder ||
      diaperReminder ||
      pumpingReminder ||
      longPumpOngoing ? (
        <div className="mt-3 space-y-1.5">
          {feedingReminder ? (
            <div
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                feedingReminder.tone === "urgent"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              <span aria-hidden>🍼</span>
              <span>{feedingReminder.text}</span>
            </div>
          ) : null}
          {diaperReminder ? (
            <div
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                diaperReminder.tone === "urgent"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              <span aria-hidden>🧷</span>
              <span>{diaperReminder.text}</span>
            </div>
          ) : null}
          {pumpingReminder ? (
            <div
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                pumpingReminder.tone === "urgent"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              <span aria-hidden>💧</span>
              <span>{pumpingReminder.text}</span>
            </div>
          ) : null}
          {longPumpOngoing ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">
              <span className="flex items-center gap-2">
                <span aria-hidden>💧</span>
                <span>
                  Pumping sudah {longPumpOngoing.minsRunning}m · masih jalan?
                </span>
              </span>
              <Link
                href="#aktivitas"
                className="rounded-full border border-blue-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
              >
                Selesai
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
      {sleepRegression ? (
        <details
          className={`mt-3 rounded-2xl border px-4 py-3 shadow-sm ${
            sleepRegression.status === "in_window"
              ? "border-purple-200 bg-purple-50"
              : "border-indigo-100 bg-indigo-50/40"
          }`}
        >
          <summary className="cursor-pointer list-none">
            <div className="flex items-start gap-2">
              <span aria-hidden className="text-xl">
                {sleepRegression.regression.emoji}
              </span>
              <div className="flex-1">
                <div
                  className={`text-sm font-bold ${
                    sleepRegression.status === "in_window"
                      ? "text-purple-900"
                      : "text-indigo-900"
                  }`}
                >
                  {sleepRegression.status === "in_window"
                    ? `🚨 Sedang di window: ${sleepRegression.regression.label}`
                    : `Heads-up: ${sleepRegression.regression.label} dalam ${sleepRegression.daysUntil} hari`}
                </div>
                <div
                  className={`text-[11px] ${
                    sleepRegression.status === "in_window"
                      ? "text-purple-700"
                      : "text-indigo-700/80"
                  }`}
                >
                  Durasi typical {sleepRegression.regression.durationWeeks} ·
                  tap untuk detail
                </div>
              </div>
            </div>
          </summary>
          <div className="mt-3 space-y-2 text-[12px] text-gray-700">
            <div>
              <div className="font-semibold text-gray-900">Penyebab</div>
              <p className="mt-0.5 leading-snug">
                {sleepRegression.regression.cause}
              </p>
            </div>
            <div>
              <div className="font-semibold text-gray-900">Tips</div>
              <ul className="mt-0.5 space-y-0.5">
                {sleepRegression.regression.tips.map((t, i) => (
                  <li key={i} className="leading-snug">
                    · {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      ) : null}
      {pumpRateBanner ? (
        (() => {
          const r = pumpRateBanner;
          let trend: { text: string; cls: string } | null = null;
          if (r.avgPrior != null && r.avgPrior > 0) {
            const delta = (r.curRate - r.avgPrior) / r.avgPrior;
            const pct = Math.round(Math.abs(delta) * 100);
            if (delta > 0.05) {
              trend = {
                text: `↑ ${pct}% lebih tinggi dari avg ${r.priorCount} pump terakhir (${r.avgPrior.toFixed(1)} ml/m)`,
                cls: "text-emerald-700",
              };
            } else if (delta < -0.05) {
              trend = {
                text: `↓ ${pct}% lebih rendah dari avg ${r.priorCount} pump terakhir (${r.avgPrior.toFixed(1)} ml/m)`,
                cls: "text-amber-700",
              };
            } else {
              trend = {
                text: `≈ Sama dgn avg ${r.priorCount} pump terakhir (${r.avgPrior.toFixed(1)} ml/m)`,
                cls: "text-gray-600",
              };
            }
          }
          return (
            <div className="flash-in mt-3 rounded-2xl border border-sky-200 bg-sky-50 p-3 shadow-sm">
              <div className="text-sm font-semibold text-sky-900">
                💧 Pumping selesai · {r.curMl} ml / {r.curMin}m ={" "}
                {r.curRate.toFixed(1)} ml/m
              </div>
              {trend ? (
                <div className={`mt-0.5 text-[12px] ${trend.cls}`}>
                  {trend.text}
                </div>
              ) : (
                <div className="mt-0.5 text-[11px] text-sky-700/70">
                  (Belum cukup data untuk perbandingan — butuh ≥1 pump
                  sebelumnya yang punya ml + duration)
                </div>
              )}
            </div>
          );
        })()
      ) : null}
      {topUpSuggestion ? (
        <div className="flash-in mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-start gap-2">
            <span aria-hidden className="text-xl">
              💡
            </span>
            <div className="flex-1 text-sm text-amber-900">
              <div className="font-semibold">
                Saran top-up ≈{topUpSuggestion.recommendMl} ml
              </div>
              <div className="mt-0.5 text-[12px] leading-snug text-amber-800/90">
                DBF{" "}
                {dbfRowEffectiveness
                  ? `${EFFECTIVENESS_EMOJIS[dbfRowEffectiveness]} ${EFFECTIVENESS_LABELS[dbfRowEffectiveness]}`
                  : "estimasi"}{" "}
                ≈{topUpSuggestion.effectiveMl} ml @ {dbfEst.mlPerMin.toFixed(1)} ml/m
                {" "}dari target per feed {topUpSuggestion.expectedPerFeed} ml.
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <LogModalTrigger
                  subtype="feeding"
                  asiBatches={asiBatchOptions}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm hover:bg-amber-100"
                >
                  🍼 Catat botol top-up
                </LogModalTrigger>
                <Link
                  href={postDbfHref({ topup_skip: "1" })}
                  className="inline-flex items-center rounded-full px-3 py-1.5 text-xs text-amber-700/70 hover:text-amber-900"
                >
                  Skip
                </Link>
              </div>
              <p className="mt-2 text-[10px] leading-snug text-amber-700/70">
                Saran berbasis WHO/AAP/IDAI per-kg/hari × usia ÷ feeds/hari.
                Bukan instruksi medis — ikuti panduan DSA.
              </p>
            </div>
          </div>
        </div>
      ) : topUpInfo ? (
        <div className="flash-in mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
          <div className="flex items-start gap-2">
            <span aria-hidden className="text-lg">
              ✓
            </span>
            <div className="flex-1 text-sm text-emerald-900">
              <div className="font-semibold">Tidak perlu top-up</div>
              <div className="mt-0.5 text-[11px] leading-snug text-emerald-800/90">
                DBF{" "}
                {dbfRowEffectiveness
                  ? `${EFFECTIVENESS_EMOJIS[dbfRowEffectiveness]} ${EFFECTIVENESS_LABELS[dbfRowEffectiveness]}`
                  : "estimasi"}{" "}
                ≈{topUpInfo.effectiveMl} ml — sudah dekat target per feed
                ≈{topUpInfo.expectedPerFeed} ml.
              </div>
              <div className="mt-1.5">
                <Link
                  href={postDbfHref({ topup_skip: "1" })}
                  className="text-[11px] text-emerald-700/70 hover:text-emerald-900"
                >
                  Tutup
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tampunganSide ? (
        <form
          action={logDbfTampunganAction}
          className="flash-in mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm"
        >
          <input type="hidden" name="dbf_id" value={searchParams.dbf_id} />
          <input type="hidden" name="side" value={tampunganSide} />
          <input
            type="hidden"
            name="return_to"
            value={postDbfHref({ tampungan_skip: "1" })}
          />
          <div className="flex items-start gap-2">
            <span aria-hidden className="text-xl">
              💧
            </span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-blue-900">
                Tampungan sisi {tampunganSide} (Haakaa)?
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-blue-800/80">
                Letdown reflex sering bikin sisi yang tidak diisap juga
                menetes. Kalau ada tampungan, langsung masuk ke stock ASI.
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  name="ml"
                  required
                  defaultValue=""
                  className="w-28 appearance-none rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-sm font-semibold tabular-nums text-blue-900 outline-none focus:border-blue-400"
                >
                  <option value="" disabled>
                    pilih ml…
                  </option>
                  {Array.from({ length: 200 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} ml
                    </option>
                  ))}
                </select>
                <SubmitButton
                  pendingText="…"
                  className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
                >
                  Simpan ke stock
                </SubmitButton>
                <Link
                  href={postDbfHref({ tampungan_skip: "1" })}
                  className="text-xs text-blue-700/70 hover:text-blue-900"
                >
                  Skip
                </Link>
              </div>
            </div>
          </div>
        </form>
      ) : null}

      {showLanjutTidur ? (
        <form
          action={startOngoingLogAction}
          className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-3 shadow-sm"
        >
          <input type="hidden" name="subtype" value="sleep" />
          <input type="hidden" name="start_offset_min" value="0" />
          <input type="hidden" name="return_to" value="/?darklamp=sleep" />
          <SubmitButton
            pendingText="…"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-600"
          >
            <span aria-hidden>😴</span>
            Lanjut tidur sekarang
          </SubmitButton>
        </form>
      ) : null}

      {ongoing.length > 0 ? (
        <section className="mt-5 space-y-2">
          {ongoing.map((l, idx) => {
            const cardSubtype:
              | "sleep"
              | "pumping"
              | "dbf"
              | "hiccup"
              | "tummy" =
              l.subtype === "feeding"
                ? "dbf"
                : (l.subtype as "sleep" | "pumping" | "hiccup" | "tummy");
            // Auto-open dark lamp once after manual sleep submit with
            // empty Bangun. Match by subtype, only first such row.
            const shouldAutoOpenLamp =
              idx === 0 &&
              searchParams.darklamp === "sleep" &&
              cardSubtype === "sleep";
            const lastEndedMs = lastEnded[cardSubtype];
            const startMs = new Date(l.timestamp).getTime();
            const gapMin =
              lastEndedMs != null && lastEndedMs < startMs
                ? Math.round((startMs - lastEndedMs) / 60000)
                : null;
            const prevEndedGapLabel =
              gapMin != null && gapMin > 0 && gapMin <= 24 * 60
                ? fmtGap(gapMin)
                : null;
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
                otherPumpingOngoing={ongoingSubtypes.has("pumping")}
                reminders={darkReminders}
                prevEndedGapLabel={prevEndedGapLabel}
              />
            );
          })}
        </section>
      ) : null}

      <section className="mt-5">
        <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700">
          Mulai Sekarang
        </h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {!ongoingSubtypes.has("sleep") ? (
            <StartOngoingButton
              subtype="sleep"
              label="Tidur"
              emoji="😴"
              lastEndedLabel={fmtSelesaiLalu(lastEnded.sleep, nowMsForGap)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-rose-100 bg-rose-50/40 p-3 text-rose-400">
              <span className="text-2xl" aria-hidden>
                😴
              </span>
              <span className="text-[11px] font-semibold text-center leading-tight">
                Tidur berlangsung
              </span>
            </div>
          )}
          {!ongoingSubtypes.has("dbf") ? (
            <StartOngoingButton
              subtype="feeding"
              label="DBF"
              emoji="🤱"
              pumpingOngoing={ongoingSubtypes.has("pumping")}
              lastEndedLabel={fmtSelesaiLalu(lastEnded.dbf, nowMsForGap)}
            />
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
          <CupFeedTrigger
            cupPace={getCupFeedPace(baby.dob)}
            bottlePace={getBottleFeedPace(baby.dob)}
            className="flex w-full flex-col items-center gap-0.5 rounded-2xl border border-rose-200 bg-white p-3 shadow-sm transition-transform active:scale-95"
          >
            <span className="text-2xl" aria-hidden>
              🍼
            </span>
            <span className="text-[11px] font-semibold text-rose-700">
              Sufor/Cup
            </span>
            <span className="text-[9px] font-medium text-gray-400">
              bikin + paced
            </span>
          </CupFeedTrigger>
          {!ongoingSubtypes.has("pumping") ? (
            <StartOngoingButton
              subtype="pumping"
              label="Pumping"
              emoji="💧"
              lastEndedLabel={fmtSelesaiLalu(lastEnded.pumping, nowMsForGap)}
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
              emoji="🫨"
              lastEndedLabel={fmtSelesaiLalu(lastEnded.hiccup, nowMsForGap)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-rose-100 bg-rose-50/40 p-3 text-rose-400">
              <span className="text-2xl" aria-hidden>
                🫨
              </span>
              <span className="text-[11px] font-semibold text-center leading-tight">
                Cegukan berlangsung
              </span>
            </div>
          )}
          {!ongoingSubtypes.has("tummy") ? (
            <StartOngoingButton
              subtype="tummy"
              label="Tummy"
              emoji="🐢"
              lastEndedLabel={fmtSelesaiLalu(lastEnded.tummy, nowMsForGap)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-rose-100 bg-rose-50/40 p-3 text-rose-400">
              <span className="text-2xl" aria-hidden>
                🐢
              </span>
              <span className="text-[11px] font-semibold text-center leading-tight">
                Tummy berlangsung
              </span>
            </div>
          )}
        </div>
        {!activeHandover ? (
          <div
            className={`mt-2 grid gap-2 ${householdPartner ? "grid-cols-2" : "grid-cols-1"}`}
          >
            <form action={startHandoverAction}>
              <input type="hidden" name="return_to" value="/" />
              <SubmitButton
                pendingText="…"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white py-2 text-xs font-semibold text-indigo-600 shadow-sm hover:bg-indigo-50"
              >
                <span aria-hidden>🌙</span>
                Saya tidur dulu
              </SubmitButton>
            </form>
            {householdPartner ? (
              <form action={startHandoverAction}>
                <input type="hidden" name="return_to" value="/" />
                <input
                  type="hidden"
                  name="sleeper_id"
                  value={householdPartner.user_id}
                />
                <SubmitButton
                  pendingText="…"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white py-2 text-xs font-semibold text-indigo-600 shadow-sm hover:bg-indigo-50"
                >
                  <span aria-hidden>🌙</span>
                  {partnerDisplayName} tidur dulu
                </SubmitButton>
              </form>
            ) : null}
          </div>
        ) : null}
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

      <RoutineChecklist
        routines={(routinesData ?? []) as RoutineItem[]}
        todayLogs={(routineLogsTodayData ?? []) as RoutineLogToday[]}
      />

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-semibold text-gray-700">
            {isToday ? "Total Hari Ini" : `Total ${selectedDayLabel}`}
          </h2>
          <div className="flex items-center gap-1">
            <Link
              href={`/?date=${dayPrev}`}
              className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
              aria-label="Hari sebelumnya"
            >
              ‹
            </Link>
            <span className="min-w-[80px] text-center text-[11px] text-gray-500">
              {selectedDayLabel}
            </span>
            <Link
              href={`/?date=${dayNext}`}
              className={`rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50 ${isToday ? "pointer-events-none opacity-30" : ""}`}
              aria-label="Hari berikutnya"
              aria-disabled={isToday}
            >
              ›
            </Link>
            {!isToday ? (
              <Link
                href="/"
                className="ml-1 text-[11px] font-semibold text-rose-600 hover:underline"
              >
                Hari ini
              </Link>
            ) : null}
          </div>
        </div>
        <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="-mt-1 mb-1 px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              👶 {baby.name}
            </span>
          </div>
          {(() => {
            // Avg interval helper. Compute mean gap between consecutive
            // events of given subtype in selected day. Returns null if
            // <2 events (no gap to measure).
            const avgIntervalMin = (
              filter: (l: LogRow) => boolean,
            ): number | null => {
              const startMs = avgWindowMs;
              const endMs = startMs + 86400000;
              const ts = logsArray
                .filter(filter)
                .map((l) => new Date(l.timestamp).getTime())
                .filter((t) => t >= startMs && t < endMs)
                .sort((a, b) => a - b);
              if (ts.length < 2) return null;
              const gaps: number[] = [];
              for (let i = 1; i < ts.length; i++) {
                const a = ts[i - 1];
                const b = ts[i];
                if (a !== undefined && b !== undefined)
                  gaps.push((b - a) / 60000);
              }
              if (gaps.length === 0) return null;
              return gaps.reduce((s, g) => s + g, 0) / gaps.length;
            };
            // Sleep avg per sesi pakai 24h window juga (more representative).
            const sleep24h = logsArray.filter((l) => {
              if (l.subtype !== "sleep") return false;
              const t = new Date(l.timestamp).getTime();
              return t >= avgWindowMs && t < avgWindowMs + 86400000;
            });
            const sleep24hMins = sleep24h.reduce((sum, l) => {
              if (!l.end_timestamp) return sum;
              return (
                sum +
                (new Date(l.end_timestamp).getTime() -
                  new Date(l.timestamp).getTime()) /
                  60000
              );
            }, 0);
            const sleep24hAvgPerSession =
              sleep24h.length > 0 ? sleep24hMins / sleep24h.length : 0;
            // Avg wake time = avg gap antara sleep end → next sleep start
            // dalam 24h window. Useful untuk lihat pola "jaga" rata-rata.
            const sleep24hSorted = [...sleep24h]
              .filter((l) => l.end_timestamp)
              .sort(
                (a, b) =>
                  new Date(a.timestamp).getTime() -
                  new Date(b.timestamp).getTime(),
              );
            const wakeGaps: number[] = [];
            for (let i = 1; i < sleep24hSorted.length; i++) {
              const prev = sleep24hSorted[i - 1];
              const cur = sleep24hSorted[i];
              if (prev?.end_timestamp && cur) {
                const gap =
                  (new Date(cur.timestamp).getTime() -
                    new Date(prev.end_timestamp).getTime()) /
                  60000;
                if (gap > 0 && gap < 12 * 60) wakeGaps.push(gap); // cap 12h
              }
            }
            const avgWakeMin =
              wakeGaps.length > 0
                ? wakeGaps.reduce((s, g) => s + g, 0) / wakeGaps.length
                : null;
            const avgIntervalText = (mins: number | null): string => {
              if (mins == null) return "";
              const h = Math.floor(mins / 60);
              const m = Math.round(mins % 60);
              if (h === 0) return `${m}m`;
              if (m === 0) return `${h}j`;
              return `${h}j ${m}m`;
            };
            const peeAvg = avgIntervalMin(
              (l) => l.subtype === "diaper" && !!l.has_pee,
            );
            // Poop avg pakai 7-day window (separate query) — newborn
            // BAB sering 0-2× per hari, today-only sample terlalu kecil.
            const poopAvg = (() => {
              const ts = (poop7dData ?? [])
                .map((p) => new Date(p.timestamp).getTime())
                .sort((a, b) => a - b);
              if (ts.length < 2) return null;
              const gaps: number[] = [];
              for (let i = 1; i < ts.length; i++) {
                const a = ts[i - 1];
                const b = ts[i];
                if (a !== undefined && b !== undefined)
                  gaps.push((b - a) / 60000);
              }
              if (gaps.length === 0) return null;
              return gaps.reduce((s, g) => s + g, 0) / gaps.length;
            })();
            // Reused below; kept for clarity. (avg = 24h window above.)
            return (
              <>
                <StatRow
                  label="🍼 Susu"
                  value={`${milkTotalMl} ml`}
                  sub={`${milkTarget.min}–${milkTarget.max} ml`}
                  progressSegments={[
                    {
                      value: susuBreakdown.asi,
                      color: "bg-rose-400",
                      divisor: milkTarget.min,
                    },
                    {
                      value: susuBreakdown.sufor,
                      color: "bg-amber-400",
                      divisor: milkTarget.min,
                    },
                  ]}
                  detail={[susuSourceBreakdown, milkBreakdown].filter(
                    (v): v is string => Boolean(v),
                  )}
                  href="/?act=bottle#aktivitas"
                  active={activeAct === "bottle"}
                  trendAnchor="susu"
                />
                <StatRow
                  label="😴 Tidur"
                  value={fmtDuration(stats.sleepMin)}
                  sub={`${target.sleepHoursMin}–${target.sleepHoursMax} jam`}
                  progress={stats.sleepMin / 60 / target.sleepHoursMin}
                  detail={
                    stats.sleepCount > 0
                      ? [
                          `${stats.sleepCount} sesi · avg ${fmtDuration(Math.round(sleep24hAvgPerSession))}/sesi`,
                          avgWakeMin != null
                            ? `avg wake ${avgIntervalText(avgWakeMin)} antar tidur`
                            : "",
                        ].filter(Boolean)
                      : undefined
                  }
                  href="/?act=sleep#aktivitas"
                  active={activeAct === "sleep"}
                  trendAnchor="tidur"
                />
                <StatRow
                  label="💛 Pipis"
                  value={`${stats.diaperPeeCount}×`}
                  sub={`${target.peeMin}–${target.peeMax}×`}
                  progress={stats.diaperPeeCount / target.peeMin}
                  detail={
                    peeAvg != null
                      ? `avg ${avgIntervalText(peeAvg)} antar pipis`
                      : undefined
                  }
                  href="/?act=diaper#aktivitas"
                  active={activeAct === "diaper"}
                  trendAnchor="diaper"
                />
                <StatRow
                  label="💩 BAB"
                  value={`${stats.diaperPoopCount}×`}
                  sub={`${target.poopMin}–${target.poopMax}×`}
                  progress={stats.diaperPoopCount / target.poopMin}
                  detail={
                    poopAvg != null
                      ? `avg ${avgIntervalText(poopAvg)} antar BAB`
                      : undefined
                  }
                  href="/?act=diaper#aktivitas"
                  active={activeAct === "diaper"}
                  trendAnchor="diaper"
                />
              </>
            );
          })()}
          {stats.pumpCount > 0 ||
          totalBoobsLMin > 0 ||
          totalBoobsRMin > 0 ? (
            <>
              <div className="border-t border-gray-100 pt-3 px-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  🤱 Putri (produksi ASI)
                </span>
              </div>
              {(() => {
                const lRate =
                  stats.pumpMinL > 0 ? stats.pumpMlL / stats.pumpMinL : 0;
                const rRate =
                  stats.pumpMinR > 0 ? stats.pumpMlR / stats.pumpMinR : 0;
                const dbfEstL = Math.round(stats.dbfMinL * dbfEst.mlPerMin);
                const dbfEstR = Math.round(stats.dbfMinR * dbfEst.mlPerMin);
                const totalL = stats.pumpMlL + dbfEstL;
                const totalR = stats.pumpMlR + dbfEstR;
                const totalLMin = stats.pumpMinL + stats.dbfMinL;
                const totalRMin = stats.pumpMinR + stats.dbfMinR;
                return (
                  <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-2 text-[12px]">
                    <div />
                    <div className="text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      Kiri
                    </div>
                    <div className="text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      Kanan
                    </div>

                    <div className="self-start text-gray-600">Total</div>
                    <div className="text-right">
                      <div className="font-bold text-gray-900">
                        ≈{totalL} ml
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {totalLMin > 0 ? fmtDuration(totalLMin) : "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-900">
                        ≈{totalR} ml
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {totalRMin > 0 ? fmtDuration(totalRMin) : "—"}
                      </div>
                    </div>

                    <Link
                      href="/?act=pumping#aktivitas"
                      className={`self-start hover:text-rose-600 ${
                        activeAct === "pumping"
                          ? "font-semibold text-rose-600"
                          : "text-gray-600"
                      }`}
                    >
                      💧 Pumping
                      {stats.pumpCount > 0
                        ? ` (${stats.pumpCount}× · ${fmtDuration(stats.pumpMinL + stats.pumpMinR)})`
                        : ""}
                    </Link>
                    <div className="text-right">
                      <div className="font-medium text-gray-800">
                        {stats.pumpMlL} ml
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {stats.pumpMinL > 0
                          ? `${fmtDuration(stats.pumpMinL)} · ${lRate.toFixed(1)} ml/m`
                          : "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-gray-800">
                        {stats.pumpMlR} ml
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {stats.pumpMinR > 0
                          ? `${fmtDuration(stats.pumpMinR)} · ${rRate.toFixed(1)} ml/m`
                          : "—"}
                      </div>
                    </div>

                    <Link
                      href="/?act=dbf#aktivitas"
                      className={`self-start hover:text-rose-600 ${
                        activeAct === "dbf"
                          ? "font-semibold text-rose-600"
                          : "text-gray-600"
                      }`}
                    >
                      🤱 DBF
                      {stats.dbfCount > 0
                        ? ` (${stats.dbfCount}× · ${fmtDuration(stats.dbfMinTotal)})`
                        : ""}
                    </Link>
                    <div className="text-right">
                      <div className="font-medium text-gray-800">
                        ≈{dbfEstL} ml
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {stats.dbfMinL > 0 ? fmtDuration(stats.dbfMinL) : "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-gray-800">
                        ≈{dbfEstR} ml
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {stats.dbfMinR > 0 ? fmtDuration(stats.dbfMinR) : "—"}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          ) : null}
          <p className="border-t border-gray-100 pt-2 text-[10px] leading-snug text-gray-400">
            <span className="font-semibold">Target</span> WHO/IDAI/AAP usia{" "}
            {Math.floor(
              (Date.now() - new Date(baby.dob).getTime()) / 86400000,
            )}{" "}
            hari
            {milkTarget.source === "weight"
              ? `, ${target.milkMlPerKgMin}–${target.milkMlPerKgMax} ml/kg × ${currentWeightKg} kg`
              : ""}
            . <span className="font-semibold">DBF</span>{" "}
            {dbfEst.source === "multiplier" && dbfEst.pumpingRate != null
              ? `≈${dbfEst.mlPerMin.toFixed(1)} ml/m (${baby.dbf_pumping_multiplier}× pump ${dbfEst.pumpingRate.toFixed(1)})`
              : dbfEst.source === "fixed"
                ? `${dbfEst.mlPerMin} ml/m (fixed)`
                : dbfEst.source === "pumping"
                  ? `${dbfEst.mlPerMin.toFixed(1)} ml/m (pump terakhir)`
                  : `default ${dbfEst.mlPerMin} ml/m`}
            . <span className="font-semibold">Window</span> avg tidur/pipis
            = 24 jam, BAB = 7 hari, sesi feeding = gap ≤1 jam digabung.
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
            {isToday
              ? "Aktivitas Terbaru"
              : `Aktivitas ${selectedDayLabel}`}
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
        {activeAct === "dbf" && recent.length > 0 ? (
          <form
            action={bulkUpdateDbfRateAction}
            className="mb-2 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2"
          >
            <input
              type="hidden"
              name="ids"
              value={recent.map((l) => l.id).join(",")}
            />
            <input
              type="hidden"
              name="return_to"
              value="/?act=dbf#aktivitas"
            />
            <span className="text-[11px] font-semibold text-amber-800">
              Mass edit · {recent.length} row →
            </span>
            <input
              type="number"
              name="dbf_rate_override"
              step="0.1"
              min="0.1"
              max="30"
              inputMode="decimal"
              placeholder="ml/menit"
              className="w-24 flex-1 rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs outline-none focus:border-amber-400"
            />
            <SubmitButton
              pendingText="…"
              className="rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-600"
            >
              Terapkan
            </SubmitButton>
          </form>
        ) : null}
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
                  l.subtype === "feeding" ||
                  l.subtype === "hiccup" ||
                  l.subtype === "tummy";
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
                      {logDetail(l, dbfEst.mlPerMin, logsArray) ? (
                        <span className="truncate text-xs text-gray-500">
                          • {logDetail(l, dbfEst.mlPerMin, logsArray)}
                        </span>
                      ) : null}
                    </div>
                    {l.notes ? (
                      <div className="mt-1 italic text-[11px] text-gray-500">
                        “{l.notes}”
                      </div>
                    ) : null}
                    <div className="mt-0.5 text-[11px] text-gray-400">
                      {fmtTime(l.timestamp)} ·{" "}
                      {ongoing ? (
                        <span className="font-semibold text-rose-600">
                          {paused ? "dijeda" : "sedang berjalan"}
                        </span>
                      ) : (
                        timeSince(l.timestamp)
                      )}
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
          href={(() => {
            // Preserve home filter when jumping to /history. Map activeAct
            // to /history filter id (overlap on subtype names + bottle/dbf
            // both → feeding).
            if (!activeAct) return "/history";
            const map: Record<string, string> = {
              bottle: "feeding",
              dbf: "feeding",
              sleep: "sleep",
              pumping: "pumping",
              diaper: "diaper",
            };
            const f = map[activeAct];
            return f ? `/history?filter=${f}` : "/history";
          })()}
          className="mt-2 block text-center text-xs font-semibold text-rose-600 hover:underline"
        >
          Lihat semua riwayat
          {activeAct ? ` ${ACT_LABEL[activeAct]}` : ""} →
        </Link>
      </section>

      <div className="mt-6 grid grid-cols-3 gap-2">
        <Link
          href="/trend"
          className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-3 text-center text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          <span className="text-lg" aria-hidden>
            📊
          </span>
          Trend
        </Link>
        <Link
          href="/growth"
          className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-3 text-center text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          <span className="text-lg" aria-hidden>
            📈
          </span>
          Tumbuh
        </Link>
        <Link
          href="/milestone"
          className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-3 text-center text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          <span className="text-lg" aria-hidden>
            🎯
          </span>
          Milestone
        </Link>
        <Link
          href="/imunisasi"
          className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-3 text-center text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          <span className="text-lg" aria-hidden>
            💉
          </span>
          Imunisasi
        </Link>
        <Link
          href="/report"
          className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-3 text-center text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          <span className="text-lg" aria-hidden>
            📥
          </span>
          Laporan
        </Link>
        <Link
          href="/sleep-coach"
          className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-3 text-center text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          <span className="text-lg" aria-hidden>
            🌙
          </span>
          Sleep Coach
        </Link>
        <Link
          href="/db-meter"
          className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-3 text-center text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          <span className="text-lg" aria-hidden>
            🔊
          </span>
          dB Meter
        </Link>
        <Link
          href="/more/household"
          className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-3 text-center text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          <span className="text-lg" aria-hidden>
            👨‍👩‍👧
          </span>
          Keluarga
        </Link>
      </div>

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
  // Ongoing duration-based logs (sleep / pumping / feeding-with-start)
  // currently in progress → indicate "sedang berjalan" instead of
  // "X lalu" which implies the event already passed.
  const isOngoing =
    !!log &&
    log.end_timestamp === null &&
    (log.subtype === "sleep" ||
      log.subtype === "pumping" ||
      (log.subtype === "feeding" &&
        (log.start_l_at !== null || log.start_r_at !== null)));

  // For sleep specifically, "sejak terakhir" semantically = sejak baby
  // bangun (end_timestamp), bukan sejak mulai tidur. Other subtypes use
  // timestamp (event time = relevant anchor).
  const useEndAnchor =
    !!log && log.subtype === "sleep" && log.end_timestamp != null;
  const anchorIso = useEndAnchor ? log!.end_timestamp! : log?.timestamp ?? null;
  const subText = !log
    ? null
    : useEndAnchor
      ? `Bangun ${fmtTime(log.end_timestamp!)}`
      : isOngoing
        ? `Mulai ${fmtTime(log.timestamp)}`
        : fmtTime(log.timestamp);

  return (
    <div
      className={`rounded-2xl border p-3 shadow-sm ${
        isOngoing
          ? "border-rose-200 bg-rose-50/60"
          : "border-gray-100 bg-white"
      }`}
    >
      <div className="text-xs text-gray-500">{label}</div>
      <div
        className={`mt-0.5 text-sm font-bold ${
          isOngoing ? "text-rose-600" : "text-gray-800"
        }`}
      >
        {!log
          ? "—"
          : isOngoing
            ? "sedang berjalan"
            : timeSince(anchorIso!)}
      </div>
      {subText ? (
        <div className="text-[11px] text-gray-400">{subText}</div>
      ) : null}
    </div>
  );
}

function StatRow({
  label,
  value,
  sub,
  progress,
  progressSegments,
  detail,
  href,
  active,
  trendAnchor,
}: {
  label: string;
  value: string;
  /** Target text shown right of value (e.g. "600–800 ml"). */
  sub?: string;
  /** 0..1+ progress against target min. Renders single-color progress bar when set. */
  progress?: number;
  /** Stacked multi-color bar (e.g. ASI vs Sufor). Each segment gets a
   *  share of the bar width = value/divisor (clamped to remaining). */
  progressSegments?: { value: number; color: string; divisor: number }[];
  /** Optional small line(s) below the row (breakdown, per-side detail). */
  detail?: string | string[];
  href?: string;
  active?: boolean;
  /** When set, renders a small icon button → /trend#<anchor>. */
  trendAnchor?: string;
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
      {progressSegments && progressSegments.length > 0 ? (
        <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          {progressSegments.map((seg, i) => {
            const pctSeg = Math.min(
              1,
              Math.max(0, seg.value / Math.max(1, seg.divisor)),
            );
            return (
              <div
                key={i}
                className={`h-full ${seg.color} transition-[width]`}
                style={{ width: `${pctSeg * 100}%` }}
              />
            );
          })}
        </div>
      ) : pct != null ? (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full ${barColor} transition-[width]`}
            style={{ width: `${Math.round(pct * 100)}%` }}
          />
        </div>
      ) : null}
      {detail ? (
        Array.isArray(detail) ? (
          <div className="mt-0.5 space-y-0.5 text-[11px] text-gray-500">
            {detail.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        ) : (
          <div className="mt-0.5 text-[11px] text-gray-500">{detail}</div>
        )
      ) : null}
    </div>
  );
  const trendIcon = trendAnchor ? (
    <Link
      href={`/trend#${trendAnchor}`}
      className="ml-1 flex-shrink-0 rounded-full border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
      aria-label={`Lihat trend 14 hari`}
      title="Trend 14 hari"
    >
      📊
    </Link>
  ) : null;
  if (!href) {
    return (
      <div className="flex items-center gap-1">
        <div className="flex-1">{inner}</div>
        {trendIcon}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Link
        href={href}
        className={`-mx-2 block flex-1 rounded-lg px-2 py-1 transition-colors ${
          active ? "bg-rose-50 ring-1 ring-rose-200" : "hover:bg-gray-50"
        }`}
      >
        {inner}
      </Link>
      {trendIcon}
    </div>
  );
}
