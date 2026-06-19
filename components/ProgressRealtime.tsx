"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { authenticateRealtime } from "@/lib/supabase/realtime";

/**
 * Realtime subscription untuk milestone_progress atau immunization_progress.
 * On INSERT/UPDATE/DELETE → router.refresh().
 *
 * Realtime di-authenticate dulu sebelum subscribe — kalau tidak, RLS diam-
 * diam memblokir semua event (lihat lib/supabase/realtime.ts).
 */
export function ProgressRealtime({
  babyId,
  table,
}: {
  babyId: string;
  table: "milestone_progress" | "immunization_progress" | "custom_milestones";
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      await authenticateRealtime(supabase);
      if (cancelled) return;
      channel = supabase
        .channel(`${table}:${babyId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            filter: `baby_id=eq.${babyId}`,
          },
          () => {
            router.refresh();
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [babyId, router, table]);

  return null;
}
