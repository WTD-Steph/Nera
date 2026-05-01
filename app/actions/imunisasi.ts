"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBaby } from "@/lib/household/baby";

export async function toggleImmunizationAction(formData: FormData) {
  const vaccineKey = String(formData.get("vaccine_key") ?? "");
  const currentlyGiven = String(formData.get("given") ?? "") === "1";
  const returnTo = String(formData.get("return_to") ?? "/imunisasi");

  if (!vaccineKey) redirect(returnTo);

  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (currentlyGiven) {
    await supabase
      .from("immunization_progress")
      .delete()
      .eq("baby_id", baby.id)
      .eq("vaccine_key", vaccineKey);
  } else {
    await supabase.from("immunization_progress").insert({
      baby_id: baby.id,
      vaccine_key: vaccineKey,
      given_at: new Date().toISOString().slice(0, 10),
      created_by: user.id,
    });
  }

  revalidatePath("/imunisasi");
  redirect(returnTo);
}
