"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createHouseholdAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(`/setup?error=${encodeURIComponent("Nama keluarga harus diisi.")}`);
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("create_household_with_owner", {
    household_name: name,
  });

  if (error) {
    redirect(
      `/setup?error=${encodeURIComponent("Gagal membuat household. Coba lagi.")}`,
    );
  }

  redirect("/?welcome=created");
}
