"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { authenticateRealtime } from "@/lib/supabase/realtime";

/**
 * Sama dengan LogsRealtime tapi untuk growth_measurements.
 * Subscribe ke channel filtered baby_id, on event router.refresh().
 *
 * Realtime di-authenticate dulu sebelum subscribe — kalau tidak, RLS diam-
 * diam memblokir semua event (lihat lib/supabase/realtime.ts).
 */
export function GrowthRealtime({ babyId }: { babyId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      await authenticateRealtime(supabase);
      if (cancelled) return;
      channel = supabase
        .channel(`growth:${babyId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "growth_measurements",
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
  }, [babyId, router]);

  return null;
}
