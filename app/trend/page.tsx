import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";
import { TrendCharts, type DailyAgg } from "@/components/TrendCharts";
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
