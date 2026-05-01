import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "@/lib/household/current";

type SearchParams = { welcome?: string };

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

  const current = await getCurrentHousehold();
  if (!current) redirect("/setup");

  const welcome = searchParams.welcome;
  const welcomeMsg =
    welcome === "created"
      ? `Keluarga "${current.household_name}" siap. Profil bayi menyusul di PR #3.`
      : welcome === "joined"
        ? `Selamat datang ke keluarga ${current.household_name}!`
        : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-pink-400 text-3xl shadow-md">
        <span aria-hidden>👶</span>
      </div>
      <h1 className="mt-6 text-2xl font-bold text-gray-900">
        Keluarga {current.household_name}
      </h1>
      <p className="mt-2 text-sm text-gray-600">
        Anda masuk sebagai{" "}
        <span className="font-semibold text-gray-900">{user.email}</span> ·{" "}
        {current.role === "owner" ? "Owner" : "Member"}
      </p>

      {welcomeMsg ? (
        <div className="mt-4 w-full rounded-2xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-800">
          {welcomeMsg}
        </div>
      ) : null}

      <div className="mt-6 w-full rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm">
        <h2 className="text-sm font-bold text-gray-800">Belum ada bayi</h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-600">
          Auth + household sudah aktif (PR #2a + #2b). Profil bayi, log harian,
          chart pertumbuhan, dan analisis AI menyusul mulai PR #3.
        </p>
      </div>

      <div className="mt-4 grid w-full grid-cols-2 gap-2">
        <a
          href="/more/household"
          className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-rose-600"
        >
          Atur keluarga
        </a>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Keluar
          </button>
        </form>
      </div>

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
