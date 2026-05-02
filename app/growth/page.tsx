import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";
import { SubmitButton } from "@/components/SubmitButton";
import {
  WHO_W_BOY,
  WHO_W_GIRL,
  WHO_H_BOY,
  WHO_H_GIRL,
  ageInMonths,
} from "@/lib/constants/who-percentiles";
import { GrowthChart, type DataPoint } from "@/components/GrowthChart";
import { GrowthMeasureTrigger } from "@/components/GrowthMeasureModal";
import { GrowthRealtime } from "@/components/GrowthRealtime";
import { fmtDate } from "@/lib/compute/format";
import { deleteGrowthAction } from "@/app/actions/growth";

type SearchParams = {
  growthsaved?: string;
  growtherror?: string;
};

type Measurement = {
  id: string;
  measured_at: string;
  weight_kg: number;
  height_cm: number;
  head_circ_cm: number | null;
  notes: string | null;
};

export default async function GrowthPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCachedUser();
  if (!user) redirect("/login?next=/growth");

  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const supabase = createClient();

  const { data: rows } = await supabase
    .from("growth_measurements")
    .select("id, measured_at, weight_kg, height_cm, head_circ_cm, notes")
    .eq("baby_id", baby.id)
    .order("measured_at", { ascending: true });

  const measurements: Measurement[] = (rows ?? []) as Measurement[];

  const isMale = baby.gender === "male";
  const refW = isMale ? WHO_W_BOY : WHO_W_GIRL;
  const refH = isMale ? WHO_H_BOY : WHO_H_GIRL;
  const genderLabel = isMale ? "laki-laki" : "perempuan";

  // Birth point sebagai data ke-0 (dari babies row)
  const birthPoint: DataPoint = {
    m: 0,
    user: 0, // override per chart
    isBirth: true,
  };

  const userWeightPoints: DataPoint[] = [
    { ...birthPoint, user: baby.birth_weight_kg },
    ...measurements.map((m) => ({
      m: ageInMonths(baby.dob, new Date(m.measured_at).getTime()),
      user: m.weight_kg,
    })),
  ];
  const userHeightPoints: DataPoint[] = [
    { ...birthPoint, user: baby.birth_height_cm },
    ...measurements.map((m) => ({
      m: ageInMonths(baby.dob, new Date(m.measured_at).getTime()),
      user: m.height_cm,
    })),
  ];

  // Latest pengukuran (atau birth kalau belum ada)
  const latest =
    measurements.length > 0
      ? {
          weight: measurements[measurements.length - 1]!.weight_kg,
          height: measurements[measurements.length - 1]!.height_cm,
          headCirc: measurements[measurements.length - 1]!.head_circ_cm,
          measured_at: measurements[measurements.length - 1]!.measured_at,
          isBirth: false,
        }
      : {
          weight: baby.birth_weight_kg,
          height: baby.birth_height_cm,
          headCirc: null,
          measured_at: baby.dob,
          isBirth: true,
        };

  const latestAge = ageInMonths(
    baby.dob,
    new Date(latest.measured_at).getTime(),
  );

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6 md:max-w-2xl lg:max-w-3xl">
      <GrowthRealtime babyId={baby.id} />
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-rose-600 hover:underline">
          ← Beranda
        </Link>
        <h1 className="text-base font-bold text-gray-900">Tumbuh Kembang</h1>
        <GrowthMeasureTrigger className="rounded-full bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm">
          + Ukur
        </GrowthMeasureTrigger>
      </header>

      {searchParams.growtherror ? (
        <div className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">
          {searchParams.growtherror}
        </div>
      ) : null}

      <section className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="text-xs text-gray-500">Pengukuran Terakhir</div>
        <div className="mt-1 text-2xl font-bold text-rose-500">
          {latest.weight}{" "}
          <span className="text-sm text-gray-400">kg</span>
          <span className="mx-2 text-base text-gray-300">/</span>
          {latest.height}{" "}
          <span className="text-sm text-gray-400">cm</span>
          {latest.headCirc != null ? (
            <>
              <span className="mx-2 text-base text-gray-300">/</span>
              {latest.headCirc}{" "}
              <span className="text-sm text-gray-400">cm LK</span>
            </>
          ) : null}
        </div>
        <div className="mt-1 text-xs text-gray-500">
          {latest.isBirth ? "Saat lahir" : fmtDate(latest.measured_at)} · usia{" "}
          {latestAge.toFixed(1)} bln
        </div>
      </section>

      <section className="mt-4 space-y-3">
        <GrowthChart
          title="Berat Badan"
          unit="kg"
          refData={refW}
          userPoints={userWeightPoints}
        />
        <GrowthChart
          title="Panjang Badan"
          unit="cm"
          refData={refH}
          userPoints={userHeightPoints}
        />
      </section>

      <p className="mt-2 text-center text-[11px] leading-relaxed text-gray-400">
        Garis abu-abu = referensi WHO untuk anak {genderLabel}
        <br />
        (P3 — P50 — P97). Konsultasikan ke dokter anak untuk evaluasi medis.
      </p>

      <section className="mt-5">
        <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700">
          Riwayat Pengukuran
        </h2>
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {/* Birth row first (always shown) */}
          <div className="flex items-center justify-between border-b border-gray-50 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-gray-800">
                {baby.birth_weight_kg} kg · {baby.birth_height_cm} cm
              </div>
              <div className="text-[11px] text-gray-400">
                Saat lahir · {fmtDate(baby.dob)}
              </div>
            </div>
            <div className="text-[11px] text-gray-400">0.0 bln</div>
          </div>

          {[...measurements].reverse().map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between border-b border-gray-50 px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-800">
                  {m.weight_kg} kg · {m.height_cm} cm
                  {m.head_circ_cm != null
                    ? ` · LK ${m.head_circ_cm} cm`
                    : ""}
                </div>
                <div className="text-[11px] text-gray-400">
                  {fmtDate(m.measured_at)} · usia{" "}
                  {ageInMonths(baby.dob, new Date(m.measured_at).getTime()).toFixed(
                    1,
                  )}{" "}
                  bln
                </div>
                {m.notes ? (
                  <div className="mt-0.5 text-[11px] italic text-gray-500">
                    {m.notes}
                  </div>
                ) : null}
              </div>
              <form action={deleteGrowthAction}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="return_to" value="/growth" />
                <SubmitButton
                  pendingText="…"
                  className="text-[11px] text-gray-400 hover:text-red-600"
                >
                  Hapus
                </SubmitButton>
              </form>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
