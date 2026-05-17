"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";
import { computeTotalScore, isQ10Positive } from "@/lib/wellness/epds-items";
import type { Role } from "@/lib/wellness/cutoffs";

// Jakarta day computation (TZ-locked per CLAUDE.md commitment)
function jakartaDayIso(): string {
  const now = new Date();
  const jakarta = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return jakarta.toISOString().slice(0, 10);
}

async function getHouseholdAndRole(): Promise<
  | { ok: true; userId: string; householdId: string; role: Role }
  | { ok: false; error: string }
> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Not authenticated" };
  const baby = await getCurrentBaby();
  if (!baby) return { ok: false, error: "No baby/household selected" };

  const supabase = createClient();
  const { data: memberRow } = await supabase
    .from("household_members")
    .select("perinatal_role")
    .eq("household_id", baby.household_id)
    .eq("user_id", user.id)
    .single();
  const role =
    memberRow?.perinatal_role === "mother" ||
    memberRow?.perinatal_role === "father"
      ? (memberRow.perinatal_role as Role)
      : null;
  if (!role) {
    return {
      ok: false,
      error: "Perinatal role belum di-set — buka /wellness/intro",
    };
  }
  return {
    ok: true,
    userId: user.id,
    householdId: baby.household_id,
    role,
  };
}

// ────────────────────────────────────────────────────────────────────
// Onboarding — set perinatal_role
// ────────────────────────────────────────────────────────────────────

