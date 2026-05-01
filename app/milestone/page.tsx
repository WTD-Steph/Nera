import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";
import { MILESTONES_LIST } from "@/lib/constants/milestones";
import { ageInMonths } from "@/lib/constants/who-percentiles";
import { fmtDate } from "@/lib/compute/format";
import { toggleMilestoneAction } from "@/app/actions/milestone";
import { ProgressRealtime } from "@/components/ProgressRealtime";

export default async function MilestonePage() {
  const user = await getCachedUser();
  if (!user) redirect("/login?next=/milestone");

  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const supabase = createClient();

  const { data: progress } = await supabase
    .from("milestone_progress")
    .select("milestone_key, achieved_at")
    .eq("baby_id", baby.id);

  const achievedMap = new Map<string, string>();
  for (const p of progress ?? []) {
    achievedMap.set(p.milestone_key, p.achieved_at);
  }

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
                {items.map((item) => {
                  const achievedAt = achievedMap.get(item.id);
                  const checked = !!achievedAt;
                  return (
                    <form
                      key={item.id}
                      action={toggleMilestoneAction}
                      className="hover:bg-gray-50 active:bg-gray-100"
                    >
                      <input
                        type="hidden"
                        name="milestone_key"
                        value={item.id}
                      />
                      <input
                        type="hidden"
                        name="achieved"
                        value={checked ? "1" : "0"}
                      />
                      <input
                        type="hidden"
                        name="return_to"
                        value="/milestone"
                      />
                      <button
                        type="submit"
                        className="flex w-full items-start gap-3 px-4 py-3 text-left"
                      >
                        <div
                          className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                            checked
                              ? "border-rose-500 bg-rose-500 text-white"
                              : "border-gray-300"
                          }`}
                        >
                          {checked ? (
                            <svg
                              className="h-3 w-3"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : null}
                        </div>
                        <div className="flex-1">
                          <div
                            className={`text-sm leading-snug ${
                              checked ? "text-gray-800" : "text-gray-700"
                            }`}
                          >
                            {item.text}
                          </div>
                          {achievedAt ? (
                            <div className="mt-0.5 text-[11px] text-rose-500">
                              tercapai {fmtDate(achievedAt)}
                            </div>
                          ) : null}
                        </div>
                      </button>
                    </form>
                  );
                })}
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
