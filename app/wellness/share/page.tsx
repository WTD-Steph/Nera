import { redirect } from "next/navigation";
import Link from "next/link";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";
import { createClient } from "@/lib/supabase/server";
import { updateSharePrefAction } from "@/app/actions/wellness";

export default async function WellnessSharePage({
  searchParams,
}: {
  searchParams: { err?: string; saved?: string };
}) {
  const user = await getCachedUser();
  if (!user) redirect("/login?next=/wellness/share");
  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const supabase = createClient();
  const { data: partner } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", baby.household_id)
    .neq("user_id", user.id)
    .limit(1)
    .single();

  const { data: existingShare } = partner
    ? await supabase
        .from("wellness_shares")
        .select("share_level")
        .eq("owner_user_id", user.id)
        .eq("shared_with_user_id", partner.user_id)
        .single()
    : { data: null };

  const { data: prefs } = await supabase
    .from("wellness_alert_preferences")
    .select("alert_partner_on_high_score, alert_partner_on_q10_positive")
    .eq("user_id", user.id)
    .single();

  const currentLevel = existingShare?.share_level ?? "none";

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6 md:max-w-lg">
      <header className="mb-4 flex items-center justify-between">
        <Link href="/wellness" className="text-sm text-rose-600 hover:underline">
          ← Wellness
        </Link>
        <h1 className="text-base font-bold text-gray-900">Privasi & Berbagi</h1>
        <span className="w-12" />
      </header>

      {searchParams.saved ? (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          ✓ Pengaturan tersimpan.
        </div>
      ) : null}

      <p className="text-sm text-gray-700">
        Data wellness Anda PRIBADI by default. Atur tingkat berbagi dengan
        pasangan di bawah.
      </p>

      <form action={updateSharePrefAction} className="mt-5 space-y-4">
        <div>
          <div className="text-sm font-semibold text-gray-800">
            Tingkat berbagi
          </div>
          <p className="text-[11px] text-gray-500">
            Pasangan akan akses lewat RPC yang menghormati level ini. Audit
            access log dicatat.
          </p>
          <div className="mt-2 space-y-2">
            {(
              [
                {
                  v: "none",
                  label: "🔒 Tidak berbagi",
                  desc: "Pasangan tidak melihat apapun (default)",
                },
                {
                  v: "daily_mood_only",
                  label: "🌿 Mood harian saja",
                  desc: "Pasangan lihat tanggal + emoji mood, tidak melihat EPDS",
                },
                {
                  v: "scores_only",
                  label: "📊 Skor band saja",
                  desc: "Pasangan lihat tanggal + entry type + 'low/mid/high' band, tidak lihat skor angka",
                },
                {
                  v: "full",
                  label: "🤝 Akses penuh",
                  desc: "Pasangan lihat semua kecuali crisis acknowledgment timestamp",
                },
              ] as const
            ).map((opt) => (
              <label
                key={opt.v}
                className="flex cursor-pointer items-start gap-2 rounded-xl border border-gray-200 bg-white p-3 hover:border-emerald-300"
              >
                <input
                  type="radio"
                  name="share_level"
                  value={opt.v}
                  defaultChecked={currentLevel === opt.v}
                  className="mt-1 accent-emerald-600"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {opt.label}
                  </div>
                  <div className="text-[11px] text-gray-500">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-semibold text-gray-800">
            Alert otomatis ke pasangan
          </div>
          <p className="text-[11px] text-gray-500">
            Independen dari share level. Pasangan dapat notifikasi realtime
            (fact only, bukan skor).
          </p>
          <div className="mt-2 space-y-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-gray-200 bg-white p-3">
              <input
                type="checkbox"
                name="alert_q10_positive"
                value="1"
                defaultChecked={prefs?.alert_partner_on_q10_positive ?? false}
                className="mt-1 accent-rose-600"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">
                  Beritahu pasangan saat Q10 positif
                </div>
                <div className="text-[11px] text-gray-500">
                  Item 10 EPDS = pikiran menyakiti diri. Pasangan dapat
                  alert &ldquo;pasangan Anda butuh dukungan&rdquo; — TIDAK
                  melihat skor atau jawaban.
                </div>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-gray-200 bg-white p-3">
              <input
                type="checkbox"
                name="alert_high_score"
                value="1"
                defaultChecked={prefs?.alert_partner_on_high_score ?? false}
                className="mt-1 accent-amber-600"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">
                  Beritahu pasangan saat skor tinggi
                </div>
                <div className="text-[11px] text-gray-500">
                  Skor EPDS ≥13 (ibu) / ≥12 (ayah). Pasangan dapat alert
                  &ldquo;skor tinggi&rdquo; — TIDAK melihat angka.
                </div>
              </div>
            </label>
          </div>
        </div>

        {searchParams.err ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {searchParams.err}
          </div>
        ) : null}

        {!partner ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Belum ada anggota household lain — undang pasangan via{" "}
            <Link href="/more/household" className="underline">
              /more/household
            </Link>{" "}
            dulu.
          </div>
        ) : (
          <button
            type="submit"
            className="w-full rounded-2xl bg-emerald-600 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            Simpan pengaturan
          </button>
        )}
      </form>

      <p className="mt-6 text-[10px] leading-snug text-gray-400">
        Audit access log mencatat setiap kali pasangan akses data Anda
        (transparansi). Bisa diubah kapan saja.
      </p>
    </main>
  );
}
