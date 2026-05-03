"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";

/** Parse "YYYY-MM-DD" (Asia/Jakarta date) → ISO timestamp at noon Jakarta. */
function jakartaDateToIso(dateStr: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  // Anchor at noon Jakarta to avoid TZ-edge issues when displaying back as
  // a date.
  return `${dateStr}T12:00:00+07:00`;
}

export async function toggleMilestoneAction(formData: FormData) {
  const milestoneKey = String(formData.get("milestone_key") ?? "");
  const currentlyAchieved = String(formData.get("achieved") ?? "") === "1";
  const dateStr = String(formData.get("achieved_date") ?? "").trim();
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
    const achievedAt = dateStr ? jakartaDateToIso(dateStr) : null;
    const insert: {
      baby_id: string;
      milestone_key: string;
      created_by: string;
      achieved_at?: string;
    } = {
      baby_id: baby.id,
      milestone_key: milestoneKey,
      created_by: user.id,
    };
    if (achievedAt) insert.achieved_at = achievedAt;
    await supabase.from("milestone_progress").insert(insert);
  }

  revalidatePath("/milestone");
  redirect(returnTo);
}

export async function updateMilestoneDateAction(formData: FormData) {
  const milestoneKey = String(formData.get("milestone_key") ?? "");
  const dateStr = String(formData.get("achieved_date") ?? "").trim();
  const returnTo = String(formData.get("return_to") ?? "/milestone");

  if (!milestoneKey || !dateStr) redirect(returnTo);

  const achievedAt = jakartaDateToIso(dateStr);
  if (!achievedAt) redirect(returnTo);

  const [user, baby] = await Promise.all([getCachedUser(), getCurrentBaby()]);
  if (!user) redirect("/login");
  if (!baby) redirect("/setup");

  const supabase = createClient();
  await supabase
    .from("milestone_progress")
    .update({ achieved_at: achievedAt })
    .eq("baby_id", baby.id)
    .eq("milestone_key", milestoneKey);

  revalidatePath("/milestone");
  redirect(returnTo);
}

export async function addCustomMilestoneAction(formData: FormData) {
  const text = String(formData.get("text") ?? "").trim();
  const dateStr = String(formData.get("achieved_date") ?? "").trim();
  const returnTo = String(formData.get("return_to") ?? "/milestone");

  if (!text) redirect(returnTo);
  if (text.length > 200) redirect(returnTo);

  const [user, baby] = await Promise.all([getCachedUser(), getCurrentBaby()]);
  if (!user) redirect("/login");
  if (!baby) redirect("/setup");

  const supabase = createClient();
  const insert: {
    baby_id: string;
    text: string;
    created_by: string;
    achieved_at?: string;
  } = {
    baby_id: baby.id,
    text,
    created_by: user.id,
  };
  const achievedAt = dateStr ? jakartaDateToIso(dateStr) : null;
  if (achievedAt) insert.achieved_at = achievedAt;
  await supabase.from("custom_milestones").insert(insert);

  revalidatePath("/milestone");
  redirect(returnTo);
}

export async function updateCustomMilestoneAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  const dateStr = String(formData.get("achieved_date") ?? "").trim();
  const returnTo = String(formData.get("return_to") ?? "/milestone");

  if (!id) redirect(returnTo);

  const [user, baby] = await Promise.all([getCachedUser(), getCurrentBaby()]);
  if (!user) redirect("/login");
  if (!baby) redirect("/setup");

  const updates: { text?: string; achieved_at?: string } = {};
  if (text && text.length <= 200) updates.text = text;
  const achievedAt = dateStr ? jakartaDateToIso(dateStr) : null;
  if (achievedAt) updates.achieved_at = achievedAt;
  if (Object.keys(updates).length === 0) redirect(returnTo);

  const supabase = createClient();
  await supabase
    .from("custom_milestones")
    .update(updates)
    .eq("id", id)
    .eq("baby_id", baby.id);

  revalidatePath("/milestone");
  redirect(returnTo);
}

export async function deleteCustomMilestoneAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/milestone");

  if (!id) redirect(returnTo);

  const [user, baby] = await Promise.all([getCachedUser(), getCurrentBaby()]);
  if (!user) redirect("/login");
  if (!baby) redirect("/setup");

  const supabase = createClient();
  await supabase
    .from("custom_milestones")
    .delete()
    .eq("id", id)
    .eq("baby_id", baby.id);

  revalidatePath("/milestone");
  redirect(returnTo);
}
