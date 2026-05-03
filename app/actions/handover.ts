"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentHousehold } from "@/lib/household/current";

export async function startHandoverAction(formData: FormData) {
  const returnTo = String(formData.get("return_to") ?? "/");
  const formSleeperId = String(formData.get("sleeper_id") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const [user, household] = await Promise.all([
    getCachedUser(),
    getCurrentHousehold(),
  ]);
  if (!user) redirect("/login");
  if (!household) redirect("/setup");

  const supabase = createClient();

  // Resolve sleeper: either the form-specified household member (acting
  // on behalf of partner) or default to current user. Server-side lookup
  // ensures email is canonical (not trustable from form).
  let sleeperId = user.id;
  let sleeperEmail = user.email ?? "unknown";
  if (formSleeperId && formSleeperId !== user.id) {
    const { data: members } = await supabase.rpc("list_household_members", {
      h_id: household.household_id,
    });
    const sleeper = (
      members as { user_id: string; email: string }[] | null
    )?.find((m) => m.user_id === formSleeperId);
    if (!sleeper) redirect(returnTo);
    sleeperId = sleeper.user_id;
    sleeperEmail = sleeper.email;
  }

  // Skip if there's already an active handover — partial unique index
  // would reject anyway, this avoids the noisy error.
  const { data: active } = await supabase
    .from("handovers")
    .select("id")
    .eq("household_id", household.household_id)
    .is("ended_at", null)
    .limit(1)
    .maybeSingle();
  if (active) {
    redirect(returnTo);
  }

  await supabase.from("handovers").insert({
    household_id: household.household_id,
    started_by: sleeperId,
    started_by_email: sleeperEmail,
    notes,
  });

  revalidatePath("/");
  redirect(`${returnTo}?handover=started`);
}

export async function endHandoverAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");
  if (!id) redirect(returnTo);

  const [user, household] = await Promise.all([
    getCachedUser(),
    getCurrentHousehold(),
  ]);
  if (!user) redirect("/login");
  if (!household) redirect("/setup");

  const supabase = createClient();
  await supabase
    .from("handovers")
    .update({
      ended_at: new Date().toISOString(),
      ended_by: user.id,
      ended_by_email: user.email ?? "unknown",
    })
    .eq("id", id)
    .eq("household_id", household.household_id)
    .is("ended_at", null);

  revalidatePath("/");
  redirect(`${returnTo}?handover=ended`);
}
