"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";

export async function markImmunizationAction(formData: FormData) {
  const vaccineKey = String(formData.get("vaccine_key") ?? "");
  const givenAt = String(formData.get("given_at") ?? "").trim();
  const facility = String(formData.get("facility") ?? "").trim() || null;
  const doctorName = String(formData.get("doctor_name") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const returnTo = String(formData.get("return_to") ?? "/imunisasi");

  if (!vaccineKey) redirect(returnTo);
  if (!givenAt || isNaN(new Date(givenAt).getTime())) {
    redirect(
      `${returnTo}?imuerror=${encodeURIComponent("Tanggal pemberian harus diisi.")}`,
    );
  }

  const [user, baby] = await Promise.all([getCachedUser(), getCurrentBaby()]);
  if (!user) redirect("/login");
  if (!baby) redirect("/setup");

  const supabase = createClient();
  const { error } = await supabase.from("immunization_progress").upsert(
    {
      baby_id: baby.id,
      vaccine_key: vaccineKey,
      given_at: givenAt,
      facility,
      doctor_name: doctorName,
      notes,
      created_by: user.id,
    },
    { onConflict: "baby_id,vaccine_key" },
  );

  if (error) {
    redirect(
      `${returnTo}?imuerror=${encodeURIComponent(`Gagal simpan: ${error.message}`)}`,
    );
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
