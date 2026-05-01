import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";

export type CurrentHousehold = {
  household_id: string;
  role: "owner" | "member";
  household_name: string;
};

/**
 * Server-side: ambil household pertama user. Returns null kalau user belum
 * punya household membership. Wrapped dengan React cache() supaya
 * multi-call per request hanya hit DB sekali.
 */
export const getCurrentHousehold = cache(
  async (): Promise<CurrentHousehold | null> => {
    const user = await getCachedUser();
    if (!user) return null;

    const supabase = createClient();

    const { data: member, error: memberError } = await supabase
      .from("household_members")
      .select("household_id, role")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memberError || !member) return null;

    const { data: household, error: householdError } = await supabase
      .from("households")
      .select("name")
      .eq("id", member.household_id)
      .maybeSingle();

    if (householdError || !household) return null;

    return {
      household_id: member.household_id,
      role: member.role as "owner" | "member",
      household_name: household.name,
    };
  },
);
