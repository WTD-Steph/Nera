import { createClient } from "@/lib/supabase/server";

export type CurrentHousehold = {
  household_id: string;
  role: "owner" | "member";
  household_name: string;
};

/**
 * Server-side: ambil household pertama user. Untuk PR #2b/#3 v1 single-baby
 * UI, user umumnya di 1 household. Kalau di-multi-household future, page
 * butuh household switcher.
 *
 * Returns null kalau user belum punya household membership.
 */
export async function getCurrentHousehold(): Promise<CurrentHousehold | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

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
}
