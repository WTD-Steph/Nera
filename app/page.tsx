import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-pink-400 text-3xl shadow-md">
        <span aria-hidden>👶</span>
      </div>
      <h1 className="mt-6 text-2xl font-bold text-gray-900">Nera</h1>
      <p className="mt-2 text-sm text-gray-600">
        Anda masuk sebagai{" "}
        <span className="font-semibold text-gray-900">{user.email}</span>.
      </p>

      <div className="mt-8 w-full rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm">
        <h2 className="text-sm font-bold text-gray-800">Belum ada household</h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-600">
          Auth flow sudah aktif (PR #2a). Pembuatan household, profil bayi, dan
          undangan member menyusul di PR #2b dan PR #3.
        </p>
      </div>

      <form action="/auth/signout" method="post" className="mt-6">
        <button
          type="submit"
          className="text-xs font-semibold text-rose-600 underline-offset-2 hover:underline"
        >
          Keluar
        </button>
      </form>

      <a
        href="https://github.com/WTD-Steph/Nera/blob/main/PROJECT_BRIEF.md"
        className="mt-8 text-[11px] text-gray-400 underline-offset-2 hover:underline"
        target="_blank"
        rel="noreferrer"
      >
        PROJECT_BRIEF.md
      </a>
    </main>
  );
}
