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
import {
  effectivenessFactor,
  type EffectivenessLevel,
} from "@/lib/compute/dbf-effectiveness";
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
      "id, subtype, timestamp, end_timestamp, amount_ml, amount_asi_ml, amount_sufor_ml, amount_spilled_ml, spilled_attribution, amount_l_ml, amount_r_ml, duration_l_min, duration_r_min, has_pee, has_poop, poop_color, poop_consistency, temp_celsius, med_name, med_dose, bottle_content, consumed_ml, start_l_at, end_l_at, start_r_at, end_r_at, paused_at, started_with_stopwatch, sleep_quality, avg_db_a, max_db_a, effectiveness, dbf_rate_override, bath_pijat_ilu, bath_clean_tali_pusat, notes",
    )
    .eq("baby_id", baby.id)
    .gte("timestamp", since)
    .order("timestamp", { ascending: true });

  const logsArray: LogRow[] = (logs ?? []) as LogRow[];

  // === Historical weight lookup for dynamic milk target ===
  // Sebelumnya milkTarget computed pakai baby.birth_weight_kg konstan,
  // jadi line target statis sepanjang 14 hari walaupun bayi tumbuh.
  // Sekarang ambil growth_measurements untuk lookup berat per hari:
  // pakai measurement terakhir <= chart day, fallback ke birth weight.
  const { data: growthRows } = await supabase
    .from("growth_measurements")
    .select("measured_at, weight_kg")
    .eq("baby_id", baby.id)
    .order("measured_at", { ascending: true });
  const growthSamples: Array<{ ts: number; weightKg: number }> = (
    growthRows ?? []
  ).map((g) => ({
    ts: new Date(g.measured_at).getTime(),
    weightKg: Number(g.weight_kg),
  }));
  const birthWeightKg = baby.birth_weight_kg ? Number(baby.birth_weight_kg) : null;
  function weightAt(timestampMs: number): number | null {
    // Find last measurement <= timestampMs. growthSamples sorted ascending.
    let best: number | null = birthWeightKg;
    for (const s of growthSamples) {
      if (s.ts <= timestampMs && s.weightKg > 0) best = s.weightKg;
      else if (s.ts > timestampMs) break;
    }
    return best;
  }

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
    // Per-day weight: lookup most recent growth measurement <= today,
    // fallback ke birth weight. Bikin target line naik seiring bayi tumbuh.
    const weightKg = weightAt(startMs);
    const milkTarget =
      target != null && weightKg != null && weightKg > 0
        ? computeMilkTarget(target, weightKg)
        : target != null
          ? { min: target.milkMlMin, max: target.milkMlMax, source: "age" as const }
          : null;
    const agg: DailyAgg = {
      date: key,
      short: shortLabel(d.toISOString()),
      suforMl: 0,
      asiBottleMl: 0,
      asiMl: 0,
      bottleMl: 0,
      dbfEstimateMl: 0,
      milkTotalMl: 0,
      pumpMl: 0,
      pumpMlL: 0,
      pumpMlR: 0,
      pumpSessions: 0,
      dbfSessions: 0,
      sleepMin: 0,
      sleepMinNyenyak: 0,
      sleepMinGelisah: 0,
      sleepMinSeringBangun: 0,
      sleepMinUnknown: 0,
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

  // Cluster gap threshold: sessions within 2h dianggap satu sesi
  // (mis. pumping bouts dengan jeda istirahat sebentar = realistis 1 sesi
  // bukan 2). Clustered per calendar day — cross-midnight tetap dipisah
  // mengikuti per-day chart bucketing.
  const CLUSTER_GAP_MS = 120 * 60_000;
  const lastPumpClusterEndByDay = new Map<string, number>();
  const lastDbfClusterEndByDay = new Map<string, number>();

  for (const l of logsArray) {
    const key = dayKey(new Date(l.timestamp));
    const agg = dayIndex.get(key);
    if (l.subtype === "feeding") {
      if (!agg) continue;
      if (l.amount_ml != null && l.amount_ml > 0) {
        agg.bottleMl += l.amount_ml;
        // Mix-aware bucketing: pakai breakdown amount_asi_ml +
        // amount_sufor_ml saat tersedia (mix mode + new rows). Fallback ke
        // bottle_content untuk legacy rows yang belum punya breakdown.
        // Tanpa cek breakdown, sesi mix akan masuk 100% ke Sufor.
        // asiBottleMl di-track terpisah supaya chart bisa stack DBF
        // sebagai warna sendiri (asiMl = asiBottle + dbfEstimate).
        if (l.amount_asi_ml != null || l.amount_sufor_ml != null) {
          agg.asiBottleMl += l.amount_asi_ml ?? 0;
          agg.asiMl += l.amount_asi_ml ?? 0;
          agg.suforMl += l.amount_sufor_ml ?? 0;
        } else if (l.bottle_content === "asi") {
          agg.asiBottleMl += l.amount_ml;
          agg.asiMl += l.amount_ml;
        } else {
          agg.suforMl += l.amount_ml;
        }
      }
      const dbfMin = (l.duration_l_min ?? 0) + (l.duration_r_min ?? 0);
      if (dbfMin > 0) {
        // DBF cluster dedup: gap end-to-start <2h → same cluster
        const sessionStartMs = new Date(l.timestamp).getTime();
        const sessionEndMs = sessionStartMs + dbfMin * 60_000;
        const prevEnd = lastDbfClusterEndByDay.get(key);
        if (prevEnd === undefined || sessionStartMs - prevEnd >= CLUSTER_GAP_MS) {
          agg.dbfSessions += 1;
        }
        lastDbfClusterEndByDay.set(
          key,
          Math.max(prevEnd ?? sessionEndMs, sessionEndMs),
        );

        const est = dbfEstimateMl(dbfMin, logsArray, {
          fixedMlPerMin: baby.dbf_ml_per_min,
          pumpingMultiplier: baby.dbf_pumping_multiplier,
          rowOverride: l.dbf_rate_override,
        });
        // Apply effectiveness factor (1.0/0.8/0.6) per-row so chart
        // reflects actual transfer estimate.
        const factor = effectivenessFactor(
          (l.effectiveness ?? null) as EffectivenessLevel | null,
        );
        const adjustedMl = Math.round(est.ml * factor);
        agg.dbfEstimateMl += adjustedMl;
        agg.asiMl += adjustedMl;
      }
    } else if (l.subtype === "pumping") {
      if (!agg) continue;
      const lMl = l.amount_l_ml ?? 0;
      const rMl = l.amount_r_ml ?? 0;
      agg.pumpMlL += lMl;
      agg.pumpMlR += rMl;
      agg.pumpMl += lMl + rMl;
      // Pumping cluster dedup: gap end-to-start <2h → same cluster
      const sessionStartMs = new Date(l.timestamp).getTime();
      const sessionEndMs = l.end_timestamp
        ? new Date(l.end_timestamp).getTime()
        : sessionStartMs;
      const prevEnd = lastPumpClusterEndByDay.get(key);
      if (prevEnd === undefined || sessionStartMs - prevEnd >= CLUSTER_GAP_MS) {
        agg.pumpSessions += 1;
      }
      lastPumpClusterEndByDay.set(
        key,
        Math.max(prevEnd ?? sessionEndMs, sessionEndMs),
      );
    } else if (l.subtype === "diaper") {
      if (!agg) continue;
      if (l.has_pee) agg.peeCount += 1;
      if (l.has_poop) agg.poopCount += 1;
    } else if (l.subtype === "sleep" && l.end_timestamp) {
      // Cross-day split: distribute minutes to each day's bucket based on
      // overlap with [dayStart, dayEnd]. Sleep that crosses midnight gets
      // its actual time-on-each-day counted, not lumped to the start day.
      // Bucket per sleep_quality supaya chart bisa stack quality breakdown.
      const startMs = new Date(l.timestamp).getTime();
      const endMs = new Date(l.end_timestamp).getTime();
      if (endMs <= startMs) continue;
      const quality = l.sleep_quality ?? null;
      for (const d of days) {
        const b = dayBoundaryMs.get(d.date);
        if (!b) continue;
        const overlap = Math.max(
          0,
          Math.min(endMs, b.end) - Math.max(startMs, b.start),
        );
        if (overlap > 0) {
          const min = overlap / 60000;
          d.sleepMin += min;
          if (quality === "nyenyak") d.sleepMinNyenyak += min;
          else if (quality === "gelisah") d.sleepMinGelisah += min;
          else if (quality === "sering_bangun") d.sleepMinSeringBangun += min;
          else d.sleepMinUnknown += min;
        }
      }
    }
  }

  // Round + finalize
  for (const d of days) {
    d.bottleMl = Math.round(d.bottleMl);
    d.suforMl = Math.round(d.suforMl);
    d.asiBottleMl = Math.round(d.asiBottleMl);
    d.asiMl = Math.round(d.asiMl);
    d.pumpMlL = Math.round(d.pumpMlL);
    d.pumpMlR = Math.round(d.pumpMlR);
    d.dbfEstimateMl = Math.round(d.dbfEstimateMl);
    d.milkTotalMl = d.bottleMl + d.dbfEstimateMl;
    d.pumpMl = Math.round(d.pumpMl);
    d.sleepMin = Math.round(d.sleepMin);
    d.sleepMinNyenyak = Math.round(d.sleepMinNyenyak);
    d.sleepMinGelisah = Math.round(d.sleepMinGelisah);
    d.sleepMinSeringBangun = Math.round(d.sleepMinSeringBangun);
    d.sleepMinUnknown = Math.round(d.sleepMinUnknown);
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
  // count as one session. 60 min: covers both data-entry artifacts (ASI
  // bottle + sufor top-up logged separately) and tight cluster-feeding
  // bouts (real feed-rest-feed within an hour). Tanpa ini, histogram
  // bucket "<1 jam" dominant + median collapses unrealistically rendah.
  // AAP newborn guideline: 10–14× sehari → interval typical 1.7–2.4 jam.
  const CLUSTER_DEDUP_MIN = 60;
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

  // === Past-24h rolling stats for highlights ===
  // Calendar-day "Hari Ini" misleading early in the day (jam 8 pagi → 33%
  // target wajar tapi banner bilang "jauh dari target"). Rolling 24h always
  // a valid full-window apple-to-apple comparison vs daily target.
  const nowMs = Date.now();
  const windowStartMs = nowMs - 24 * 60 * 60 * 1000;
  const inWindow = (tsIso: string): boolean => {
    const t = new Date(tsIso).getTime();
    return t >= windowStartMs && t <= nowMs;
  };

  let bottleMl24h = 0;
  let asiBottleMl24h = 0;
  let suforMl24h = 0;
  let peeCount24h = 0;
  let poopCount24h = 0;
  let feedingCount24h = 0;
  let dbfMin24h = 0;
  let dbfEstAdjustedMl24h = 0;
  for (const l of logsArray) {
    if (l.subtype === "feeding" && inWindow(l.timestamp)) {
      feedingCount24h += 1;
      if (l.amount_ml != null && l.amount_ml > 0) {
        bottleMl24h += l.amount_ml;
        if (l.amount_asi_ml != null || l.amount_sufor_ml != null) {
          asiBottleMl24h += l.amount_asi_ml ?? 0;
          suforMl24h += l.amount_sufor_ml ?? 0;
        } else if (l.bottle_content === "asi") {
          asiBottleMl24h += l.amount_ml;
        } else {
          suforMl24h += l.amount_ml;
        }
      }
      const dbfMin = (l.duration_l_min ?? 0) + (l.duration_r_min ?? 0);
      if (dbfMin > 0) {
        dbfMin24h += dbfMin;
        const est = dbfEstimateMl(dbfMin, logsArray, {
          fixedMlPerMin: baby.dbf_ml_per_min,
          pumpingMultiplier: baby.dbf_pumping_multiplier,
          rowOverride: l.dbf_rate_override,
        });
        const factor = effectivenessFactor(
          (l.effectiveness ?? null) as EffectivenessLevel | null,
        );
        dbfEstAdjustedMl24h += Math.round(est.ml * factor);
      }
    } else if (l.subtype === "diaper" && inWindow(l.timestamp)) {
      if (l.has_pee) peeCount24h += 1;
      if (l.has_poop) poopCount24h += 1;
    }
  }
  void asiBottleMl24h; // available for future split detail; aggregated via milkTotal

  // Sleep cross-window split: overlap of each sleep session with [now-24h, now]
  let sleepMin24h = 0;
  let sleepLongest24hMin = 0;
  let sleepSessions24h = 0;
  for (const l of logsArray) {
    if (l.subtype !== "sleep" || !l.end_timestamp) continue;
    const sMs = new Date(l.timestamp).getTime();
    const eMs = new Date(l.end_timestamp).getTime();
    if (eMs <= sMs) continue;
    const overlap = Math.max(
      0,
      Math.min(eMs, nowMs) - Math.max(sMs, windowStartMs),
    );
    if (overlap > 0) {
      sleepMin24h += overlap / 60000;
      const sessionMin = (eMs - sMs) / 60000;
      if (sessionMin > sleepLongest24hMin) sleepLongest24hMin = sessionMin;
      sleepSessions24h += 1;
    }
  }

  // Feedings (dedup) in 24h window for session count
  const feedingSessions24h = feedings.filter(
    (t) => t >= windowStartMs && t <= nowMs,
  ).length;

  const dbfEst24h = dbfEstimateMl(dbfMin24h, logsArray, {
    fixedMlPerMin: baby.dbf_ml_per_min,
    pumpingMultiplier: baby.dbf_pumping_multiplier,
  });

  // 7-day milk avg (last 7 complete calendar days excluding today)
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

  const milkTotal24h = bottleMl24h + dbfEstAdjustedMl24h;

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
            milkTotalMl: milkTotal24h,
            milkTargetMin: target.milkMlMin,
            milkTargetMax: target.milkMlMax,
            bottleMl: bottleMl24h,
            dbfMin: dbfMin24h,
            dbfEstimateMl: dbfEstAdjustedMl24h,
            dbfRate: dbfEst24h.mlPerMin,
            dbfRateSource: dbfEst24h.source,
            sleepMin: Math.round(sleepMin24h),
            sleepTargetHoursMin: target.sleepHoursMin,
            sleepTargetHoursMax: target.sleepHoursMax,
            sleepLongestMin: Math.round(sleepLongest24hMin),
            sleepCount: sleepSessions24h,
            peeCount: peeCount24h,
            peeTargetMin: target.peeMin,
            poopCount: poopCount24h,
            poopTargetMin: target.poopMin,
            feedingCount: feedingCount24h,
            feedingSessionCount: feedingSessions24h,
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
