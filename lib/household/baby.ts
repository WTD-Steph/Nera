import { cache } from "react";
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
  /** Per-baby override for DBF ml/min estimate. NULL = derive auto. */
  dbf_ml_per_min: number | null;
};

/**
 * Server-side: ambil baby pertama di household user. v1 single-baby UI;
 * future multi-baby (PR #?) butuh baby switcher. Wrapped dengan React
 * cache() — multi-call per request dedup.
 */
export const getCurrentBaby = cache(async (): Promise<CurrentBaby | null> => {
  const household = await getCurrentHousehold();
  if (!household) return null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("babies")
    .select(
      "id, name, gender, dob, birth_weight_kg, birth_height_cm, household_id, dbf_ml_per_min",
    )
    .eq("household_id", household.household_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    ...data,
    gender: data.gender as "female" | "male",
  };
});
