import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";
import { fmtDate, fmtTime } from "@/lib/compute/format";

export default async function StockPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login?next=/stock");

  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const supabase = createClient();
  const { data } = await supabase
    .from("logs")
    .select("id, timestamp, end_timestamp, amount_l_ml, amount_r_ml, consumed_ml, notes")
    .eq("baby_id", baby.id)
    .eq("subtype", "pumping")
    .not("end_timestamp", "is", null)
    .order("timestamp", { ascending: false });

  const batches = (data ?? []).map((b) => {
    const produced = (b.amount_l_ml ?? 0) + (b.amount_r_ml ?? 0);
    const consumed = b.consumed_ml ?? 0;
    return {
      id: b.id,
      timestamp: b.timestamp,
      produced,
      consumed,
      remaining: Math.max(0, produced - consumed),
      notes: b.notes,
    };
  });

  const totalRemaining = batches.reduce((s, b) => s + b.remaining, 0);
  const totalProduced = batches.reduce((s, b) => s + b.produced, 0);
  const totalConsumed = batches.reduce((s, b) => s + b.consumed, 0);
  const activeBatches = batches.filter((b) => b.remaining > 0);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6 md:max-w-2xl lg:max-w-3xl">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-rose-600 hover:underline">
          ← Beranda
        </Link>
        <h1 className="text-base font-bold text-gray-900">Stok ASI</h1>
        <span className="w-12" />
      </header>

      <section className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 shadow-sm">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs text-emerald-700/80">Tersisa</div>
            <div className="text-3xl font-bold text-emerald-700">
              {totalRemaining}{" "}
              <span className="text-sm font-medium text-emerald-700/70">ml</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-emerald-700/80">Batch aktif</div>
            <div className="text-base font-bold text-emerald-700">
              {activeBatches.length}
            </div>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-emerald-700/60">
          Total produksi: {totalProduced} ml · Sudah dipakai: {totalConsumed} ml
        </div>
      </section>

      <p className="mt-3 px-1 text-[11px] leading-relaxed text-gray-500">
        Setiap pumping = 1 batch. Saat ASI botol dilog, jumlah-nya di-deduct
        FIFO (oldest first) dari batch yang masih ada stok-nya. Batch merah
        = sudah habis.
      </p>

      <section className="mt-4">
        <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700">
          Riwayat Batch ({batches.length})
        </h2>
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {batches.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Belum ada pumping. Tap Mulai Pumping di beranda.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {batches.map((b) => {
                const pct =
                  b.produced > 0 ? (b.consumed / b.produced) * 100 : 0;
                const status =
                  b.remaining === 0
                    ? "habis"
                    : b.consumed > 0
                      ? "sebagian"
                      : "penuh";
                const statusColor =
                  b.remaining === 0
                    ? "text-gray-400"
                    : b.consumed > 0
                      ? "text-amber-600"
                      : "text-emerald-600";
                return (
                  <div key={b.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-800">
                          {b.remaining}{" "}
                          <span className="text-xs font-normal text-gray-500">
                            / {b.produced} ml
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {fmtDate(b.timestamp)} · {fmtTime(b.timestamp)}
                        </div>
                      </div>
                      <div className={`text-[11px] font-semibold ${statusColor}`}>
                        {status}
                      </div>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full ${
                          b.remaining === 0
                            ? "bg-gray-300"
                            : b.consumed > 0
                              ? "bg-amber-400"
                              : "bg-emerald-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {b.notes ? (
                      <div className="mt-1 text-[11px] italic text-gray-500">
                        {b.notes}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
