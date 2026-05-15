import { redirect } from "next/navigation";
import Link from "next/link";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";
import { createClient } from "@/lib/supabase/server";
import { CryListener } from "@/components/CryListener";
import { deleteCryEventAction } from "@/app/actions/cry-events";
import { fmtTime, fmtSleepRange } from "@/lib/compute/format";

type CryEventRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  peak_confidence: number;
  avg_confidence: number | null;
  duration_seconds: number | null;
  device_id: string | null;
};

const HOUR_24_MS = 24 * 60 * 60 * 1000;

export default async function ListenPage({
  searchParams,
}: {
  searchParams: { cryerror?: string };
}) {
  const user = await getCachedUser();
  if (!user) redirect("/login?next=/listen");
  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const supabase = createClient();
  const since = new Date(Date.now() - HOUR_24_MS).toISOString();
  const { data: events } = await supabase
    .from("cry_events")
    .select(
      "id, started_at, ended_at, peak_confidence, avg_confidence, duration_seconds, device_id",
    )
    .eq("baby_id", baby.id)
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(50);

  const eventsArray = (events ?? []) as CryEventRow[];

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6 md:max-w-2xl">
      <header className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-rose-600 hover:underline">
          ← Beranda
        </Link>
        <h1 className="text-base font-bold text-gray-900">Cry Listener</h1>
        <span className="w-12" />
      </header>

      {searchParams.cryerror ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {searchParams.cryerror}
        </div>
      ) : null}

      <CryListener />

      <section className="mt-5">
        <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700">
          Riwayat 24 jam terakhir
        </h2>
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {eventsArray.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Belum ada event tangisan terdeteksi.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {eventsArray.map((e) => (
                <CryEventRow key={e.id} event={e} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 text-[12px] leading-snug text-indigo-900/80">
        <h2 className="text-sm font-semibold text-indigo-700">
          Cara pakai
        </h2>
        <ul className="mt-1 space-y-1 pl-4">
          <li>
            · Letakkan HP ~30cm-2m dari Nera (nursery / crib). Volume mic
            standard cukup.
          </li>
          <li>
            · Wake Lock aktif — layar tidak tidur. Bisa charge sambil
            running.
          </li>
          <li>
            · False-positive (anjing, TV, sibling)? Hapus event via tombol
            di list di atas.
          </li>
          <li>
            · Cross-device: event akan muncul juga di HP lain di
            household (mis. istri di living room).
          </li>
        </ul>
      </section>

      <p className="mt-6 text-[10px] leading-snug text-gray-400">
        Tier 1 detection: deteksi tangisan vs not tangisan (YAMNet,
        on-device). Categorization (lapar/lelah/sakit) defer ke Tier 2
        future PR.
      </p>
    </main>
  );
}

function CryEventRow({ event }: { event: CryEventRow }) {
  const isOngoing = event.ended_at === null;
  const rangeText = fmtSleepRange(event.started_at, event.ended_at);
  const durationText = event.duration_seconds
    ? formatDuration(event.duration_seconds)
    : isOngoing
      ? "berlangsung"
      : "—";

  return (
    <div className="flex items-center justify-between px-3 py-2">
      <div className="flex items-start gap-2 text-xs">
        <span className="text-base" aria-hidden>
          {isOngoing ? "🚨" : "😢"}
        </span>
        <div>
          <div className="font-medium text-gray-900">
            {rangeText}
            {isOngoing ? null : (
              <span className="text-gray-500">
                {" "}
                · {durationText}
              </span>
            )}
          </div>
          <div className="text-[10px] text-gray-500">
            peak {event.peak_confidence.toFixed(2)}
            {event.avg_confidence != null
              ? ` · avg ${event.avg_confidence.toFixed(2)}`
              : null}
            {event.device_id ? ` · device ${event.device_id.slice(0, 6)}` : null}
          </div>
        </div>
      </div>
      {!isOngoing ? (
        <form action={deleteCryEventAction}>
          <input type="hidden" name="id" value={event.id} />
          <input type="hidden" name="return_to" value="/listen" />
          <button
            type="submit"
            className="text-[11px] text-gray-400 hover:text-rose-600"
          >
            Hapus
          </button>
        </form>
      ) : null}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// Suppress unused warning for fmtTime import — kept for future use
void fmtTime;
