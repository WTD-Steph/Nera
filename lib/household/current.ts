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

  const { data, error } = await supabase
    .from("household_members")
    .select("household_id, role, households(name)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  // Supabase typed-relation: households join return typed object
  const householdName = (data.households as { name: string } | null)?.name ?? "";

  return {
    household_id: data.household_id,
    role: data.role as "owner" | "member",
    household_name: householdName,
  };
}
