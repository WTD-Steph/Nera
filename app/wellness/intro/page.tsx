import { redirect } from "next/navigation";
import Link from "next/link";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";
import { createClient } from "@/lib/supabase/server";
import { setPerinatalRoleAction } from "@/app/actions/wellness";

export default async function WellnessIntroPage({
  searchParams,
}: {
  searchParams: { err?: string };
}) {
  const user = await getCachedUser();
  if (!user) redirect("/login?next=/wellness/intro");
  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const supabase = createClient();
  const { data: member } = await supabase
    .from("household_members")
    .select("perinatal_role")
    .eq("household_id", baby.household_id)
    .eq("user_id", user.id)
    .single();

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6 md:max-w-lg">
      <header className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-rose-600 hover:underline">
          ← Beranda
        </Link>
        <h1 className="text-base font-bold text-gray-900">Wellness · Intro</h1>
        <span className="w-12" />
      </header>

      <section className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5">
        <h2 className="text-lg font-bold text-gray-900">🌿 Untuk Anda</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          Modul ini membantu cek perasaan Anda selama masa pasca persalinan.
          Bukan diagnosis — hanya skrining.
        </p>
        <div className="mt-3 space-y-1.5 text-[13px] text-gray-700">
          <div>· Daily mood check-in opsional</div>
          <div>· EPDS skrining mingguan (10 pertanyaan)</div>
          <div>· Skor + rekomendasi kalau diperlukan</div>
        </div>
        <div className="mt-3 rounded-xl bg-white p-3 text-[12px] leading-relaxed text-gray-700">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Privasi
          </div>
          <ul className="space-y-1 pl-3">
            <li>
              · Data wellness <strong>PRIBADI</strong> — tidak otomatis
              dibagikan ke pasangan
            </li>
            <li>· Anda kontrol berbagi nanti via /wellness/share</li>
            <li>· Editable 24 jam setelah dibuat, lalu locked</li>
          </ul>
        </div>
      </section>

      <form action={setPerinatalRoleAction} className="mt-5 space-y-3">
        <div className="text-sm font-semibold text-gray-800">
          Peran perinatal Anda
        </div>
        <p className="text-[11px] leading-snug text-gray-500">
          Menentukan threshold skor EPDS yang sesuai (ibu vs ayah punya cutoff
          berbeda per evidence pediatric).
        </p>

        <div className="space-y-2">
          {(
            [
              { value: "mother", label: "🤱 Ibu (mother)", desc: "Cutoff EPDS 10/13" },
              { value: "father", label: "👨 Ayah (father)", desc: "Cutoff EPDS 10/12" },
              {
                value: "caregiver",
                label: "🤝 Bukan orang tua bayi (caregiver)",
                desc: "Akses module terbatas — defer ke v2",
              },
              { value: "other", label: "Lainnya", desc: "" },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-start gap-2 rounded-xl border border-gray-200 bg-white p-3 hover:border-emerald-300"
            >
              <input
                type="radio"
                name="perinatal_role"
                value={opt.value}
                defaultChecked={member?.perinatal_role === opt.value}
                className="mt-1 accent-emerald-600"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {opt.label}
                </div>
                {opt.desc ? (
                  <div className="text-[11px] text-gray-500">{opt.desc}</div>
                ) : null}
              </div>
            </label>
          ))}
        </div>

        {searchParams.err ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {searchParams.err}
          </div>
        ) : null}

        <button
          type="submit"
          className="w-full rounded-2xl bg-emerald-600 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          Mulai
        </button>
        <Link
          href="/"
          className="block text-center text-xs text-gray-400 hover:text-gray-600"
        >
          Nanti dulu
        </Link>
      </form>

      <p className="mt-6 text-[10px] leading-snug text-gray-400">
        EPDS: Cox, Holden, Sagovsky (BJP 1987;150:782-786). Indonesian
        validation: Hutauruk 2012, Jurnal Psikologi Universitas Gunadarma.
        Paternal cutoff: Mughal et al. Heliyon 2022 meta-analysis.
      </p>
    </main>
  );
}
