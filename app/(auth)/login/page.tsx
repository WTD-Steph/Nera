import { requestMagicLink } from "./actions";

type SearchParams = { error?: string };

export default function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const error = searchParams.error;

  return (
    <div>
      <h2 className="text-base font-bold text-gray-800">Masuk</h2>
      <p className="mt-1 text-xs text-gray-500">
        Kami akan kirim link masuk ke email Anda. Tidak perlu password.
      </p>

      <form action={requestMagicLink} className="mt-5 space-y-3">
        <label className="block">
          <span className="text-xs font-semibold text-gray-600">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="anda@email.com"
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-600 active:bg-rose-700"
        >
          Kirim Magic Link
        </button>
      </form>

      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      <p className="mt-6 text-[11px] leading-relaxed text-gray-400">
        Dengan masuk, Anda menyetujui data tracking bayi disimpan di akun ini.
        Konsultasi dokter anak tetap diperlukan untuk evaluasi medis.
      </p>
    </div>
  );
}
