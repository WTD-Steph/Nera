import { createClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "./current";

export type CurrentBaby = {
  id: string;
  name: string;
  gender: "female" | "male";
  dob: string;
  birth_weight_kg: number;
  birth_height_cm: number;
  household_id: string;
};

/**
 * Server-side: ambil baby pertama di household user. v1 single-baby UI;
 * future multi-baby (PR #?) butuh baby switcher.
 *
 * Returns null kalau user tidak punya household, atau household-nya belum
 * punya baby.
 */
export async function getCurrentBaby(): Promise<CurrentBaby | null> {
  const household = await getCurrentHousehold();
  if (!household) return null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("babies")
    .select("id, name, gender, dob, birth_weight_kg, birth_height_cm, household_id")
    .eq("household_id", household.household_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    ...data,
    gender: data.gender as "female" | "male",
  };
}
