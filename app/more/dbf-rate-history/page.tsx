import { redirect } from "next/navigation";
import Link from "next/link";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/SubmitButton";
import {
  addDbfRatePeriodAction,
  deleteDbfRatePeriodAction,
} from "./actions";

type SearchParams = { error?: string; saved?: string };

function nowDatetimeLocalJakarta(): string {
  // Render datetime-local default value di Jakarta time.
  const now = new Date();
  const offsetMs = 7 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offsetMs);
  return local.toISOString().slice(0, 16);
}

function fmtJakarta(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function rateLabel(p: {
  mode: string;
  ml_per_min: number | null;
  multiplier: number | null;
}): string {
  if (p.mode === "fixed") return `${p.ml_per_min} ml/menit (fixed)`;
  if (p.mode === "multiplier")
    return `${p.multiplier}× pumping (multiplier)`;
  return "Auto (pumping rate / default 4 ml/menit)";
}

export default async function DbfRateHistoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCachedUser();
  if (!user) redirect("/login?next=/more/dbf-rate-history");
  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const supabase = createClient();
  const { data: periods } = await supabase
    .from("dbf_rate_periods")
    .select("id, effective_from, mode, ml_per_min, multiplier, notes, created_at")
    .eq("baby_id", baby.id)
    .order("effective_from", { ascending: false });

  const list = periods ?? [];
  const active = list[0] ?? null;
  const error = searchParams.error;
  const saved = searchParams.saved;

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6 md:max-w-2xl">
      <header className="mb-4 flex items-center justify-between">
        <Link href="/more" className="text-sm text-rose-600 hover:underline">
          ← Kembali
        </Link>
        <h1 className="text-base font-bold text-gray-900">DBF Rate History</h1>
        <span className="w-12" />
      </header>

      <section className="rounded-2xl border border-rose-100 bg-rose-50/40 p-4">
        <p className="text-[12px] leading-relaxed text-rose-900/80">
          <strong>Forward-only.</strong> Tiap kali rate diubah, periode baru
          dicatat dengan tanggal mulai. <strong>DBF rows yang sudah dibuat
          tetap pakai rate lama</strong> (snapshot saat row di-create).
          Hanya sesi DBF baru yang akan pakai rate baru.
        </p>
      </section>

      {active ? (
        <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            Aktif sekarang
          </div>
          <div className="mt-1 text-base font-bold text-gray-900">
            {rateLabel(active)}
          </div>
          <div className="mt-1 text-[11px] text-gray-600">
            Berlaku sejak {fmtJakarta(active.effective_from)}
          </div>
          {active.notes ? (
            <div className="mt-2 rounded-lg bg-white/60 px-2 py-1.5 text-[11px] italic text-gray-700">
              {active.notes}
            </div>
          ) : null}
        </section>
      ) : null}

      {saved ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          ✓ Periode tersimpan.
        </div>
      ) : null}
      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <section className="mt-5">
        <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700">
          Riwayat periode ({list.length})
        </h2>
        {list.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-400 shadow-sm">
            Belum ada riwayat.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {list.map((p, i) => {
              const isActive = i === 0;
              return (
                <div
                  key={p.id}
                  className={`flex items-start justify-between gap-3 border-b border-gray-50 px-4 py-3 last:border-b-0 ${
                    isActive ? "bg-emerald-50/40" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900">
                      {rateLabel(p)}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Mulai {fmtJakarta(p.effective_from)}
                    </div>
                    {p.notes ? (
                      <div className="mt-1 text-[11px] italic text-gray-500">
                        {p.notes}
                      </div>
                    ) : null}
                  </div>
                  {!isActive ? (
                    <form action={deleteDbfRatePeriodAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <SubmitButton
                        pendingText="…"
                        className="text-[11px] font-medium text-red-600 hover:underline"
                      >
                        Hapus
                      </SubmitButton>
                    </form>
                  ) : (
                    <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      Aktif
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700">
          Tambah periode baru
        </h2>
        <form
          action={addDbfRatePeriodAction}
          className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
        >
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">
              Tanggal & jam mulai (WIB)
            </span>
            <input
              type="datetime-local"
              name="effective_from"
              required
              defaultValue={nowDatetimeLocalJakarta()}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
            />
            <p className="mt-1 text-[10px] text-gray-500">
              Sesi DBF baru pada/setelah tanggal ini akan pakai rate baru.
              Sesi sebelumnya tidak terpengaruh.
            </p>
          </label>

          <fieldset>
            <legend className="text-xs font-semibold text-gray-600">Mode</legend>
            <div className="mt-1 space-y-2">
              <label className="flex items-start gap-2 rounded-xl border border-gray-200 p-3 hover:bg-rose-50 has-[:checked]:border-rose-400 has-[:checked]:bg-rose-50">
                <input
                  type="radio"
                  name="mode"
                  value="fixed"
                  defaultChecked
                  className="mt-1"
                />
                <div className="text-sm">
                  <div className="font-medium text-gray-800">Fixed rate</div>
                  <div className="text-[11px] text-gray-500">
                    Rate konstan ml/menit. Literatur newborn 3–5 ml/min.
                  </div>
                  <input
                    type="number"
                    name="ml_per_min"
                    step="0.1"
                    min="0.5"
                    max="30"
                    inputMode="decimal"
                    placeholder="4.0"
                    className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-rose-400"
                  />
                </div>
              </label>
              <label className="flex items-start gap-2 rounded-xl border border-gray-200 p-3 hover:bg-rose-50 has-[:checked]:border-rose-400 has-[:checked]:bg-rose-50">
                <input type="radio" name="mode" value="multiplier" className="mt-1" />
                <div className="text-sm">
                  <div className="font-medium text-gray-800">
                    Multiplier × pumping rate
                  </div>
                  <div className="text-[11px] text-gray-500">
                    Rate adaptif: multiplier × rate pumping terakhir.
                  </div>
                  <input
                    type="number"
                    name="multiplier"
                    step="0.1"
                    min="0.1"
                    max="5"
                    inputMode="decimal"
                    placeholder="1.0"
                    className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-rose-400"
                  />
                </div>
              </label>
              <label className="flex items-start gap-2 rounded-xl border border-gray-200 p-3 hover:bg-rose-50 has-[:checked]:border-rose-400 has-[:checked]:bg-rose-50">
                <input type="radio" name="mode" value="auto" className="mt-1" />
                <div className="text-sm">
                  <div className="font-medium text-gray-800">Auto</div>
                  <div className="text-[11px] text-gray-500">
                    Pumping rate kalau ada, else default 4 ml/menit.
                  </div>
                </div>
              </label>
            </div>
          </fieldset>

          <label className="block">
            <span className="text-xs font-semibold text-gray-600">
              Catatan (opsional)
            </span>
            <input
              type="text"
              name="notes"
              maxLength={200}
              placeholder="Misal: post growth spurt, baby lebih efisien"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
            />
          </label>

          <SubmitButton
            pendingText="Menyimpan…"
            className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-rose-600"
          >
            Simpan periode
          </SubmitButton>
        </form>
      </section>

      <p className="mt-6 px-1 text-[10px] leading-snug text-gray-400">
        Periode aktif tidak bisa dihapus — ubah dengan menambah periode baru.
        Profile DBF di /more/profile menyentuh setting yang sama; perubahan di
        sana auto-track sebagai periode baru.
      </p>
    </main>
  );
}
