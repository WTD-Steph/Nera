"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getDeviceId } from "@/lib/cry-detection/device-id";
import { fmtMinAge, type CryContextHint } from "@/lib/compute/cry-context";
import { CryEventTagPicker } from "@/components/CryEventTagPicker";
import {
  REASON_EMOJIS,
  REASON_LABELS,
  type Reason,
} from "@/lib/cry-detection/reason-heuristics";

// Global cross-device banner — render di root layout supaya muncul
// di semua page saat HP lain di household detect cry.
//
// Subscribe ke cry_events INSERT events di realtime. Filter client-side:
// skip events dari device_id sendiri (self-detection). Show persistent
// banner sampai user dismiss (per UX decision: bayi nangis = priority
// interrupt, don't auto-dismiss).
//
// Context hint (last feed/diaper/sleep wake) di-fetch saat banner
// mount — supaya caregiver bisa quick-assess kemungkinan reason tanpa
// open Nera app penuh.

type IncomingEvent = {
  id: string;
  baby_id: string;
  started_at: string;
  peak_confidence: number;
  device_id: string | null;
  suggested_reason: string | null;
  suggested_confidence: string | null;
  tagged_reason: string | null;
};

export function CryRealtimeBanner({
  babyId,
  babyName,
  householdId,
}: {
  babyId: string;
  babyName: string;
  householdId: string;
}) {
  const router = useRouter();
  const [event, setEvent] = useState<IncomingEvent | null>(null);
  const [context, setContext] = useState<CryContextHint | null>(null);
  const [tick, setTick] = useState(0);
  // Track dismissed event ids supaya kalau realtime fires same row
  // multiple times (mis. UPDATE flows), banner tidak re-appear.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Subscribe ke INSERT events di cry_events filtered by baby_id.
  useEffect(() => {
    const supabase = createClient();
    const selfDeviceId =
      typeof window !== "undefined" ? getDeviceId() : null;
    void householdId; // reserved untuk household-level filter di future
    const channel = supabase
      .channel(`cry:${babyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "cry_events",
          filter: `baby_id=eq.${babyId}`,
        },
        (payload) => {
          const row = payload.new as IncomingEvent;
          // Skip kalau event dari device sendiri (avoid self-banner saat
          // listening di HP ini).
          if (row.device_id && row.device_id === selfDeviceId) return;
          // Skip kalau sudah dismissed sebelumnya (idempotent).
          if (dismissedIds.has(row.id)) return;
          setEvent(row);
          void fetchContext(babyId).then(setContext);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [babyId, householdId, dismissedIds]);

  // Live tick untuk update "X lalu" display.
  useEffect(() => {
    if (!event) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000); // 30s tick
    return () => clearInterval(id);
  }, [event]);
  void tick;

  if (!event) return null;

  const elapsedMin = Math.floor(
    (Date.now() - new Date(event.started_at).getTime()) / 60_000,
  );
  const elapsedText =
    elapsedMin < 1 ? "baru saja" : fmtMinAge(elapsedMin) + " lalu";

  const handleDismiss = () => {
    setDismissedIds((s) => new Set([...s, event.id]));
    setEvent(null);
    setContext(null);
  };

  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-red-600 px-4 py-3 text-white shadow-lg">
      <div className="mx-auto flex max-w-md items-start gap-3 md:max-w-2xl">
        <span className="text-2xl" aria-hidden>
          🚨
        </span>
        <div className="flex-1">
          <div className="text-sm font-bold">{babyName} menangis</div>
          <div className="mt-0.5 text-[11px] text-red-100">{elapsedText}</div>
          {context ? (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-red-50">
              <span title="Sejak feed terakhir">
                🍼 {fmtMinAge(context.lastFeedMin)}
              </span>
              <span title="Sejak diaper terakhir">
                🧷 {fmtMinAge(context.lastDiaperMin)}
              </span>
              {context.isCurrentlySleeping ? (
                <span>😴 sedang tidur</span>
              ) : (
                <span title="Sejak bangun">
                  ☀️ {fmtMinAge(context.lastWakeMin)} bangun
                </span>
              )}
            </div>
          ) : null}
          {event.suggested_reason && event.suggested_reason !== "unclear" ? (
            <div className="mt-1 text-[11px] text-red-50">
              💡 Kemungkinan:{" "}
              <span className="font-semibold">
                {REASON_EMOJIS[event.suggested_reason as Reason]}{" "}
                {REASON_LABELS[event.suggested_reason as Reason]}
              </span>
              {event.suggested_confidence
                ? ` (${event.suggested_confidence})`
                : null}
            </div>
          ) : event.suggested_reason === "unclear" ? (
            <div className="mt-1 text-[11px] text-red-100/80">
              💡 Suggestion: tidak pasti — cek manual
            </div>
          ) : null}
          {/* Realtime tag affordance — confirm/correct inline */}
          <CryEventTagPicker
            eventId={event.id}
            currentTag={event.tagged_reason}
            suggested={event.suggested_reason}
            compact
          />
          <div className="mt-2 flex gap-2">
            <Link
              href="/listen"
              onClick={handleDismiss}
              className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-red-700"
            >
              Buka /listen
            </Link>
            <button
              type="button"
              onClick={() => {
                handleDismiss();
                router.refresh();
              }}
              className="rounded-full border border-white/40 px-3 py-1 text-[11px] font-semibold text-white hover:bg-white/10"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Fetch context hint via lightweight query (latest feed + diaper + sleep).
async function fetchContext(babyId: string): Promise<CryContextHint> {
  const supabase = createClient();
  // 6h window cukup untuk catch most-recent of each subtype tanpa
  // load berlebihan. Caregiver yang ngga log apapun di 6h terakhir
  // = null in hint.
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("logs")
    .select("subtype, timestamp, end_timestamp")
    .eq("baby_id", babyId)
    .gte("timestamp", since)
    .order("timestamp", { ascending: false });

  const rows = data ?? [];
  let lastFeedMs: number | null = null;
  let lastDiaperMs: number | null = null;
  let lastSleepEndMs: number | null = null;
  let ongoingSleep = false;
  const now = Date.now();
  for (const r of rows) {
    const t = new Date(r.timestamp).getTime();
    if (r.subtype === "feeding" && lastFeedMs === null) lastFeedMs = t;
    else if (r.subtype === "diaper" && lastDiaperMs === null) lastDiaperMs = t;
    else if (r.subtype === "sleep") {
      if (r.end_timestamp == null) {
        ongoingSleep = true;
      } else if (lastSleepEndMs === null) {
        lastSleepEndMs = new Date(r.end_timestamp).getTime();
      }
    }
  }
  return {
    lastFeedMin: lastFeedMs ? Math.round((now - lastFeedMs) / 60_000) : null,
    lastDiaperMin: lastDiaperMs
      ? Math.round((now - lastDiaperMs) / 60_000)
      : null,
    lastWakeMin: lastSleepEndMs
      ? Math.round((now - lastSleepEndMs) / 60_000)
      : null,
    isCurrentlySleeping: ongoingSleep,
  };
}
