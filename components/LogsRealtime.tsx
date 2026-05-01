"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Mounts an invisible Supabase realtime subscription for logs of the current
 * baby. On any INSERT/UPDATE/DELETE event matching baby_id, triggers
 * router.refresh() — Next.js soft navigation re-runs server components,
 * dashboard + history re-fetch logs automatically.
 *
 * Tradeoff: full re-render on every event (simple, leverages existing server
 * data fetch). Volume rendah (handful logs/jam), latency ~200ms post-event,
 * acceptable. Optimistic insert (client-side dedup) di-defer ke PR follow-up.
 *
 * RLS-aware: Supabase realtime respects table policies, jadi user hanya
 * dapat events untuk row yang dia bisa SELECT.
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

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [babyId, router]);

  return null;
}
