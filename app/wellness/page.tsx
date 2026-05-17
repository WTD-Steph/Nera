import { redirect } from "next/navigation";
import Link from "next/link";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";
import { createClient } from "@/lib/supabase/server";
import { DailyMoodForm } from "./DailyMoodForm";

type Entry = {
  id: string;
  entry_type: string;
  entry_date: string;
  responses: Record<string, unknown>;
  total_score: number | null;
  subject_role: string;
};

export default async function WellnessHomePage() {
  const user = await getCachedUser();
  if (!user) redirect("/login?next=/wellness");
  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const supabase = createClient();
  const { data: member } = await supabase
    .from("household_members")
    .select("perinatal_role")
    .eq("household_id", baby.household_id)
    .eq("user_id", user.id)
    .single();
  const role = member?.perinatal_role;
  if (role !== "mother" && role !== "father") {
    redirect("/wellness/intro");
  }

  const since14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const { data: entries14 } = await supabase
    .from("wellness_entries")
    .select("id, entry_type, entry_date, responses, total_score, subject_role")
    .eq("user_id", user.id)
    .gte("entry_date", since14)
    .order("entry_date", { ascending: false });
  const entries = (entries14 ?? []) as Entry[];

  // Today's daily_mood entry (jika sudah dilakukan)
  const todayJakarta = new Date(Date.now() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const todayMoodEntry = entries.find(
    (e) => e.entry_type === "daily_mood" && e.entry_date === todayJakarta,
  );

  const lastEpds = entries.find((e) => e.entry_type === "epds");

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6 md:max-w-2xl">
      <header className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-rose-600 hover:underline">
          ← Beranda
        </Link>
        <h1 className="text-base font-bold text-gray-900">Wellness</h1>
        <Link
          href="/wellness/share"
          className="text-xs text-gray-500 hover:underline"
        >
          Privasi
        </Link>
      </header>

      <section className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
          Kapan-kapan kalau sempat
        </div>
        <p className="mt-1 text-sm text-gray-700">
          Ceritakan hari Anda. Hanya untuk Anda — tidak dibagikan kecuali
          Anda izinkan.
        </p>
        {todayMoodEntry ? (
          <div className="mt-3 rounded-xl bg-white p-3 text-xs text-gray-600">
            ✓ Sudah check-in hari ini · mood{" "}
            {String(todayMoodEntry.responses["mood"] ?? "?")}/5.
            Bisa edit dalam 24 jam.
          </div>
        ) : (
          <DailyMoodForm />
        )}
      </section>

      <section className="mt-5">
        <h2 className="px-1 text-sm font-semibold text-gray-700">
          Riwayat 14 hari
        </h2>
        <div className="mt-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
          {entries.length === 0 ? (
            <div className="py-4 text-center text-xs text-gray-400">
              Belum ada entry. Mulai dengan check-in di atas.
            </div>
          ) : (
            <ul className="divide-y divide-gray-50 text-[12px]">
              {entries.slice(0, 14).map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2">
                  <span className="text-gray-700">
                    {e.entry_date} ·{" "}
                    {e.entry_type === "daily_mood"
                      ? `🌿 mood ${e.responses["mood"] ?? "?"}/5`
                      : e.entry_type === "epds"
                        ? `📋 EPDS ${e.total_score ?? "?"}`
                        : e.entry_type}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {e.subject_role}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
        <h2 className="text-sm font-semibold text-amber-900">
          📋 EPDS — Skrining Mingguan
        </h2>
        <p className="mt-1 text-xs text-amber-800/80">
          10 pertanyaan, 5-10 menit. Validated Indonesian translation
          (Hutauruk 2012).
        </p>
        {lastEpds ? (
          <p className="mt-2 text-[11px] text-gray-600">
            Terakhir: {lastEpds.entry_date} · skor{" "}
            {lastEpds.total_score ?? "—"}
          </p>
        ) : null}
        <Link
          href="/wellness/epds"
          className="mt-3 inline-block rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
        >
          Mulai EPDS
        </Link>
      </section>

      <p className="mt-6 text-[10px] leading-snug text-gray-400">
        Wellness data Anda PRIBADI. Tidak dibagikan ke pasangan kecuali
        Anda set share level di{" "}
        <Link href="/wellness/share" className="underline">
          /wellness/share
        </Link>
        .
      </p>
    </main>
  );
}
