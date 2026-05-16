"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ackWellnessAlertAction } from "@/app/actions/wellness";

// Cross-device wellness alert banner — rendered globally di home page
// (mirror CryRealtimeBanner pattern). Surfaces partner alerts when
// opt-in pref enabled.
//
// Privacy: banner shows alert_kind only (q10_positive / high_score) —
// NOT the score itself, NOT the responses. Partner sees fact of concern,
// recipient decides response.

type AlertRow = {
  id: string;
  source_user_id: string;
  source_entry_id: string | null;
  alert_kind: "q10_positive" | "high_score";
  created_at: string;
  acknowledged_at: string | null;
};

export function WellnessAlertBanner({ userId }: { userId: string }) {
  void useRouter;
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Initial fetch + realtime subscribe
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("wellness_alerts")
        .select("id, source_user_id, source_entry_id, alert_kind, created_at, acknowledged_at")
        .eq("target_user_id", userId)
        .is("acknowledged_at", null)
        .order("created_at", { ascending: false })
        .limit(5);
      if (!cancelled && data) setAlerts(data as AlertRow[]);
    })();

    const channel = supabase
      .channel(`wellness_alerts:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "wellness_alerts",
          filter: `target_user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as AlertRow;
          setAlerts((prev) => [row, ...prev]);
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const visible = alerts.filter((a) => !dismissedIds.has(a.id));
  if (visible.length === 0) return null;
  const top = visible[0]!;

  const label =
    top.alert_kind === "q10_positive"
      ? "Pasangan Anda mengisi screening dan butuh dukungan."
      : "Pasangan Anda mendapat skor tinggi di screening wellness.";

  const handleLocalDismiss = () => {
    setDismissedIds((s) => new Set([...s, top.id]));
  };

  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-indigo-700 px-4 py-3 text-white shadow-lg">
      <div className="mx-auto flex max-w-md items-start gap-3 md:max-w-2xl">
        <span className="text-2xl" aria-hidden>
          🤝
        </span>
        <div className="flex-1">
          <div className="text-sm font-bold">Wellness Alert</div>
          <div className="mt-0.5 text-[12px] leading-snug text-indigo-50">
            {label}
          </div>
          <div className="mt-2 flex gap-2">
            <Link
              href="/wellness"
              onClick={handleLocalDismiss}
              className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-indigo-700"
            >
              Buka wellness
            </Link>
            <form action={ackWellnessAlertAction}>
              <input type="hidden" name="id" value={top.id} />
              <input type="hidden" name="return_to" value="/" />
              <button
                type="submit"
                className="rounded-full border border-white/40 px-3 py-1 text-[11px] font-semibold text-white hover:bg-white/10"
              >
                Sudah baca
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
