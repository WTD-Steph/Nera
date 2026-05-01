import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "@/lib/household/current";
import { getCurrentBaby } from "@/lib/household/baby";
import { createBabyAction } from "./actions";

type SearchParams = { error?: string };

export default async function SetupBabyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/setup/baby");

  const household = await getCurrentHousehold();
  if (!household) redirect("/setup");

  const existing = await getCurrentBaby();
  if (existing) redirect("/");

  const error = searchParams.error;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-12">
      <div className="mb-8 flex flex-col items-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-pink-400 text-2xl shadow-md">
          <span aria-hidden>👶</span>
        </div>
        <h1 className="mt-3 text-xl font-bold text-gray-900">Profil Bayi</h1>
        <p className="mt-1 text-xs text-gray-500">
          Keluarga {household.household_name}
        </p>
      </div>

      <div className="w-full rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-gray-800">
          Tambah profil bayi pertama
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          Data ini dipakai untuk hitung usia, percentile WHO, dan jadwal
          imunisasi. Bisa di-edit lagi nanti.
        </p>

        <form action={createBabyAction} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Nama panggilan</span>
            <input
              type="text"
              name="name"
              required
              autoFocus
              maxLength={50}
              placeholder="Nera"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
            />
          </label>

          <fieldset>
            <legend className="text-xs font-semibold text-gray-600">
              Jenis kelamin
            </legend>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 hover:bg-rose-50 has-[:checked]:border-rose-400 has-[:checked]:bg-rose-50">
                <input type="radio" name="gender" value="female" required />
                <span className="text-sm font-medium text-gray-800">Perempuan</span>
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 hover:bg-rose-50 has-[:checked]:border-rose-400 has-[:checked]:bg-rose-50">
                <input type="radio" name="gender" value="male" required />
                <span className="text-sm font-medium text-gray-800">Laki-laki</span>
              </label>
            </div>
          </fieldset>

          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Tanggal lahir</span>
            <input
              type="date"
              name="dob"
              required
              max={new Date().toISOString().slice(0, 10)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">
                Berat lahir (kg)
              </span>
              <input
                type="number"
                name="birth_weight_kg"
                required
                step="0.01"
                min="0.5"
                max="10"
                inputMode="decimal"
                placeholder="3.20"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">
                Panjang lahir (cm)
              </span>
              <input
                type="number"
                name="birth_height_cm"
                required
                step="0.1"
                min="20"
                max="80"
                inputMode="decimal"
                placeholder="49.5"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
              />
            </label>
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-600 active:bg-rose-700"
          >
            Simpan dan masuk
          </button>
        </form>

        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
