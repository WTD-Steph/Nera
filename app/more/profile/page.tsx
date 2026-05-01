import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBaby } from "@/lib/household/baby";
import { updateBabyAction } from "./actions";

type SearchParams = { error?: string; saved?: string };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/more/profile");

  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const error = searchParams.error;
  const saved = searchParams.saved === "1";

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6">
      <header className="mb-4">
        <a href="/" className="text-sm text-rose-600 hover:underline">
          ← Kembali
        </a>
      </header>

      <h1 className="text-base font-bold text-gray-900">Profil Bayi</h1>
      <p className="mt-1 text-xs text-gray-500">
        Edit data dasar bayi. Perubahan tersimpan permanen.
      </p>

      {saved ? (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
          Profil tersimpan.
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      <form
        action={updateBabyAction}
        className="mt-5 space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
      >
        <input type="hidden" name="id" value={baby.id} />

        <label className="block">
          <span className="text-xs font-semibold text-gray-600">Nama panggilan</span>
          <input
            type="text"
            name="name"
            required
            maxLength={50}
            defaultValue={baby.name}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
          />
        </label>

        <fieldset>
          <legend className="text-xs font-semibold text-gray-600">
            Jenis kelamin
          </legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 hover:bg-rose-50 has-[:checked]:border-rose-400 has-[:checked]:bg-rose-50">
              <input
                type="radio"
                name="gender"
                value="female"
                required
                defaultChecked={baby.gender === "female"}
              />
              <span className="text-sm font-medium text-gray-800">Perempuan</span>
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 hover:bg-rose-50 has-[:checked]:border-rose-400 has-[:checked]:bg-rose-50">
              <input
                type="radio"
                name="gender"
                value="male"
                required
                defaultChecked={baby.gender === "male"}
              />
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
            defaultValue={baby.dob}
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
              defaultValue={baby.birth_weight_kg}
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
              defaultValue={baby.birth_height_cm}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
            />
          </label>
        </div>

        <button
          type="submit"
          className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-600 active:bg-rose-700"
        >
          Simpan perubahan
        </button>
      </form>
    </main>
  );
}
