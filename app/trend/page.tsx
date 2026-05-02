import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";
import {
  TrendCharts,
  type DailyAgg,
  type SleepHeatmapRow,
  type FeedingIntervalBucket,
} from "@/components/TrendCharts";
import { TrendHighlights } from "@/components/TrendHighlights";
import {
  computeMilkTarget,
  type DailyTarget,
} from "@/lib/constants/daily-targets";
import { getTargetForAge } from "@/lib/constants/daily-targets";
import { dbfEstimateMl } from "@/lib/compute/dbf-estimate";
import { type LogRow } from "@/lib/compute/stats";

const DAYS_BACK = 14;
const BULAN_SHORT = [
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

function startOfDayJakarta(d: Date): Date {
  // Compute Asia/Jakarta start-of-day as a UTC timestamp.
  const offsetMs = 7 * 60 * 60 * 1000;
  const local = new Date(d.getTime() + offsetMs);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offsetMs);
}

function dayKey(d: Date): string {
  const offsetMs = 7 * 60 * 60 * 1000;
  const local = new Date(d.getTime() + offsetMs);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
}

function shortLabel(iso: string): string {
  const d = new Date(iso);
  const offsetMs = 7 * 60 * 60 * 1000;
  const local = new Date(d.getTime() + offsetMs);
  return `${local.getUTCDate()} ${BULAN_SHORT[local.getUTCMonth()]}`;
}

