import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";
import { SubmitButton } from "@/components/SubmitButton";
import { deleteLogAction } from "@/app/actions/logs";
import { type LogRow } from "@/lib/compute/stats";
import { fmtDate, fmtSleepRange, fmtTime, timeSince } from "@/lib/compute/format";
import { LogsRealtime } from "@/components/LogsRealtime";

type Filter =
  | "all"
  | "feeding"
  | "pumping"
  | "diaper"
  | "sleep"
  | "temp"
  | "med"
  | "bath";
type SearchParams = { filter?: string; logdeleted?: string };

const FILTERS: { id: Filter; label: string; subtypes: string[] }[] = [
  { id: "all", label: "Semua", subtypes: [] },
  { id: "feeding", label: "Feeding", subtypes: ["feeding"] },
  { id: "pumping", label: "Pumping", subtypes: ["pumping"] },
  { id: "diaper", label: "Diaper", subtypes: ["diaper"] },
  { id: "sleep", label: "Tidur", subtypes: ["sleep"] },
  { id: "bath", label: "Mandi", subtypes: ["bath"] },
  { id: "temp", label: "Suhu", subtypes: ["temp"] },
  { id: "med", label: "Obat", subtypes: ["med"] },
];

const SUBTYPE_LABEL: Record<string, string> = {
  feeding: "Feeding",
  pumping: "Pumping",
  diaper: "Diaper",
  sleep: "Tidur",
  bath: "Mandi",
  temp: "Suhu",
  med: "Obat / Suplemen",
};

function logDetail(l: LogRow): string {
  if (l.subtype === "feeding") {
    if (l.amount_ml != null) {
      const src =
        l.bottle_content === "asi"
          ? "ASI"
          : l.bottle_content === "sufor"
            ? "Sufor"
            : null;
      return src ? `🍼 ${src} ${l.amount_ml} ml` : `🍼 ${l.amount_ml} ml`;
    }
    const lMin = l.duration_l_min ?? 0;
    const rMin = l.duration_r_min ?? 0;
    return `🤱 L ${lMin}m / R ${rMin}m`;
  }
  if (l.subtype === "pumping")
    return `L ${l.amount_l_ml ?? 0} / R ${l.amount_r_ml ?? 0} ml`;
  if (l.subtype === "diaper") {
    const parts: string[] = [];
    if (l.has_pee) parts.push("💛");
    if (l.has_poop) {
      const p = [l.poop_color, l.poop_consistency].filter(Boolean).join(" ");
      parts.push(p ? `💩 ${p}` : "💩");
    }
    return parts.join(" + ");
  }
  if (l.subtype === "sleep") {
    return fmtSleepRange(l.timestamp, l.end_timestamp);
  }
  if (l.subtype === "temp") return `${l.temp_celsius}°C`;
  if (l.subtype === "med")
    return [l.med_name, l.med_dose].filter(Boolean).join(" ");
  return "";
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCachedUser();
  if (!user) redirect("/login?next=/history");

  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const supabase = createClient();

  const activeFilter = (FILTERS.find((f) => f.id === searchParams.filter) ??
    FILTERS[0]!) as (typeof FILTERS)[number];

  let query = supabase
    .from("logs")
    .select(
      "id, subtype, timestamp, end_timestamp, amount_ml, amount_l_ml, amount_r_ml, duration_l_min, duration_r_min, has_pee, has_poop, poop_color, poop_consistency, temp_celsius, med_name, med_dose, bottle_content, notes",
    )
    .eq("baby_id", baby.id)
    .order("timestamp", { ascending: false })
    .limit(500);

  if (activeFilter.subtypes.length > 0) {
    query = query.in("subtype", activeFilter.subtypes);
  }

  const { data: logs } = await query;
  const logsArray: LogRow[] = (logs ?? []) as LogRow[];

  const byDate = new Map<string, LogRow[]>();
  for (const l of logsArray) {
    const key = new Date(l.timestamp).toDateString();
    const arr = byDate.get(key) ?? [];
    arr.push(l);
    byDate.set(key, arr);
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6 md:max-w-2xl lg:max-w-3xl">
      <LogsRealtime babyId={baby.id} />
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-rose-600 hover:underline">
          ← Beranda
        </Link>
        <h1 className="text-base font-bold text-gray-900">Riwayat</h1>
        <span className="w-12" />
      </header>

      {searchParams.logdeleted ? (
        <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
          Log dihapus.
        </div>
      ) : null}

      <div
        className="mt-4 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
        style={{ scrollbarWidth: "none" }}
      >
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={f.id === "all" ? "/history" : `/history?filter=${f.id}`}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeFilter.id === f.id
                ? "bg-rose-500 text-white shadow-sm"
                : "border border-gray-200 bg-white text-gray-600"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {byDate.size === 0 ? (
        <div className="mt-5 rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400 shadow-sm">
          Belum ada catatan untuk filter ini.
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {[...byDate.entries()].map(([dateKey, dayLogs]) => (
            <div key={dateKey}>
              <div className="mb-1 px-2 text-xs font-semibold text-gray-500">
                {fmtDate(new Date(dateKey).toISOString())}
              </div>
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <div className="divide-y divide-gray-50">
                  {dayLogs.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-gray-800">
                            {SUBTYPE_LABEL[l.subtype] ?? l.subtype}
                          </span>
                          {logDetail(l) ? (
                            <span className="truncate text-xs text-gray-500">
                              • {logDetail(l)}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {fmtTime(l.timestamp)} · {timeSince(l.timestamp)}
                        </div>
                        {l.notes ? (
                          <div className="mt-0.5 text-[11px] italic text-gray-500">
                            {l.notes}
                          </div>
                        ) : null}
                      </div>
                      <form action={deleteLogAction}>
                        <input type="hidden" name="id" value={l.id} />
                        <input
                          type="hidden"
                          name="return_to"
                          value={
                            activeFilter.id === "all"
                              ? "/history"
                              : `/history?filter=${activeFilter.id}`
                          }
                        />
                        <SubmitButton
                          pendingText="…"
                          className="text-[11px] text-gray-400 hover:text-red-600"
                        >
                          Hapus
                        </SubmitButton>
                      </form>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
