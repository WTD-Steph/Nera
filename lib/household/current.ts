import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";

export type CurrentHousehold = {
  household_id: string;
  role: "owner" | "member";
  household_name: string;
  sleep_playlist_url: string | null;
};

export const ACTIVE_HOUSEHOLD_COOKIE = "active_household_id";

/**
 * Server-side: ambil household aktif user. Priority:
 *   1. Cookie `active_household_id` kalau user member household tersebut
 *   2. Household pertama (oldest joined_at) — fallback default
 *
 * Returns null kalau user belum punya household membership. Wrapped dengan
 * React cache() supaya multi-call per request hanya hit DB sekali.
 *
 * Cookie di-set via setActiveHouseholdAction (lihat /more/household/actions.ts).
 */
export const getCurrentHousehold = cache(
  async (): Promise<CurrentHousehold | null> => {
    const user = await getCachedUser();
    if (!user) return null;

    const supabase = createClient();
    const activeId = cookies().get(ACTIVE_HOUSEHOLD_COOKIE)?.value;

    let member: { household_id: string; role: string } | null = null;

    // Try cookie-selected household first
    if (activeId) {
      const { data } = await supabase
        .from("household_members")
        .select("household_id, role")
        .eq("user_id", user.id)
        .eq("household_id", activeId)
        .maybeSingle();
      if (data) member = data;
    }

    // Fallback: oldest joined household
    if (!member) {
      const { data } = await supabase
        .from("household_members")
        .select("household_id, role")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data) member = data;
    }

    if (!member) return null;

    const { data: household } = await supabase
      .from("households")
      .select("name, sleep_playlist_url")
      .eq("id", member.household_id)
      .maybeSingle();

    if (!household) return null;

    return {
      household_id: member.household_id,
      role: member.role as "owner" | "member",
      household_name: household.name,
      sleep_playlist_url: household.sleep_playlist_url ?? null,
    };
  },
);
