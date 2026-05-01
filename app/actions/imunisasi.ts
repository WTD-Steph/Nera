"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBaby } from "@/lib/household/baby";

export async function markImmunizationAction(formData: FormData) {
  const vaccineKey = String(formData.get("vaccine_key") ?? "");
  const givenAt = String(formData.get("given_at") ?? "").trim();
  const facility = String(formData.get("facility") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const returnTo = String(formData.get("return_to") ?? "/imunisasi");

  if (!vaccineKey) redirect(returnTo);
  if (!givenAt || isNaN(new Date(givenAt).getTime())) {
    redirect(
      `${returnTo}?imuerror=${encodeURIComponent("Tanggal pemberian harus diisi.")}`,
    );
  }

  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Upsert: kalau sudah ada (re-mark), update; kalau belum, insert.
  const { data: existing } = await supabase
    .from("immunization_progress")
    .select("baby_id")
    .eq("baby_id", baby.id)
    .eq("vaccine_key", vaccineKey)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("immunization_progress")
      .update({
        given_at: givenAt,
        facility,
        notes,
      })
      .eq("baby_id", baby.id)
      .eq("vaccine_key", vaccineKey);
    if (error) {
      redirect(
        `${returnTo}?imuerror=${encodeURIComponent(`Gagal update: ${error.message}`)}`,
      );
    }
  } else {
    const { error } = await supabase.from("immunization_progress").insert({
      baby_id: baby.id,
      vaccine_key: vaccineKey,
      given_at: givenAt,
      facility,
      notes,
      created_by: user.id,
    });
    if (error) {
      redirect(
        `${returnTo}?imuerror=${encodeURIComponent(`Gagal simpan: ${error.message}`)}`,
      );
    }
  }

  revalidatePath("/imunisasi");
  redirect(`${returnTo}?imusaved=1`);
}

export async function unmarkImmunizationAction(formData: FormData) {
  const vaccineKey = String(formData.get("vaccine_key") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/imunisasi");

  if (!vaccineKey) redirect(returnTo);

  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const supabase = createClient();
  const { error } = await supabase
    .from("immunization_progress")
    .delete()
    .eq("baby_id", baby.id)
    .eq("vaccine_key", vaccineKey);

  if (error) {
    redirect(
      `${returnTo}?imuerror=${encodeURIComponent("Gagal hapus.")}`,
    );
  }

  revalidatePath("/imunisasi");
  redirect(`${returnTo}?imudeleted=1`);
}