export async function setPerinatalRoleAction(formData: FormData) {
  const user = await getCachedUser();
  if (!user) redirect("/login");
  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const role = String(formData.get("perinatal_role") ?? "").trim();
  if (!["mother", "father", "caregiver", "other"].includes(role)) {
    redirect(
      `/wellness/intro?err=${encodeURIComponent("Pilih peran perinatal Anda")}`,
    );
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("household_members")
    .update({ perinatal_role: role } as never)
    .eq("household_id", baby.household_id)
    .eq("user_id", user.id);
  if (error) {
    redirect(`/wellness/intro?err=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/wellness");
  redirect("/wellness");
}

// ────────────────────────────────────────────────────────────────────
// Daily mood check-in
// ────────────────────────────────────────────────────────────────────

export type DailyMoodArgs = {
  mood: number; // 1-5
  hoursSlept?: number;
  notes?: string;
};

export async function createDailyMoodAction(
  args: DailyMoodArgs,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getHouseholdAndRole();
  if (!ctx.ok) return ctx;
  if (args.mood < 1 || args.mood > 5) {
    return { ok: false, error: "Mood harus 1-5" };
  }
  const supabase = createClient();
  const { error } = await supabase.from("wellness_entries").insert({
    user_id: ctx.userId,
    household_id: ctx.householdId,
    subject_role: ctx.role,
    entry_type: "daily_mood",
    entry_date: jakartaDayIso(),
    responses: {
      mood: args.mood,
      hours_slept: args.hoursSlept ?? null,
      notes: args.notes ?? null,
    },
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/wellness");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────
// EPDS — Q10-on-selection commit + complete entry
// ────────────────────────────────────────────────────────────────────

/**
 * Commit Q10-positive entry IMMEDIATELY upon Q10 selection (before user
 * completes remaining items). Inserts partial row dengan
 * epds_q10_positive=true. Crisis screen renders next. Audit preserved
 * even kalau user cancels rest of questionnaire.
 *
 * Returns the entry_id supaya client bisa update later setelah crisis
 * acknowledged + remaining items completed (or accept partial).
 */
export async function commitEpdsQ10PositiveAction(
  q10Score: number,
): Promise<
  { ok: true; entryId: string } | { ok: false; error: string }
> {
  const ctx = await getHouseholdAndRole();
  if (!ctx.ok) return ctx;
  if (!isQ10Positive(q10Score)) {
    return { ok: false, error: "Q10 score = 0; not a crisis trigger" };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("wellness_entries")
    .insert({
      user_id: ctx.userId,
      household_id: ctx.householdId,
      subject_role: ctx.role,
      entry_type: "epds",
      entry_date: jakartaDayIso(),
      responses: { q10: q10Score },
      total_score: null,
      epds_q10_positive: true,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed" };
  revalidatePath("/wellness");
  return { ok: true, entryId: data.id };
}

/** Mark crisis screen acknowledged. Updates timestamp. */
export async function ackCrisisAction(
  entryId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Not authenticated" };
  const supabase = createClient();
  const { error } = await supabase
    .from("wellness_entries")
    .update({ crisis_acknowledged_at: new Date().toISOString() } as never)
    .eq("id", entryId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Complete EPDS entry — either creates new row (Q10=0 path) OR updates
 * existing Q10-positive partial row dengan full responses + total_score.
 */
export async function completeEpdsAction(args: {
  /** If set, update existing partial entry (Q10-positive flow). */
  entryId?: string;
  responses: Record<string, number>;
}): Promise<{ ok: true; entryId: string } | { ok: false; error: string }> {
  const ctx = await getHouseholdAndRole();
  if (!ctx.ok) return ctx;
  const totalScore = computeTotalScore(args.responses);
  if (totalScore == null) {
    return { ok: false, error: "Incomplete responses (1-10 required)" };
  }
  const q10 = args.responses["q10"] ?? 0;
  const q10Positive = isQ10Positive(q10);

  const supabase = createClient();
  if (args.entryId) {
    const { error } = await supabase
      .from("wellness_entries")
      .update({
        responses: args.responses,
        total_score: totalScore,
        epds_q10_positive: q10Positive,
      } as never)
      .eq("id", args.entryId)
      .eq("user_id", ctx.userId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/wellness");
    return { ok: true, entryId: args.entryId };
  }
  const { data, error } = await supabase
    .from("wellness_entries")
    .insert({
      user_id: ctx.userId,
      household_id: ctx.householdId,
      subject_role: ctx.role,
      entry_type: "epds",
      entry_date: jakartaDayIso(),
      responses: args.responses,
      total_score: totalScore,
      epds_q10_positive: q10Positive,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed" };
  revalidatePath("/wellness");
  return { ok: true, entryId: data.id };
}

// ────────────────────────────────────────────────────────────────────
// Share + alert preferences
// ────────────────────────────────────────────────────────────────────

export async function updateSharePrefAction(formData: FormData) {
  const user = await getCachedUser();
  if (!user) redirect("/login");
  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");
  const supabase = createClient();
  const { data: partner } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", baby.household_id)
    .neq("user_id", user.id)
    .limit(1)
    .single();
  if (!partner) {
    redirect(
      `/wellness/share?err=${encodeURIComponent("Tidak ada anggota lain di household")}`,
    );
  }
  const level = String(formData.get("share_level") ?? "none");
  if (!["none", "daily_mood_only", "scores_only", "full"].includes(level)) {
    redirect(`/wellness/share?err=${encodeURIComponent("Level tidak valid")}`);
  }
  await supabase
    .from("wellness_shares")
    .upsert(
      {
        owner_user_id: user.id,
        shared_with_user_id: partner.user_id,
        share_level: level,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "owner_user_id,shared_with_user_id" },
    );

  // Alert prefs (same form)
  const onHigh = formData.get("alert_high_score") === "1";
  const onQ10 = formData.get("alert_q10_positive") === "1";
  await supabase.from("wellness_alert_preferences").upsert(
    {
      user_id: user.id,
      alert_partner_on_high_score: onHigh,
      alert_partner_on_q10_positive: onQ10,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "user_id" },
  );

  revalidatePath("/wellness/share");
  redirect("/wellness/share?saved=1");
}

export async function ackWellnessAlertAction(formData: FormData) {
  const user = await getCachedUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "").trim();
  const returnTo = String(formData.get("return_to") ?? "/");
  if (!id) redirect(returnTo);
  const supabase = createClient();
  await supabase
    .from("wellness_alerts")
    .update({ acknowledged_at: new Date().toISOString() } as never)
    .eq("id", id)
    .eq("target_user_id", user.id);
  revalidatePath(returnTo);
  redirect(returnTo);
}
