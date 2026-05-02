"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBaby } from "@/lib/household/baby";

export async function updateBabyAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const gender = String(formData.get("gender") ?? "");
  const dob = String(formData.get("dob") ?? "");
  const birthWeight = parseFloat(String(formData.get("birth_weight_kg") ?? ""));
  const birthHeight = parseFloat(String(formData.get("birth_height_cm") ?? ""));
  const dbfRateRaw = String(formData.get("dbf_ml_per_min") ?? "").trim();
  const dbfRate =
    dbfRateRaw === "" ? null : parseFloat(dbfRateRaw);

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
    dbfRate !== null &&
    (!Number.isFinite(dbfRate) || dbfRate < 0.5 || dbfRate > 30)
  ) {
    redirect(
      `/more/profile?error=${encodeURIComponent("DBF ml/menit harus 0.5–30 atau kosong.")}`,
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
  const { error } = await supabase
    .from("babies")
    .update({
      name,
      gender,
      dob,
      birth_weight_kg: birthWeight,
      birth_height_cm: birthHeight,
      dbf_ml_per_min: dbfRate,
    } as never)
    .eq("id", id);

  if (error) {
    redirect(`/more/profile?error=${encodeURIComponent("Gagal simpan.")}`);
  }

  revalidatePath("/more/profile");
  revalidatePath("/");
  redirect("/more/profile?saved=1");
}
