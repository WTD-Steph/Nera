import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "@/lib/household/current";
import { getCurrentBaby } from "@/lib/household/baby";

type SearchParams = { welcome?: string };

function formatAge(dob: string): string {
  const days = Math.floor((Date.now() - new Date(dob).getTime()) / 86400000);
  if (days < 0) return "belum lahir";
  if (days === 0) return "baru lahir";
  if (days < 7) return `${days} hari`;
  if (days < 60) {
    const wk = Math.floor(days / 7);
    const rem = days % 7;
    return rem ? `${wk} mgu ${rem} hr` : `${wk} minggu`;
  }
  const months = days / 30.44;
  if (months < 12) return `${months.toFixed(1)} bulan`;
  return `${(months / 12).toFixed(1)} tahun`;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const household = await getCurrentHousehold();
  if (!household) redirect("/setup");

  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup/baby");

  const welcome = searchParams.welcome;
  const welcomeMsg =
    welcome === "baby"
      ? `Profil ${baby.name} tersimpan. Quick log + chart pertumbuhan menyusul di PR #4–#5.`
      : welcome === "joined"
        ? `Selamat datang ke keluarga ${household.household_name}!`
        : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-pink-400 text-3xl shadow-md">
        <span aria-hidden>👶</span>
      </div>
      <h1 className="mt-6 text-2xl font-bold text-gray-900">{baby.name}</h1>
      <p className="mt-1 text-sm text-gray-600">
        {formatAge(baby.dob)} ·{" "}
        {baby.gender === "female" ? "Perempuan" : "Laki-laki"}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        {household.household_name} · Anda{" "}
        {household.role === "owner" ? "Owner" : "Member"} ({user.email})
      </p>

      {welcomeMsg ? (
        <div className="mt-4 w-full rounded-2xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-800">
          {welcomeMsg}
        </div>
      ) : null}

      <div className="mt-6 w-full rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm">
        <h2 className="text-sm font-bold text-gray-800">
          Logging belum aktif
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-600">
          Profil bayi sudah tersimpan (PR #3). Quick log harian (sufor, DBF,
          pumping, popok, tidur, dll), chart pertumbuhan WHO, dan analisis AI
          menyusul di PR #4 onwards.
        </p>
      </div>

      <div className="mt-4 grid w-full grid-cols-2 gap-2">
        <a
          href="/more/profile"
          className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-rose-600"
        >
          Edit profil bayi
        </a>
        <a
          href="/more/household"
          className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Atur keluarga
        </a>
      </div>

      <form action="/auth/signout" method="post" className="mt-3">
        <button
          type="submit"
          className="text-xs font-semibold text-gray-500 underline-offset-2 hover:text-rose-600 hover:underline"
        >
          Keluar
        </button>
      </form>

      <a
        href="https://github.com/WTD-Steph/Nera/blob/main/PROJECT_BRIEF.md"
        className="mt-6 text-[11px] text-gray-400 underline-offset-2 hover:underline"
        target="_blank"
        rel="noreferrer"
      >
        PROJECT_BRIEF.md
      </a>
    </main>
  );
}
