"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { authenticateRealtime } from "@/lib/supabase/realtime";

/**
 * Cross-device sync for logs. Layers of resilience:
 *
 * 1. Supabase realtime subscription — postgres_changes filtered by baby_id,
 *    fires INSERT/UPDATE/DELETE events. Primary mechanism.
 *
 *    IMPORTANT: the realtime socket MUST be authenticated BEFORE we
 *    subscribe, or RLS on `logs` silently blocks every event — the channel
 *    joins anonymously, times out, and delivers nothing. createBrowserClient
 *    loads the session from cookies asynchronously, so subscribing in the
 *    same tick (as the old code did) races ahead of auth. We await the
 *    session and call realtime.setAuth() first. (This was the bug that made
 *    realtime a no-op and left the 30s poll below doing all the real sync.)
 *
 * 2. Visibility refresh — on iOS PWA / mobile the WebSocket drops when the
 *    app backgrounds; on return (visibilitychange: visible) we
 *    router.refresh() to pull fresh data immediately.
 *
 * 3. Online + gated interval poll fallback — runs ONLY while the channel is
 *    unhealthy (CHANNEL_ERROR/TIMED_OUT/CLOSED) and the tab is visible, at a
 *    5-minute interval. While realtime is connected (the normal case) the
 *    poll never fires, so an idle/kiosk tab costs zero server invocations.
 *    On reconnect we refresh once to catch up (postgres_changes does not
 *    replay events missed during the outage).
 *
 * A fixed 30s poll calling router.refresh() used to run unconditionally on
 * every visible tab — including the Mode Jam kiosk left open 24/7 — each
 * tick re-rendering the whole dynamic dashboard RSC on the server (a Vercel
 * function invocation + a middleware auth round-trip). That dominated the
 * Vercel/Supabase bill; gating it on realtime health removes that cost.
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
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let channelHealthy = false;
    let everSubscribed = false;

    const onVisibility = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const onOnline = () => router.refresh();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    async function setup() {
      // Authenticate the realtime socket before subscribing (see header).
      await authenticateRealtime(supabase);
      if (cancelled) return;

      let ch = supabase.channel(`logs:${babyId}`).on(
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
        ch = ch.on(
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
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Reconnect after a drop: postgres_changes does NOT replay events
          // missed while offline, so pull once to catch up. Skip the very
          // first subscribe (the page already rendered fresh on the server).
          if (everSubscribed) router.refresh();
          everSubscribed = true;
          channelHealthy = true;
        } else {
          // CHANNEL_ERROR / TIMED_OUT / CLOSED → realtime down; the gated
          // fallback poll below takes over until it recovers.
          channelHealthy = false;
        }
      });
      channel = ch;

      // Fallback poll: only when realtime is down AND the tab is visible.
      pollId = setInterval(
        () => {
          if (!channelHealthy && document.visibilityState === "visible") {
            router.refresh();
          }
        },
        5 * 60_000,
      );
    }

    void setup();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
      if (pollId) clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [babyId, householdId, router]);

  return null;
}
