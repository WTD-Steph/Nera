import Link from "next/link";
import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/auth/cached";
import { DbMeterClient } from "./DbMeterClient";

export default async function DbMeterPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login?next=/db-meter");

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6 md:max-w-2xl">
      <header className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-rose-600 hover:underline">
          ← Beranda
        </Link>
        <h1 className="text-base font-bold text-gray-900">dB Meter</h1>
        <span className="w-12" />
      </header>

      <p className="mb-3 text-xs text-gray-500">
        Cek tingkat suara sekitar bayi. Pakai untuk kalibrasi volume
        white noise / lingkungan tidur.
      </p>

      <DbMeterClient />

      <section className="mt-5 space-y-2 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 text-[12px] leading-snug text-indigo-900/80">
        <h2 className="text-sm font-semibold text-indigo-700">
          Pedoman white noise
        </h2>
        <ul className="space-y-1 pl-4">
          <li>
            <span className="font-semibold">AAP</span>: ≤50 dB di telinga
            bayi untuk tidur aman.
          </li>
          <li>
            Hugh et al., Pediatrics 2014: 14 dari 14 baby sound machines
            diukur ≥85 dB di volume penuh — potential noise-induced
            hearing loss.
          </li>
          <li>
            <span className="font-semibold">Tips</span>: jarak WN
            machine ≥2 m dari crib, volume ≤50% maks, durasi ≤ tidur
            sesi (auto-off).
          </li>
        </ul>
      </section>
    </main>
  );
}
