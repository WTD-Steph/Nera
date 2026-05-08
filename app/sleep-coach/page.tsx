import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";
import { type LogRow } from "@/lib/compute/stats";
import { analyzeSleep, type CoachLevel } from "@/lib/compute/sleep-coach";

const LEVEL_STYLE: Record<
  CoachLevel,
  { box: string; pill: string; pillLabel: string }
> = {
  concern: {
    box: "border-red-200 bg-red-50/60",
    pill: "bg-red-500 text-white",
    pillLabel: "Perhatikan",
  },
  opportunity: {
    box: "border-amber-200 bg-amber-50/60",
    pill: "bg-amber-500 text-white",
    pillLabel: "Peluang",
  },
  good: {
    box: "border-emerald-200 bg-emerald-50/60",
    pill: "bg-emerald-500 text-white",
    pillLabel: "Bagus",
  },
};

function fmtH(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}j ${r}m` : `${h}j`;
}

export default async function SleepCoachPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login?next=/sleep-coach");
  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const supabase = createClient();
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data: logs } = await supabase
    .from("logs")
    .select(
      "id, subtype, timestamp, end_timestamp, sleep_quality, paused_at, started_with_stopwatch, duration_l_min, duration_r_min, amount_ml, bottle_content",
    )
    .eq("baby_id", baby.id)
    .gte("timestamp", since)
    .order("timestamp", { ascending: true });
  const logsArray = (logs ?? []) as LogRow[];
  const report = analyzeSleep(logsArray, baby.dob, 7);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6 md:max-w-2xl">
      <header className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-rose-600 hover:underline">
          ← Beranda
        </Link>
        <h1 className="text-base font-bold text-gray-900">Sleep Coach</h1>
        <span className="w-12" />
      </header>

      <p className="mb-3 text-xs text-gray-500">
        Analisis 7 hari terakhir · usia {report.ageDays} hari · wake
        window {report.wakeWindow.label}.
      </p>

      <section className="mt-4 grid grid-cols-2 gap-2">
        <SummaryCard
          label="Total tidur/hari"
          value={`${report.totalSleepHoursPerDay.toFixed(1)}j`}
          sub={`/ ${report.targetSleepHoursMin}-${report.targetSleepHoursMax}j`}
        />
        <SummaryCard
          label="Day · Night"
          value={`${report.dayNightRatio.dayPct}% · ${report.dayNightRatio.nightPct}%`}
          sub=""
        />
        <SummaryCard
          label="Stretch malam"
          value={fmtH(report.longestNightStretchMin)}
          sub="terpanjang"
        />
        <SummaryCard
          label="Bedtime variasi"
          value={`±${Math.round(report.bedtimeConsistencyMin)}m`}
          sub=""
        />
      </section>

      <section className="mt-5 space-y-2">
        <h2 className="px-1 text-sm font-semibold text-gray-700">
          Findings & Actions
        </h2>
        {report.findings.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-4 text-center text-sm text-gray-400">
            Data masih sedikit — lanjut log 3-5 hari untuk insight.
          </div>
        ) : (
          report.findings.map((f) => {
            const style = LEVEL_STYLE[f.level];
            return (
              <div
                key={f.id}
                className={`rounded-2xl border p-3 shadow-sm ${style.box}`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-lg" aria-hidden>
                    {f.emoji}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {f.title}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${style.pill}`}
                      >
                        {style.pillLabel}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] leading-snug text-gray-700">
                      {f.finding}
                    </p>
                    {f.actions.length > 0 ? (
                      <ul className="mt-2 space-y-0.5 text-[11px] leading-snug text-gray-700">
                        {f.actions.map((a, i) => (
                          <li key={i}>· {a}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>

      <p className="mt-6 text-[10px] leading-snug text-gray-400">
        Sumber: Weissbluth (wake windows), Mindell (bedtime routine),
        AAP, Sleep Foundation, Hookway (responsive sleep). Bukan
        konsultasi medis — pattern berdasarkan data Anda.
      </p>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-base font-bold text-gray-900">{value}</span>
        <span className="text-[10px] text-gray-400">{sub}</span>
      </div>
    </div>
  );
}
