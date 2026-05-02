"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";

function num(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function isoOrNull(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (raw === "") return null;
  // datetime-local has no TZ; Vercel is UTC. Treat the input as Jakarta.
  const withTz = /[+-]\d{2}:\d{2}$|Z$/i.test(raw) ? raw : `${raw}:00+07:00`;
  const d = new Date(withTz);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function createGrowthAction(formData: FormData) {
  const returnTo = String(formData.get("return_to") ?? "/growth");

  const measuredAt =
    isoOrNull(formData, "measured_at") ?? new Date().toISOString();
  const weight = num(formData, "weight_kg");
  const height = num(formData, "height_cm");
  const headCirc = num(formData, "head_circ_cm");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (weight === null || weight <= 0 || weight > 30) {
    redirect(
      `${returnTo}?growtherror=${encodeURIComponent("Berat 0–30 kg.")}`,
    );
  }
  if (height === null || height <= 0 || height > 130) {
    redirect(
      `${returnTo}?growtherror=${encodeURIComponent("Panjang 0–130 cm.")}`,
    );
  }
  if (headCirc !== null && (headCirc <= 0 || headCirc > 60)) {
    redirect(
      `${returnTo}?growtherror=${encodeURIComponent("Lingkar kepala 0–60 cm.")}`,
    );
  }

  const [user, baby] = await Promise.all([getCachedUser(), getCurrentBaby()]);
  if (!user) redirect("/login");
  if (!baby) redirect("/setup");

  const supabase = createClient();

  const { error } = await supabase.from("growth_measurements").insert({
    baby_id: baby.id,
    measured_at: measuredAt,
    weight_kg: weight,
    height_cm: height,
    head_circ_cm: headCirc,
    notes,
    created_by: user.id,
  });

  if (error) {
    redirect(
      `${returnTo}?growtherror=${encodeURIComponent(`Gagal simpan: ${error.message}`)}`,
    );
  }

  revalidatePath("/growth");
  revalidatePath("/");
  redirect(`${returnTo}?growthsaved=1`);
}

export async function deleteGrowthAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/growth");
  if (!id) redirect(returnTo);

  const supabase = createClient();
  const { error } = await supabase
    .from("growth_measurements")
    .delete()
    .eq("id", id);

  if (error) {
    redirect(
      `${returnTo}?growtherror=${encodeURIComponent("Gagal hapus pengukuran.")}`,
    );
  }

  revalidatePath("/growth");
  redirect(`${returnTo}?growthdeleted=1`);
}
