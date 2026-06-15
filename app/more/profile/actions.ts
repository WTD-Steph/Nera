"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBaby } from "@/lib/household/baby";
import { parseDecimal } from "@/lib/utils/parse";

export async function updateBabyAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const gender = String(formData.get("gender") ?? "");
  const dob = String(formData.get("dob") ?? "");
  const birthWeight = parseDecimal(formData.get("birth_weight_kg") as string | null) ?? NaN;
  const birthHeight = parseDecimal(formData.get("birth_height_cm") as string | null) ?? NaN;
  // DBF estimate mode picker: 'auto' | 'multiplier' | 'fixed'. Only the
  // value matching the chosen mode is persisted; others are nulled so
  // priority chain in dbfEstimateMl resolves cleanly.
  const dbfMode = String(formData.get("dbf_estimate_mode") ?? "auto");
  const dbfFixed =
    dbfMode === "fixed"
      ? parseDecimal(formData.get("dbf_ml_per_min") as string | null)
      : null;
  const dbfMult =
    dbfMode === "multiplier"
      ? parseDecimal(formData.get("dbf_pumping_multiplier") as string | null)
      : null;

  // Wake window override (optional). Both kosong = NULL (pakai age-bucket).
  const wakeMinRaw = String(formData.get("wake_window_min_min") ?? "").trim();
  const wakeMaxRaw = String(formData.get("wake_window_max_min") ?? "").trim();
  let wakeMin: number | null = null;
  let wakeMax: number | null = null;
  if (wakeMinRaw !== "" || wakeMaxRaw !== "") {
    const minN = Number(wakeMinRaw);
    const maxN = Number(wakeMaxRaw);
    if (
      !Number.isFinite(minN) ||
      !Number.isFinite(maxN) ||
      minN <= 0 ||
      maxN <= 0 ||
      minN > maxN ||
      maxN > 600
    ) {
      redirect(
        `/more/profile?error=${encodeURIComponent("Wake window: min ≤ max, range 1-600 menit, atau kosongkan keduanya.")}`,
      );
    }
    wakeMin = Math.round(minN);
    wakeMax = Math.round(maxN);
  }

  if (!id) redirect("/more/profile");
  if (!name) {
    redirect(`/more/profile?error=${encodeURIComponent("Nama harus diisi.")}`);
  }
  if (gender !== "female" && gender !== "male") {
    redirect(
      `/more/profile?error=${encodeURIComponent("Pilih jenis kelamin.")}`,
    );
  }
  if (!dob || isNaN(new Date(dob).getTime())) {
    redirect(
      `/more/profile?error=${encodeURIComponent("Tanggal lahir tidak valid.")}`,
    );
  }
  if (!Number.isFinite(birthWeight) || birthWeight <= 0 || birthWeight > 10) {
    redirect(`/more/profile?error=${encodeURIComponent("Berat lahir 0–10 kg.")}`);
  }
  if (!Number.isFinite(birthHeight) || birthHeight <= 0 || birthHeight > 80) {
    redirect(
      `/more/profile?error=${encodeURIComponent("Panjang lahir 0–80 cm.")}`,
    );
  }
  if (
    dbfFixed !== null &&
    (!Number.isFinite(dbfFixed) || dbfFixed < 0.5 || dbfFixed > 30)
  ) {
    redirect(
      `/more/profile?error=${encodeURIComponent("DBF ml/menit harus 0.5–30 atau kosong.")}`,
    );
  }
  if (
    dbfMult !== null &&
    (!Number.isFinite(dbfMult) || dbfMult < 0.1 || dbfMult > 5)
  ) {
    redirect(
      `/more/profile?error=${encodeURIComponent("Multiplier harus 0.1–5 atau kosong.")}`,
    );
  }

  // Verify ownership via current baby (RLS + scope check)
  const current = await getCurrentBaby();
  if (!current || current.id !== id) {
    redirect(
      `/more/profile?error=${encodeURIComponent("Bayi tidak ditemukan atau bukan milik household Anda.")}`,
    );
  }

  const supabase = createClient();

  // Detect DBF settings change vs previous state — kalau berubah, insert
  // period row for audit trail di /more/dbf-rate-history.
  const { data: prev } = await supabase
    .from("babies")
    .select("dbf_ml_per_min, dbf_pumping_multiplier")
    .eq("id", id)
    .maybeSingle();
  const prevFixed = prev?.dbf_ml_per_min != null ? Number(prev.dbf_ml_per_min) : null;
  const prevMult = prev?.dbf_pumping_multiplier != null ? Number(prev.dbf_pumping_multiplier) : null;
  const dbfChanged = prevFixed !== dbfFixed || prevMult !== dbfMult;

  const { error } = await supabase
    .from("babies")
    .update({
      name,
      gender,
      dob,
      birth_weight_kg: birthWeight,
      birth_height_cm: birthHeight,
      dbf_ml_per_min: dbfFixed,
      dbf_pumping_multiplier: dbfMult,
      wake_window_min_min: wakeMin,
      wake_window_max_min: wakeMax,
    } as never)
    .eq("id", id);

  if (error) {
    redirect(`/more/profile?error=${encodeURIComponent("Gagal simpan.")}`);
  }

  // Auto-create period kalau DBF settings berubah. Forward-only: past
  // DBF rows tetap pakai snapshot dbf_rate_override yang ada — period
  // purely informational + audit trail.
  if (dbfChanged) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("dbf_rate_periods").insert({
        baby_id: id,
        effective_from: new Date().toISOString(),
        mode: dbfMode === "fixed" || dbfMode === "multiplier" ? dbfMode : "auto",
        ml_per_min: dbfFixed,
        multiplier: dbfMult,
        notes: null,
        created_by: user.id,
      });
    }
  }

  revalidatePath("/more/profile");
  revalidatePath("/more/dbf-rate-history");
  revalidatePath("/");
  redirect("/more/profile?saved=1");
}
