"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Cross-device sync for logs. Three layers of resilience:
 *
 * 1. Supabase realtime subscription — postgres_changes filtered by
 *    baby_id, fires INSERT/UPDATE/DELETE events. Primary mechanism.
 *
 * 2. Visibility refresh — on iOS PWA / mobile, WebSocket drops when the
 *    app goes to background. When user returns (visibilitychange:
 *    visible), force router.refresh() to pull fresh data immediately.
 *    Also catches "browser tab refocus" use case across desktop.
 *
 * 3. Online + gated interval poll fallback — when the realtime channel
 *    silently fails (cell network flap, websocket blocked), a 5-minute
 *    poll runs ONLY while the channel is unhealthy and the page is
 *    visible. While realtime is connected (the normal case) the poll never
 *    fires, so an idle/kiosk tab costs zero server invocations. On
 *    reconnect we refresh once to catch up on events missed during the
 *    outage (postgres_changes does not replay).
 *
 * RLS-aware: realtime + Supabase queries both respect row policies.
 */
export function LogsRealtime({
  babyId,
  householdId,
}: {
  babyId: string;
  householdId?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let channel = supabase.channel(`logs:${babyId}`).on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "logs",
        filter: `baby_id=eq.${babyId}`,
      },
      () => {
        router.refresh();
      },
    );
    if (householdId) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "handovers",
          filter: `household_id=eq.${householdId}`,
        },
        () => {
          router.refresh();
        },
      );
    }
    // Track realtime health so the fallback poll only runs when the
    // websocket is actually down — NOT on a fixed timer. A fixed 30s poll
    // calling router.refresh() re-renders the whole dynamic dashboard RSC
    // on the server (a Vercel function invocation + a middleware auth
    // round-trip) every 30s on every open tab — including the Mode Jam
    // kiosk left running 24/7 — which dominated the Vercel/Supabase bill.
    let channelHealthy = false;
    let everSubscribed = false;
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // Reconnect after a drop: postgres_changes does NOT replay events
        // missed while offline, so pull once to catch up. Skip the very
        // first subscribe (the page already rendered fresh on the server).
        if (everSubscribed) router.refresh();
        everSubscribed = true;
        channelHealthy = true;
      } else {
        // CHANNEL_ERROR / TIMED_OUT / CLOSED → realtime is down; let the
        // fallback poll below take over until it recovers.
        channelHealthy = false;
      }
    });

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };
    const onOnline = () => router.refresh();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    // Fallback poll: only when realtime is down AND the tab is visible.
    // While the channel is healthy (the normal case) this never fires, so
    // an idle open tab costs nothing. 5-minute interval bounds staleness
    // during an outage without hammering the server.
    const pollId = setInterval(() => {
      if (!channelHealthy && document.visibilityState === "visible") {
        router.refresh();
      }
    }, 5 * 60_000);

    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      clearInterval(pollId);
    };
  }, [babyId, householdId, router]);

  return null;
}
