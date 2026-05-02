"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";

export async function toggleMilestoneAction(formData: FormData) {
  const milestoneKey = String(formData.get("milestone_key") ?? "");
  const currentlyAchieved = String(formData.get("achieved") ?? "") === "1";
  const returnTo = String(formData.get("return_to") ?? "/milestone");

  if (!milestoneKey) redirect(returnTo);

  const [user, baby] = await Promise.all([getCachedUser(), getCurrentBaby()]);
  if (!user) redirect("/login");
  if (!baby) redirect("/setup");

  const supabase = createClient();

  if (currentlyAchieved) {
    await supabase
      .from("milestone_progress")
      .delete()
      .eq("baby_id", baby.id)
      .eq("milestone_key", milestoneKey);
  } else {
    await supabase.from("milestone_progress").insert({
      baby_id: baby.id,
      milestone_key: milestoneKey,
      created_by: user.id,
    });
  }

  revalidatePath("/milestone");
  redirect(returnTo);
}
