"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "@/lib/household/current";

export async function createBabyAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const gender = String(formData.get("gender") ?? "");
  const dob = String(formData.get("dob") ?? "");
  const birthWeight = parseFloat(String(formData.get("birth_weight_kg") ?? ""));
  const birthHeight = parseFloat(String(formData.get("birth_height_cm") ?? ""));

  if (!name) {
    redirect(`/setup/baby?error=${encodeURIComponent("Nama bayi harus diisi.")}`);
  }
  if (gender !== "female" && gender !== "male") {
    redirect(
      `/setup/baby?error=${encodeURIComponent("Pilih jenis kelamin.")}`,
    );
  }
  if (!dob || isNaN(new Date(dob).getTime())) {
    redirect(
      `/setup/baby?error=${encodeURIComponent("Tanggal lahir tidak valid.")}`,
    );
  }
  if (!Number.isFinite(birthWeight) || birthWeight <= 0 || birthWeight > 10) {
    redirect(
      `/setup/baby?error=${encodeURIComponent("Berat lahir 0–10 kg.")}`,
    );
  }
  if (!Number.isFinite(birthHeight) || birthHeight <= 0 || birthHeight > 80) {
    redirect(
      `/setup/baby?error=${encodeURIComponent("Panjang lahir 0–80 cm.")}`,
    );
  }

  const household = await getCurrentHousehold();
  if (!household) {
    redirect("/setup");
  }

  const supabase = createClient();
  const { error } = await supabase.from("babies").insert({
    household_id: household.household_id,
    name,
    gender,
    dob,
    birth_weight_kg: birthWeight,
    birth_height_cm: birthHeight,
  });

  if (error) {
    redirect(
      `/setup/baby?error=${encodeURIComponent("Gagal simpan profil bayi. Coba lagi.")}`,
    );
  }

  redirect("/?welcome=baby");
}
