"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";

// Cry events server actions.
//
// All mutations gated by RLS (household member of baby's household).
// Anonymous device_id stored as opaque text — no PII, no link to user.
//
// Same-device update enforcement: app-side discipline — only the device
// yang holds the event id di memory yang akan emit `updateCryEndedAction`.
// DB-level RLS allows any household member to update; we don't enforce
// device match server-side karena Supabase tidak support custom JWT
// claim for device_id natively.

export type StartCryArgs = {
  startedAt: string;
  peakConfidence: number;
  deviceId: string;
};

export type StartCryResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Insert cry event saat state machine transitions cry-detected →
 * cry-ongoing. Returns row id supaya client bisa track untuk update
 * saat ended.
 */
export async function createCryStartedAction(
  args: StartCryArgs,
): Promise<StartCryResult> {
  const [user, baby] = await Promise.all([getCachedUser(), getCurrentBaby()]);
  if (!user) return { ok: false, error: "Not authenticated" };
  if (!baby) return { ok: false, error: "No baby selected" };
  if (
    args.peakConfidence < 0 ||
    args.peakConfidence > 1 ||
    isNaN(args.peakConfidence)
  ) {
    return { ok: false, error: "Invalid peak_confidence" };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("cry_events")
    .insert({
      baby_id: baby.id,
      household_id: baby.household_id,
      started_at: args.startedAt,
      peak_confidence: args.peakConfidence,
      device_id: args.deviceId || null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert failed" };
  }
  revalidatePath("/listen");
  return { ok: true, id: data.id };
}

export type EndCryArgs = {
  id: string;
  endedAt: string;
  durationSeconds: number;
  avgConfidence: number;
  peakConfidence?: number;
};

export type EndCryResult = { ok: true } | { ok: false; error: string };

/**
 * Update cry event saat cry-ended sustained → idle. Updates ended_at,
 * duration_seconds, avg_confidence (+ optionally upgrade peak kalau
 * higher than at-start value).
 */
export async function updateCryEndedAction(
  args: EndCryArgs,
): Promise<EndCryResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Not authenticated" };
  if (args.durationSeconds < 0) {
    return { ok: false, error: "Invalid duration" };
  }
  const supabase = createClient();
  const updates: Record<string, unknown> = {
    ended_at: args.endedAt,
    duration_seconds: Math.round(args.durationSeconds),
    avg_confidence: clamp01(args.avgConfidence),
  };
  if (args.peakConfidence !== undefined) {
    updates.peak_confidence = clamp01(args.peakConfidence);
  }
  const { error } = await supabase
    .from("cry_events")
    .update(updates as never)
    .eq("id", args.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/listen");
  return { ok: true };
}

/** Delete event — used for false-positive removal. */
export async function deleteCryEventAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const returnTo = String(formData.get("return_to") ?? "/listen");
  if (!id) redirect(returnTo);
  const user = await getCachedUser();
  if (!user) redirect("/login");
  const supabase = createClient();
  const { error } = await supabase.from("cry_events").delete().eq("id", id);
  if (error) {
    redirect(
      `${returnTo}?cryerror=${encodeURIComponent(`Gagal hapus: ${error.message}`)}`,
    );
  }
  revalidatePath("/listen");
  redirect(returnTo);
}

function clamp01(n: number): number {
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
