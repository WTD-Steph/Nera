type SearchParams = { email?: string };

export default function VerifyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const email = searchParams.email ?? "email Anda";

  return (
    <div>
      <h2 className="text-base font-bold text-gray-800">Cek email Anda</h2>
      <p className="mt-3 text-sm text-gray-600">
        Magic link sudah dikirim ke{" "}
        <span className="font-semibold text-gray-800">{email}</span>.
      </p>
      <p className="mt-2 text-sm text-gray-600">
        Buka email tersebut dan klik tombol login. Anda akan otomatis kembali
        ke aplikasi setelah klik.
      </p>

      <div className="mt-5 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
        Tidak menerima email dalam 1–2 menit? Cek folder spam, atau{" "}
        <a href="/login" className="font-semibold underline-offset-2 hover:underline">
          kirim ulang
        </a>
        .
      </div>
    </div>
  );
}
