import { redirect } from "next/navigation";
import Link from "next/link";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/SubmitButton";
import { updateBabyAction } from "./actions";
import { DbfEstimateFieldset } from "./DbfEstimateFieldset";
import {
  addRoutineAction,
  deleteRoutineAction,
} from "@/app/actions/routines";

type SearchParams = { error?: string; saved?: string };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCachedUser();
  if (!user) redirect("/login?next=/more/profile");

  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const error = searchParams.error;
  const saved = searchParams.saved === "1";

  const supabase = createClient();
  const { data: routinesData } = await supabase
    .from("routines")
    .select("id, name, emoji, needs_duration, display_order")
    .eq("baby_id", baby.id)
    .order("display_order", { ascending: true });
  const routines = routinesData ?? [];

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6 md:max-w-2xl">
      <header className="mb-4">
        <Link href="/" className="text-sm text-rose-600 hover:underline">
          ← Kembali
        </Link>
      </header>

      <h1 className="text-base font-bold text-gray-900">Profil Bayi</h1>
      <p className="mt-1 text-xs text-gray-500">
        Edit data dasar bayi. Perubahan tersimpan permanen.
      </p>

      {saved ? (
        <div className="flash-in mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-sm">
          <span
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"
            aria-hidden
          >
            ✓
          </span>
          <span>Perubahan berhasil tersimpan.</span>
        </div>
      ) : null}
      {error ? (
        <div className="flash-in mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 shadow-sm">
          <span
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-red-500 text-white"
            aria-hidden
          >
            !
          </span>
          <span>{error}</span>
        </div>
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

        <DbfEstimateFieldset
          fixedDefault={baby.dbf_ml_per_min}
          multiplierDefault={baby.dbf_pumping_multiplier}
        />

        <SubmitButton
          pendingText="Menyimpan…"
          className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-600 active:bg-rose-700"
        >
          Simpan perubahan
        </SubmitButton>
      </form>

      <section className="mt-8 border-t border-gray-100 pt-6">
        <h2 className="text-base font-bold text-gray-900">Ceklis Harian</h2>
        <p className="mt-1 text-xs text-gray-500">
          Item rutin yang dilakukan tiap hari (vitamin, jemur, dll). Muncul
          sebagai checklist di Beranda. Tap ✓ saat sudah dilakukan.
        </p>

        {routines.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {routines.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2"
              >
                <div className="flex items-center gap-2 text-sm text-gray-800">
                  <span aria-hidden>{r.emoji ?? "✓"}</span>
                  <span className="font-medium">{r.name}</span>
                  {r.needs_duration ? (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      + durasi
                    </span>
                  ) : null}
                </div>
                <form action={deleteRoutineAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input
                    type="hidden"
                    name="return_to"
                    value="/more/profile"
                  />
                  <SubmitButton
                    pendingText="…"
                    className="text-[11px] text-gray-300 hover:text-red-500"
                  >
                    Hapus
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs italic text-gray-400">
            Belum ada item. Tambah di bawah.
          </p>
        )}

        <form
          action={addRoutineAction}
          className="mt-4 space-y-2 rounded-xl border border-rose-100 bg-rose-50/40 p-3"
        >
          <input type="hidden" name="return_to" value="/more/profile" />
          <div className="text-[11px] font-semibold text-rose-700">
            ＋ Tambah ceklis
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              name="emoji"
              maxLength={4}
              placeholder="✓"
              className="w-12 rounded-lg border border-gray-200 bg-white px-2 py-2 text-center text-sm outline-none focus:border-rose-400"
            />
            <input
              type="text"
              name="name"
              required
              maxLength={80}
              placeholder="Nama (mis. Vitamin D)"
              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-400"
            />
          </div>
          <label className="flex items-center gap-2 rounded-lg bg-white px-2 py-2 text-[12px] text-gray-700">
            <input
              type="checkbox"
              name="needs_duration"
              value="1"
              className="h-4 w-4 accent-amber-500"
            />
            <span>
              Pakai durasi (mis. jemur 5–15 menit)
            </span>
          </label>
          <SubmitButton
            pendingText="…"
            className="w-full rounded-lg bg-rose-500 py-2 text-sm font-semibold text-white hover:bg-rose-600"
          >
            Tambah
          </SubmitButton>
        </form>
      </section>

      <div className="mt-8 border-t border-gray-100 pt-4">
        <p className="mb-2 text-[11px] text-gray-400">
          {user.email}
        </p>
        <form action="/auth/signout" method="post">
          <SubmitButton
            pendingText="Keluar…"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            🚪 Keluar dari akun
          </SubmitButton>
        </form>
      </div>
    </main>
  );
}
