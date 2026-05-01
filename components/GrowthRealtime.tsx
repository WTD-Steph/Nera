"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Sama dengan LogsRealtime tapi untuk growth_measurements.
 * Subscribe ke channel filtered baby_id, on event router.refresh().
 */
export function GrowthRealtime({ babyId }: { babyId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
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

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [babyId, router]);

  return null;
}
