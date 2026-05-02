import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";
import { IMUNISASI_LIST } from "@/lib/constants/imunisasi";
import { ageInMonths } from "@/lib/constants/who-percentiles";
import { ProgressRealtime } from "@/components/ProgressRealtime";
import { ImunisasiRow } from "@/components/ImunisasiRow";

type SearchParams = {
  imusaved?: string;
  imuerror?: string;
};

export default async function ImunisasiPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCachedUser();
  if (!user) redirect("/login?next=/imunisasi");

  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const supabase = createClient();

  const { data: progress } = await supabase
    .from("immunization_progress")
    .select("vaccine_key, given_at, facility, doctor_name, notes")
    .eq("baby_id", baby.id);

  const givenMap = new Map<
    string,
    {
      given_at: string;
      facility: string | null;
      doctor_name: string | null;
      notes: string | null;
    }
  >();
  for (const p of progress ?? []) {
    givenMap.set(p.vaccine_key, {
      given_at: p.given_at,
      facility: p.facility,
      doctor_name: p.doctor_name,
      notes: p.notes,
    });
  }
  const pastFacilities = [
    ...new Set(
      (progress ?? [])
        .map((p) => p.facility)
        .filter((v): v is string => !!v && v.trim() !== ""),
    ),
  ].sort();
  const pastDoctors = [
    ...new Set(
      (progress ?? [])
        .map((p) => p.doctor_name)
        .filter((v): v is string => !!v && v.trim() !== ""),
    ),
  ].sort();

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
        <Link href="/" className="text-sm text-rose-600 hover:underline">
          ← Beranda
        </Link>
        <h1 className="text-base font-bold text-gray-900">Imunisasi</h1>
        <span className="w-12" />
      </header>

      {searchParams.imuerror ? (
        <div className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">
          {searchParams.imuerror}
        </div>
      ) : null}

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
        Berdasarkan rekomendasi IDAI 0–12 bulan. Tap row untuk catat tanggal,
        rumah sakit, dan catatan dokter. Diskusikan jadwal aktual dengan
        dokter anak.
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
                  const detail = givenMap.get(item.id) ?? null;
                  return (
                    <ImunisasiRow
                      key={item.id}
                      pastFacilities={pastFacilities}
                      pastDoctors={pastDoctors}
                      data={{
                        vaccineKey: item.id,
                        vaccineName: item.name,
                        givenAt: detail?.given_at ?? null,
                        facility: detail?.facility ?? null,
                        doctorName: detail?.doctor_name ?? null,
                        notes: detail?.notes ?? null,
                      }}
                    />
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
