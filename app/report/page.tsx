import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";
import {
  buildAiContext,
  type BabyMeta,
  type LogRow,
  type GrowthRow,
} from "@/lib/report/builder";
import { PromptCopier } from "@/components/PromptCopier";

export default async function ReportPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login?next=/report");

  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const supabase = createClient();

  const [logsRes, growthRes] = await Promise.all([
    supabase
      .from("logs")
      .select(
        "id, subtype, timestamp, end_timestamp, amount_ml, amount_l_ml, amount_r_ml, duration_l_min, duration_r_min, has_pee, has_poop, poop_color, poop_consistency, temp_celsius, med_name, med_dose, bottle_content, notes",
      )
      .eq("baby_id", baby.id)
      .gte(
        "timestamp",
        new Date(Date.now() - 14 * 86400000).toISOString(),
      )
      .order("timestamp", { ascending: false }),
    supabase
      .from("growth_measurements")
      .select("measured_at, weight_kg, height_cm, head_circ_cm, notes")
      .eq("baby_id", baby.id)
      .order("measured_at", { ascending: true }),
  ]);

  const babyMeta: BabyMeta = {
    id: baby.id,
    name: baby.name,
    gender: baby.gender,
    dob: baby.dob,
    birth_weight_kg: baby.birth_weight_kg,
    birth_height_cm: baby.birth_height_cm,
  };

  const aiContext = buildAiContext({
    baby: babyMeta,
    logs: (logsRes.data ?? []) as LogRow[],
    growth: (growthRes.data ?? []) as GrowthRow[],
  });

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6 md:max-w-2xl">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-rose-600 hover:underline">
          ← Beranda
        </Link>
        <h1 className="text-base font-bold text-gray-900">Laporan</h1>
        <span className="w-12" />
      </header>

      {/* CSV export */}
      <section className="mt-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-800">📥 Export CSV</h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          Download semua data {baby.name} (profil, logs, pengukuran,
          milestone, imunisasi) sebagai CSV. Cocok untuk dibawa ke dokter
          anak / posyandu, atau di-import ke Excel/Sheets.
        </p>
        <a
          href="/api/export"
          download
          className="mt-3 block rounded-xl bg-rose-500 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-rose-600 active:bg-rose-700"
        >
          Download CSV
        </a>
      </section>

      {/* AI prompt copier */}
      <section className="mt-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-800">
          🤖 Tanya Claude (paste eksternal)
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          Pilih topik analisis, salin prompt, lalu paste di Claude.ai atau
          LLM lain untuk dapat analisis berbasis data {baby.name}.
        </p>
        <div className="mt-4">
          <PromptCopier context={aiContext} />
        </div>
      </section>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-gray-400">
        Analisis AI sifatnya pelengkap, bukan pengganti konsultasi dokter
        anak. Untuk evaluasi medis, selalu konsultasi langsung.
      </p>
    </main>
  );
}
