import { redirect } from "next/navigation";
import Link from "next/link";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentHousehold } from "@/lib/household/current";
import { SubmitButton } from "@/components/SubmitButton";
import { createHouseholdAction } from "./actions";

type SearchParams = { error?: string };

export default async function SetupPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCachedUser();
  if (!user) redirect("/login?next=/setup");

  // Sudah punya household → tidak perlu setup lagi
  const current = await getCurrentHousehold();
  if (current) redirect("/");

  const error = searchParams.error;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-12">
      <div className="mb-8 flex flex-col items-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-pink-400 text-2xl shadow-md">
          <span aria-hidden>👶</span>
        </div>
        <h1 className="mt-3 text-xl font-bold text-gray-900">Nera</h1>
        <p className="mt-1 text-xs text-gray-500">
          Halo, {user.email}
        </p>
      </div>

      <div className="w-full rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-gray-800">
          Buat keluarga baru
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          Beri nama keluarga Anda — bisa nama lengkap, panggilan, atau bebas.
          Anda jadi owner dan bisa mengundang pasangan / caregiver lain di
          menu Lainnya.
        </p>

        <form action={createHouseholdAction} className="mt-5 space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">
              Nama keluarga
            </span>
            <input
              type="text"
              name="name"
              required
              autoFocus
              maxLength={50}
              placeholder="Keluarga Wicardo"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
            />
          </label>
          <SubmitButton
            pendingText="Membuat keluarga…"
            className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-600 active:bg-rose-700"
          >
            Lanjut
          </SubmitButton>
        </form>

        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-gray-400">
        Atau{" "}
        <Link
          href="/login"
          className="font-semibold text-rose-600 underline-offset-2 hover:underline"
        >
          masuk dengan email lain
        </Link>{" "}
        kalau Anda dapat undangan keluarga lain.
      </p>
    </main>
  );
}
