import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";
import { MILESTONES_LIST } from "@/lib/constants/milestones";
import { ageInMonths } from "@/lib/constants/who-percentiles";
import { ProgressRealtime } from "@/components/ProgressRealtime";
import { MilestoneRow } from "@/components/MilestoneRow";
import {
  CustomMilestoneAdd,
  CustomMilestoneRow,
} from "@/components/CustomMilestone";

export default async function MilestonePage() {
  const user = await getCachedUser();
  if (!user) redirect("/login?next=/milestone");

  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const supabase = createClient();

  const [{ data: progress }, { data: customs }] = await Promise.all([
    supabase
      .from("milestone_progress")
      .select("milestone_key, achieved_at")
      .eq("baby_id", baby.id),
    supabase
      .from("custom_milestones")
      .select("id, text, achieved_at")
      .eq("baby_id", baby.id)
      .order("achieved_at", { ascending: false }),
  ]);

  const achievedMap = new Map<string, string>();
  for (const p of progress ?? []) {
    achievedMap.set(p.milestone_key, p.achieved_at);
  }

  const customList = customs ?? [];
  const currentMonth = Math.floor(ageInMonths(baby.dob));
  const totalAchieved = achievedMap.size;
  const totalMilestones = MILESTONES_LIST.length;

  // Group by month
  const grouped = new Map<number, typeof MILESTONES_LIST>();
  for (const m of MILESTONES_LIST) {
    const arr = grouped.get(m.month) ?? [];
    arr.push(m);
    grouped.set(m.month, arr);
  }
  const monthsAsc = [...grouped.keys()].sort((a, b) => a - b);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6 md:max-w-2xl lg:max-w-3xl">
      <ProgressRealtime babyId={baby.id} table="milestone_progress" />
      <ProgressRealtime babyId={baby.id} table="custom_milestones" />
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-rose-600 hover:underline">
          ← Beranda
        </Link>
        <h1 className="text-base font-bold text-gray-900">Milestone</h1>
        <span className="w-12" />
      </header>

      <section className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Tercapai</div>
            <div className="text-2xl font-bold text-rose-500">
              {totalAchieved}{" "}
              <span className="text-sm text-gray-400">/ {totalMilestones}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Usia saat ini</div>
            <div className="text-base font-bold text-gray-700">
              {currentMonth} bulan
            </div>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-rose-100">
          <div
            className="h-full bg-rose-500 transition-all"
            style={{ width: `${(totalAchieved / totalMilestones) * 100}%` }}
          />
        </div>
      </section>

      <section className="mt-4 space-y-2">
        <CustomMilestoneAdd />
        {customList.length > 0 ? (
          <div className="space-y-1.5">
            {customList.map((c) => (
              <CustomMilestoneRow
                key={c.id}
                id={c.id}
                text={c.text}
                achievedAt={c.achieved_at}
              />
            ))}
          </div>
        ) : null}
      </section>

      <section className="mt-4 space-y-3">
        {monthsAsc.map((month) => {
          const items = grouped.get(month) ?? [];
          const isCurrent = currentMonth === month;
          const isFuture = month > currentMonth;
          const monthAchieved = items.filter((i) =>
            achievedMap.has(i.id),
          ).length;
          return (
            <div
              key={month}
              className={`overflow-hidden rounded-2xl border shadow-sm ${
                isCurrent
                  ? "border-rose-300 bg-rose-50"
                  : "border-gray-100 bg-white"
              } ${isFuture ? "opacity-70" : ""}`}
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
                <div className="font-semibold text-gray-800">
                  {month} bulan
                </div>
                <div className="flex items-center gap-2">
                  {isCurrent ? (
                    <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                      SEKARANG
                    </span>
                  ) : null}
                  <span className="text-xs text-gray-400">
                    {monthAchieved}/{items.length}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {items.map((item) => (
                  <MilestoneRow
                    key={item.id}
                    milestoneKey={item.id}
                    text={item.text}
                    achievedAt={achievedMap.get(item.id) ?? null}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-gray-400">
        Berdasarkan rekomendasi KPSP/IDAI. Konsultasikan ke dokter anak
        untuk evaluasi medis.
      </p>
    </main>
  );
}
