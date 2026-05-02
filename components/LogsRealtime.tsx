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
 * 3. Online/online + interval poll fallback — when the realtime channel
 *    silently fails (cell network flap, websocket blocked), a 30-second
 *    poll while the page is visible keeps data within ~30s of accurate.
 *
 * RLS-aware: realtime + Supabase queries both respect row policies.
 */
export function LogsRealtime({ babyId }: { babyId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`logs:${babyId}`)
      .on(
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
      )
      .subscribe();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };
    const onOnline = () => router.refresh();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    // Polling fallback: every 30s while tab visible. Cheap (server
    // returns from cache or revalidates fast) and bounds staleness.
    const pollId = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, 30_000);

    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      clearInterval(pollId);
    };
  }, [babyId, router]);

  return null;
}
