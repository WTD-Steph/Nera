"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Realtime subscription untuk milestone_progress atau immunization_progress.
 * On INSERT/UPDATE/DELETE → router.refresh().
 */
export function ProgressRealtime({
  babyId,
  table,
}: {
  babyId: string;
  table: "milestone_progress" | "immunization_progress";
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
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

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [babyId, router, table]);

  return null;
}