export default async function TrendPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login?next=/trend");

  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const supabase = createClient();
  const since = startOfDayJakarta(
    new Date(Date.now() - (DAYS_BACK - 1) * 86400000),
  ).toISOString();

  const { data: logs } = await supabase
    .from("logs")
    .select(
      "id, subtype, timestamp, end_timestamp, amount_ml, amount_l_ml, amount_r_ml, duration_l_min, duration_r_min, has_pee, has_poop, poop_color, poop_consistency, temp_celsius, med_name, med_dose, bottle_content, consumed_ml, start_l_at, end_l_at, start_r_at, end_r_at, paused_at, started_with_stopwatch, sleep_quality, notes",
    )
    .eq("baby_id", baby.id)
    .gte("timestamp", since)
    .order("timestamp", { ascending: true });

  const logsArray: LogRow[] = (logs ?? []) as LogRow[];

  // === Per-day target lookup based on baby's age at each date ===
  // Age changes day by day across the 14-day window, so target ranges
  // shift accordingly. For dates before birth → target = null.
  function getTargetByAgeDays(days: number): DailyTarget | null {
    if (days < 0) return null;
    // Inline the age bucket lookup (DAILY_TARGETS imported indirectly)
    // We rely on getTargetForAge but use a synthetic dob.
    // Simpler: import DAILY_TARGETS directly. Defer to existing helper:
    const fakeDobIso = new Date(
      Date.now() - days * 86400000,
    ).toISOString();
    const t = getTargetForAge(fakeDobIso);
    return t;
  }
  const dobMs = new Date(baby.dob).getTime();

  // Build the day buckets first so days with zero entries still appear.
  const days: DailyAgg[] = [];
  const dayIndex = new Map<string, DailyAgg>();
  const dayBoundaryMs = new Map<string, { start: number; end: number }>();
  for (let i = DAYS_BACK - 1; i >= 0; i--) {
    const d = startOfDayJakarta(new Date(Date.now() - i * 86400000));
    const key = dayKey(d);
    const startMs = d.getTime();
    const endMs = startMs + 86400000;
    // Baby's age (in days) at this date
    const ageDays = Math.floor((startMs - dobMs) / 86400000);
    const target = getTargetByAgeDays(ageDays);
    // For milk target, use weight-aware calc when birth_weight_kg known.
    // For the trend view we use birth_weight_kg as fallback (per-day weight
    // would need historical growth data — overkill for v1).
    const weightKg = baby.birth_weight_kg
      ? Number(baby.birth_weight_kg)
      : null;
    const milkTarget =
      target != null && weightKg != null && weightKg > 0
        ? computeMilkTarget(target, weightKg)
        : target != null
          ? { min: target.milkMlMin, max: target.milkMlMax, source: "age" as const }
          : null;
    const agg: DailyAgg = {
      date: key,
      short: shortLabel(d.toISOString()),
      bottleMl: 0,
      dbfEstimateMl: 0,
      milkTotalMl: 0,
      pumpMl: 0,
      pumpMlL: 0,
      pumpMlR: 0,
      sleepMin: 0,
      peeCount: 0,
      poopCount: 0,
      milkTargetMin: milkTarget ? milkTarget.min : null,
      milkTargetMax: milkTarget ? milkTarget.max : null,
      sleepHoursMin: target ? target.sleepHoursMin : null,
      sleepHoursMax: target ? target.sleepHoursMax : null,
    };
    days.push(agg);
    dayIndex.set(key, agg);
    dayBoundaryMs.set(key, { start: startMs, end: endMs });
  }

  for (const l of logsArray) {
    const key = dayKey(new Date(l.timestamp));
    const agg = dayIndex.get(key);
    if (l.subtype === "feeding") {
      if (!agg) continue;
      if (l.amount_ml != null && l.amount_ml > 0) {
        agg.bottleMl += l.amount_ml;
      }
      const dbfMin = (l.duration_l_min ?? 0) + (l.duration_r_min ?? 0);
      if (dbfMin > 0) {
        const est = dbfEstimateMl(dbfMin, logsArray, {
          fixedMlPerMin: baby.dbf_ml_per_min,
          pumpingMultiplier: baby.dbf_pumping_multiplier,
        });
        agg.dbfEstimateMl += est.ml;
      }
    } else if (l.subtype === "pumping") {
      if (!agg) continue;
      const lMl = l.amount_l_ml ?? 0;
      const rMl = l.amount_r_ml ?? 0;
      agg.pumpMlL += lMl;
      agg.pumpMlR += rMl;
      agg.pumpMl += lMl + rMl;
    } else if (l.subtype === "diaper") {
      if (!agg) continue;
      if (l.has_pee) agg.peeCount += 1;
      if (l.has_poop) agg.poopCount += 1;
    } else if (l.subtype === "sleep" && l.end_timestamp) {
      // Cross-day split: distribute minutes to each day's bucket based on
      // overlap with [dayStart, dayEnd]. Sleep that crosses midnight gets
      // its actual time-on-each-day counted, not lumped to the start day.
      const startMs = new Date(l.timestamp).getTime();
      const endMs = new Date(l.end_timestamp).getTime();
      if (endMs <= startMs) continue;
      for (const d of days) {
        const b = dayBoundaryMs.get(d.date);
        if (!b) continue;
        const overlap = Math.max(
          0,
          Math.min(endMs, b.end) - Math.max(startMs, b.start),
        );
        if (overlap > 0) d.sleepMin += overlap / 60000;
      }
    }
  }

  // Round + finalize
  for (const d of days) {
    d.bottleMl = Math.round(d.bottleMl);
    d.pumpMlL = Math.round(d.pumpMlL);
    d.pumpMlR = Math.round(d.pumpMlR);
    d.dbfEstimateMl = Math.round(d.dbfEstimateMl);
    d.milkTotalMl = d.bottleMl + d.dbfEstimateMl;
    d.pumpMl = Math.round(d.pumpMl);
    d.sleepMin = Math.round(d.sleepMin);
  }

  // === Sleep heatmap: 14 days × 24 hours, minutes per hour bucket ===
  const heatmapMap = new Map<string, number[]>();
  for (const d of days) heatmapMap.set(d.date, new Array(24).fill(0));
  const offsetMs = 7 * 60 * 60 * 1000;
  function jakartaParts(d: Date): { key: string; hour: number } {
    const local = new Date(d.getTime() + offsetMs);
    const key = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
    return { key, hour: local.getUTCHours() };
  }
  for (const l of logsArray) {
    if (l.subtype !== "sleep" || !l.end_timestamp) continue;
    let cursor = new Date(l.timestamp);
    const end = new Date(l.end_timestamp);
    while (cursor < end) {
      const { key, hour } = jakartaParts(cursor);
      const local = new Date(cursor.getTime() + offsetMs);
      // Step end at next-hour boundary in Jakarta time
      const nextLocal = new Date(local);
      nextLocal.setUTCMinutes(0, 0, 0);
      nextLocal.setUTCHours(local.getUTCHours() + 1);
      const nextCursor = new Date(nextLocal.getTime() - offsetMs);
      const segEnd = nextCursor < end ? nextCursor : end;
      const mins = (segEnd.getTime() - cursor.getTime()) / 60000;
      const arr = heatmapMap.get(key);
      if (arr && hour >= 0 && hour < 24) {
        arr[hour] = (arr[hour] ?? 0) + mins;
      }
      cursor = segEnd;
    }
  }
  const sleepHeatmap: SleepHeatmapRow[] = days.map((d) => ({
    date: d.date,
    short: d.short,
    hours: (heatmapMap.get(d.date) ?? new Array(24).fill(0)).map((m) =>
      Math.round(m),
    ),
  }));

  // === Feeding interval histogram ===
  // Cluster-feeding dedup: feedings within CLUSTER_DEDUP_MIN of each other
  // count as one session (e.g. ASI bottle + sufor top-up at same time).
  // Without this, the "<1 jam" bucket gets inflated by data-entry artifacts
  // and the median collapses unrealistically low.
  const CLUSTER_DEDUP_MIN = 5;
  const feedingsRaw = logsArray
    .filter((l) => l.subtype === "feeding")
    .map((l) => new Date(l.timestamp).getTime())
    .sort((a, b) => a - b);
  const feedings: number[] = [];
  for (const t of feedingsRaw) {
    const last = feedings[feedings.length - 1];
    if (last === undefined || (t - last) / 60000 >= CLUSTER_DEDUP_MIN) {
      feedings.push(t);
    }
  }
  const intervals: number[] = [];
  for (let i = 1; i < feedings.length; i++) {
    const a = feedings[i - 1];
    const b = feedings[i];
    if (a !== undefined && b !== undefined) {
      intervals.push((b - a) / 60000);
    }
  }
  const buckets: FeedingIntervalBucket[] = [
    { label: "<1 jam", minMin: 0, maxMin: 60, count: 0 },
    { label: "1–2 jam", minMin: 60, maxMin: 120, count: 0 },
    { label: "2–3 jam", minMin: 120, maxMin: 180, count: 0 },
    { label: "3–4 jam", minMin: 180, maxMin: 240, count: 0 },
    { label: "4–6 jam", minMin: 240, maxMin: 360, count: 0 },
    { label: ">6 jam", minMin: 360, maxMin: null, count: 0 },
  ];
  for (const m of intervals) {
    for (const b of buckets) {
      if (m >= b.minMin && (b.maxMin === null || m < b.maxMin)) {
        b.count += 1;
        break;
      }
    }
  }
  const feedingMedianMin = (() => {
    if (intervals.length === 0) return null;
    const sorted = [...intervals].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : sorted[mid] ?? null;
  })();

  const target = getTargetForAge(baby.dob);

  // === Today's stats for highlights ===
  const todayKey = dayKey(new Date());
  const todayAgg = dayIndex.get(todayKey);
  const todaySleep = logsArray.filter((l) => {
    if (l.subtype !== "sleep" || !l.end_timestamp) return false;
    return dayKey(new Date(l.timestamp)) === todayKey;
  });
  const sleepDurations = todaySleep.map(
    (l) =>
      (new Date(l.end_timestamp!).getTime() -
        new Date(l.timestamp).getTime()) /
      60000,
  );
  const sleepLongestMin = sleepDurations.length
    ? Math.max(...sleepDurations)
    : 0;
  const sleepCount = todaySleep.length;

  // Today's feedings (after dedup) for highlights count
  const todayFeedings = feedings.filter(
    (t) => dayKey(new Date(t)) === todayKey,
  );
  const todayFeedingCount = logsArray.filter(
    (l) =>
      l.subtype === "feeding" && dayKey(new Date(l.timestamp)) === todayKey,
  ).length;

  // 7-day milk avg (excluding today, only days with non-zero data)
  const last7 = days.slice(-8, -1).filter((d) => d.milkTotalMl > 0);
  const milk7dAvg =
    last7.length > 0
      ? last7.reduce((s, d) => s + d.milkTotalMl, 0) / last7.length
      : null;
  const sleepDays7 = days.slice(-8, -1).filter((d) => d.sleepMin > 0);
  const sleep7dAvgMin =
    sleepDays7.length > 0
      ? sleepDays7.reduce((s, d) => s + d.sleepMin, 0) / sleepDays7.length
      : null;

  // DBF rate used (re-compute once for caption)
  const todayDbfMin = todayAgg
    ? todayFeedings.reduce((sum, _t) => sum, 0) // placeholder; we'll compute from logs
    : 0;
  // Compute today's DBF minutes from logsArray
  const dbfMinToday = logsArray
    .filter((l) => {
      if (l.subtype !== "feeding") return false;
      return dayKey(new Date(l.timestamp)) === todayKey;
    })
    .reduce(
      (sum, l) => sum + (l.duration_l_min ?? 0) + (l.duration_r_min ?? 0),
      0,
    );
  const dbfEstToday = dbfEstimateMl(dbfMinToday, logsArray, {
    fixedMlPerMin: baby.dbf_ml_per_min,
    pumpingMultiplier: baby.dbf_pumping_multiplier,
  });

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6 md:max-w-2xl lg:max-w-3xl">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-rose-600 hover:underline">
          ← Beranda
        </Link>
        <h1 className="text-base font-bold text-gray-900">Trend 14 hari</h1>
        <span className="w-12" />
      </header>

      <div className="mt-4">
        <TrendHighlights
          data={{
            milkTotalMl: todayAgg?.milkTotalMl ?? 0,
            milkTargetMin: target.milkMlMin,
            milkTargetMax: target.milkMlMax,
            bottleMl: todayAgg?.bottleMl ?? 0,
            dbfMin: dbfMinToday,
            dbfEstimateMl: dbfEstToday.ml,
            dbfRate: dbfEstToday.mlPerMin,
            dbfRateSource: dbfEstToday.source,
            sleepMin: todayAgg?.sleepMin ?? 0,
            sleepTargetHoursMin: target.sleepHoursMin,
            sleepTargetHoursMax: target.sleepHoursMax,
            sleepLongestMin: Math.round(sleepLongestMin),
            sleepCount,
            peeCount: todayAgg?.peeCount ?? 0,
            peeTargetMin: target.peeMin,
            poopCount: todayAgg?.poopCount ?? 0,
            poopTargetMin: target.poopMin,
            feedingCount: todayFeedingCount,
            feedingSessionCount: todayFeedings.length,
            feedingMedianMin,
            milk7dAvg,
            sleep7dAvgMin,
          }}
        />
      </div>

      <div className="mt-4">
        <TrendCharts
          daily={days}
          targets={{
            milkMin: target.milkMlMin,
            milkMax: target.milkMlMax,
            sleepHoursMin: target.sleepHoursMin,
            sleepHoursMax: target.sleepHoursMax,
            peeMin: target.peeMin,
            peeMax: target.peeMax,
            poopMin: target.poopMin,
            poopMax: target.poopMax,
          }}
          sleepHeatmap={sleepHeatmap}
          feedingIntervals={buckets}
          feedingMedianMin={feedingMedianMin}
        />
      </div>

      <p className="mt-4 text-[10px] leading-snug text-gray-400">
        Target referensi WHO/IDAI/AAP age-bucket. Susu = botol + estimasi DBF
        (ml/menit dari override profile / pumping terakhir / default 4).
        Pumping output tidak dihitung sebagai intake bayi (itu stok ASI).
        Konsultasi DSA untuk evaluasi medis.
      </p>
    </main>
  );
}
