import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBaby } from "@/lib/household/baby";
import { IMUNISASI_LIST } from "@/lib/constants/imunisasi";
import { ageInMonths } from "@/lib/constants/who-percentiles";
import { fmtDate } from "@/lib/compute/format";
import { toggleImmunizationAction } from "@/app/actions/imunisasi";
import { ProgressRealtime } from "@/components/ProgressRealtime";

export default async function ImunisasiPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/imunisasi");

  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const { data: progress } = await supabase
    .from("immunization_progress")
    .select("vaccine_key, given_at")
    .eq("baby_id", baby.id);

  const givenMap = new Map<string, string>();
  for (const p of progress ?? []) {
    givenMap.set(p.vaccine_key, p.given_at);
  }

  const currentMonth = ageInMonths(baby.dob);
  const totalGiven = givenMap.size;
  const totalVaccines = IMUNISASI_LIST.length;

  const grouped = new Map<number, typeof IMUNISASI_LIST>();
  for (const v of IMUNISASI_LIST) {
    const arr = grouped.get(v.month) ?? [];
    arr.push(v);
    grouped.set(v.month, arr);
  }
  const monthsAsc = [...grouped.keys()].sort((a, b) => a - b);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6 md:max-w-2xl lg:max-w-3xl">
      <ProgressRealtime babyId={baby.id} table="immunization_progress" />
      <header className="flex items-center justify-between">
        <a href="/" className="text-sm text-rose-600 hover:underline">
          ← Beranda
        </a>
        <h1 className="text-base font-bold text-gray-900">Imunisasi</h1>
        <span className="w-12" />
      </header>

      <section className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Sudah diberikan</div>
            <div className="text-2xl font-bold text-rose-500">
              {totalGiven}{" "}
              <span className="text-sm text-gray-400">/ {totalVaccines}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Usia saat ini</div>
            <div className="text-base font-bold text-gray-700">
              {currentMonth.toFixed(1)} bln
            </div>
          </div>
        </div>
      </section>

      <p className="mt-3 px-1 text-[11px] leading-relaxed text-gray-500">
        Berdasarkan rekomendasi IDAI 0–12 bulan. Diskusikan jadwal aktual
        dengan dokter anak.
      </p>

      <section className="mt-3 space-y-3">
        {monthsAsc.map((month) => {
          const items = grouped.get(month) ?? [];
          const isDue = month <= Math.floor(currentMonth);
          const monthGiven = items.filter((i) => givenMap.has(i.id)).length;
          return (
            <div
              key={month}
              className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
                <div className="font-semibold text-gray-800">
                  Usia {month} bulan
                </div>
                <div className="flex items-center gap-2">
                  {isDue && monthGiven < items.length ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      Jatuh tempo
                    </span>
                  ) : null}
                  <span className="text-xs text-gray-400">
                    {monthGiven}/{items.length}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {items.map((item) => {
                  const givenAt = givenMap.get(item.id);
                  const given = !!givenAt;
                  return (
                    <form
                      key={item.id}
                      action={toggleImmunizationAction}
                      className="hover:bg-gray-50 active:bg-gray-100"
                    >
                      <input
                        type="hidden"
                        name="vaccine_key"
                        value={item.id}
                      />
                      <input
                        type="hidden"
                        name="given"
                        value={given ? "1" : "0"}
                      />
                      <input
                        type="hidden"
                        name="return_to"
                        value="/imunisasi"
                      />
                      <button
                        type="submit"
                        className="flex w-full items-start gap-3 px-4 py-3 text-left"
                      >
                        <div
                          className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                            given
                              ? "border-green-500 bg-green-500 text-white"
                              : "border-gray-300"
                          }`}
                        >
                          {given ? (
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
                          <div className="text-sm font-medium text-gray-800">
                            {item.name}
                          </div>
                          {givenAt ? (
                            <div className="mt-0.5 text-[11px] text-green-600">
                              diberikan {fmtDate(givenAt)}
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
    </main>
  );
}
