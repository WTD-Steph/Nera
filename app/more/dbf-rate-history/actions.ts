"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBaby } from "@/lib/household/baby";
import { parseDecimal } from "@/lib/utils/parse";

const BASE = "/more/dbf-rate-history";

function errRedirect(msg: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(msg)}`);
}

export async function addDbfRatePeriodAction(formData: FormData) {
  const effectiveFromRaw = String(formData.get("effective_from") ?? "").trim();
  const mode = String(formData.get("mode") ?? "").trim();
  const fixedRaw = formData.get("ml_per_min") as string | null;
  const multRaw = formData.get("multiplier") as string | null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (mode !== "fixed" && mode !== "multiplier" && mode !== "auto") {
    errRedirect("Mode tidak valid (fixed/multiplier/auto).");
  }
  if (!effectiveFromRaw) errRedirect("Tanggal mulai harus diisi.");
  // datetime-local has no TZ; Vercel UTC. Treat as Jakarta per project TZ commitment.
  const effectiveFrom = /[+-]\d{2}:\d{2}$|Z$/i.test(effectiveFromRaw)
    ? effectiveFromRaw
    : `${effectiveFromRaw}:00+07:00`;
  const eff = new Date(effectiveFrom);
  if (isNaN(eff.getTime())) errRedirect("Tanggal mulai tidak valid.");

  const fixed =
    mode === "fixed" ? parseDecimal(fixedRaw) : null;
  const multiplier =
    mode === "multiplier" ? parseDecimal(multRaw) : null;
  if (
    mode === "fixed" &&
    (fixed === null || fixed <= 0 || fixed > 30)
  ) {
    errRedirect("Fixed rate harus 0.5–30 ml/menit.");
  }
  if (
    mode === "multiplier" &&
    (multiplier === null || multiplier <= 0 || multiplier > 5)
  ) {
    errRedirect("Multiplier harus 0.1–5.");
  }

  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("dbf_rate_periods").insert({
    baby_id: baby.id,
    effective_from: eff.toISOString(),
    mode,
    ml_per_min: fixed,
    multiplier,
    notes,
    created_by: user.id,
  });

  if (error) {
    errRedirect(`Gagal simpan: ${error.message}`);
  }

  revalidatePath(BASE);
  redirect(`${BASE}?saved=1`);
}

export async function deleteDbfRatePeriodAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect(BASE);

  const supabase = createClient();
  const { error } = await supabase
    .from("dbf_rate_periods")
    .delete()
    .eq("id", id);

  if (error) {
    errRedirect("Gagal hapus periode.");
  }

  revalidatePath(BASE);
  redirect(BASE);
}
