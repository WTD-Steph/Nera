import Link from "next/link";
import { signUpAction } from "./actions";

type SearchParams = { error?: string; next?: string; email?: string };

export default function SignupPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const error = searchParams.error;
  const next = searchParams.next ?? "/";
  const prefilledEmail = searchParams.email ?? "";

  return (
    <div>
      <h2 className="text-base font-bold text-gray-800">Daftar akun</h2>
      <p className="mt-1 text-xs text-gray-500">
        Sudah punya akun?{" "}
        <Link
          href={`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-semibold text-rose-600 underline-offset-2 hover:underline"
        >
          Masuk
        </Link>
      </p>

      <form action={signUpAction} className="mt-5 space-y-3">
        <input type="hidden" name="next" value={next} />
        <label className="block">
          <span className="text-xs font-semibold text-gray-600">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            inputMode="email"
            defaultValue={prefilledEmail}
            placeholder="anda@email.com"
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-gray-600">
            Password (minimal 6 karakter)
          </span>
          <input
            type="password"
            name="password"
            required
            minLength={6}
            autoComplete="new-password"
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-600 active:bg-rose-700"
        >
          Buat akun
        </button>
      </form>

      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      <p className="mt-6 text-[11px] leading-relaxed text-gray-400">
        Tidak ada email konfirmasi — Anda langsung masuk setelah daftar.
        Simpan password baik-baik (Supabase reset-password belum diintegrasikan
        di v1).
      </p>
    </div>
  );
}
