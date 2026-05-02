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

  // Build the day buckets first so days with zero entries still appear.
  const days: DailyAgg[] = [];
  const dayIndex = new Map<string, DailyAgg>();
  for (let i = DAYS_BACK - 1; i >= 0; i--) {
    const d = startOfDayJakarta(new Date(Date.now() - i * 86400000));
    const key = dayKey(d);
    const agg: DailyAgg = {
      date: key,
      short: shortLabel(d.toISOString()),
      bottleMl: 0,
      dbfEstimateMl: 0,
      milkTotalMl: 0,
      pumpMl: 0,
      sleepMin: 0,
      peeCount: 0,
      poopCount: 0,
    };
    days.push(agg);
    dayIndex.set(key, agg);
  }

  for (const l of logsArray) {
    const key = dayKey(new Date(l.timestamp));
    const agg = dayIndex.get(key);
    if (!agg) continue;
    if (l.subtype === "feeding") {
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
      agg.pumpMl += (l.amount_l_ml ?? 0) + (l.amount_r_ml ?? 0);
    } else if (l.subtype === "diaper") {
      if (l.has_pee) agg.peeCount += 1;
      if (l.has_poop) agg.poopCount += 1;
    } else if (l.subtype === "sleep" && l.end_timestamp) {
      const min =
        (new Date(l.end_timestamp).getTime() -
          new Date(l.timestamp).getTime()) /
        60000;
      if (min > 0) agg.sleepMin += min;
    }
  }

  // Round + finalize
  for (const d of days) {
    d.bottleMl = Math.round(d.bottleMl);
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
  const feedings = logsArray
    .filter((l) => l.subtype === "feeding")
    .map((l) => new Date(l.timestamp).getTime())
    .sort((a, b) => a - b);
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
