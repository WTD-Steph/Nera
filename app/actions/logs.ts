"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";

const SUBTYPES = [
  "feeding",
  "pumping",
  "diaper",
  "sleep",
  "bath",
  "temp",
  "med",
] as const;
type Subtype = (typeof SUBTYPES)[number];

function isValidSubtype(s: string): s is Subtype {
  return (SUBTYPES as readonly string[]).includes(s);
}

function num(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function str(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  return raw === "" ? null : raw;
}

function bool(formData: FormData, key: string): boolean {
  return String(formData.get(key) ?? "") === "1";
}

function isoOrNull(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (raw === "") return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function createLogAction(formData: FormData) {
  const subtype = String(formData.get("subtype") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");

  if (!isValidSubtype(subtype)) {
    redirect(`${returnTo}?logerror=${encodeURIComponent("Subtype tidak valid.")}`);
  }

  const [user, baby] = await Promise.all([getCachedUser(), getCurrentBaby()]);
  if (!user) redirect("/login");
  if (!baby) redirect("/setup");

  const supabase = createClient();

  const timestamp =
    isoOrNull(formData, "timestamp") ?? new Date().toISOString();

  const payload: Record<string, unknown> = {
    baby_id: baby.id,
    subtype,
    timestamp,
    created_by: user.id,
    notes: str(formData, "notes"),
  };

  if (subtype === "feeding") {
    const mode = String(formData.get("feeding_mode") ?? "sufor");
    if (mode === "sufor") {
      const amount = num(formData, "amount_ml");
      if (amount === null || amount <= 0) {
        redirect(
          `${returnTo}?logerror=${encodeURIComponent("Jumlah susu harus diisi.")}`,
        );
      }
      payload.amount_ml = amount;
    } else {
      const l = num(formData, "duration_l_min");
      const r = num(formData, "duration_r_min");
      if ((l === null || l <= 0) && (r === null || r <= 0)) {
        redirect(
          `${returnTo}?logerror=${encodeURIComponent("Isi durasi DBF kiri atau kanan.")}`,
        );
      }
      payload.duration_l_min = l;
      payload.duration_r_min = r;
    }
  } else if (subtype === "pumping") {
    const l = num(formData, "amount_l_ml");
    const r = num(formData, "amount_r_ml");
    if ((l === null || l <= 0) && (r === null || r <= 0)) {
      redirect(
        `${returnTo}?logerror=${encodeURIComponent("Isi jumlah pumping kiri atau kanan.")}`,
      );
    }
    payload.amount_l_ml = l;
    payload.amount_r_ml = r;
  } else if (subtype === "diaper") {
    const hasPee = bool(formData, "has_pee");
    const hasPoop = bool(formData, "has_poop");
    if (!hasPee && !hasPoop) {
      redirect(
        `${returnTo}?logerror=${encodeURIComponent("Pilih minimal pipis atau BAB.")}`,
      );
    }
    payload.has_pee = hasPee;
    payload.has_poop = hasPoop;
    if (hasPoop) {
      payload.poop_color = str(formData, "poop_color");
      payload.poop_consistency = str(formData, "poop_consistency");
    }
  } else if (subtype === "sleep") {
    payload.end_timestamp = isoOrNull(formData, "end_timestamp");
  } else if (subtype === "temp") {
    const t = num(formData, "temp_celsius");
    if (t === null || t < 30 || t > 45) {
      redirect(
        `${returnTo}?logerror=${encodeURIComponent("Suhu harus 30–45°C.")}`,
      );
    }
    payload.temp_celsius = t;
  } else if (subtype === "med") {
    const name = str(formData, "med_name");
    if (!name) {
      redirect(
        `${returnTo}?logerror=${encodeURIComponent("Nama obat harus diisi.")}`,
      );
    }
    payload.med_name = name;
    payload.med_dose = str(formData, "med_dose");
  }
  // bath: no extra fields

  const { error } = await supabase.from("logs").insert(payload as never);

  if (error) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent(`Gagal simpan log: ${error.message}`)}`,
    );
  }

  revalidatePath("/");
  revalidatePath("/history");
  redirect(`${returnTo}?logsaved=${subtype}`);
}

export async function startOngoingLogAction(formData: FormData) {
  const subtype = String(formData.get("subtype") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");

  if (subtype !== "sleep" && subtype !== "pumping") {
    redirect(`${returnTo}?logerror=${encodeURIComponent("Subtype tidak mendukung ongoing.")}`);
  }

  const [user, baby] = await Promise.all([getCachedUser(), getCurrentBaby()]);
  if (!user) redirect("/login");
  if (!baby) redirect("/setup");

  const supabase = createClient();
  const { error } = await supabase.from("logs").insert({
    baby_id: baby.id,
    subtype,
    timestamp: new Date().toISOString(),
    end_timestamp: null,
    created_by: user.id,
  });

  if (error) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent(`Gagal mulai: ${error.message}`)}`,
    );
  }

  revalidatePath("/");
  revalidatePath("/history");
  redirect(`${returnTo}?ongoingstarted=${subtype}`);
}

export async function endOngoingSleepAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");
  if (!id) redirect(returnTo);

  const supabase = createClient();
  const { error } = await supabase
    .from("logs")
    .update({ end_timestamp: new Date().toISOString() })
    .eq("id", id)
    .eq("subtype", "sleep")
    .is("end_timestamp", null);

  if (error) {
    redirect(`${returnTo}?logerror=${encodeURIComponent(`Gagal stop: ${error.message}`)}`);
  }

  revalidatePath("/");
  revalidatePath("/history");
  redirect(`${returnTo}?logsaved=sleep`);
}

export async function endOngoingPumpingAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");
  const l = num(formData, "amount_l_ml");
  const r = num(formData, "amount_r_ml");

  if (!id) redirect(returnTo);
  if ((l === null || l <= 0) && (r === null || r <= 0)) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent("Isi jumlah pumping kiri atau kanan.")}`,
    );
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("logs")
    .update({
      end_timestamp: new Date().toISOString(),
      amount_l_ml: l,
      amount_r_ml: r,
    })
    .eq("id", id)
    .eq("subtype", "pumping")
    .is("end_timestamp", null);

  if (error) {
    redirect(`${returnTo}?logerror=${encodeURIComponent(`Gagal stop: ${error.message}`)}`);
  }

  revalidatePath("/");
  revalidatePath("/history");
  redirect(`${returnTo}?logsaved=pumping`);
}

export async function deleteLogAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");
  if (!id) redirect(returnTo);

  const supabase = createClient();
  const { error } = await supabase.from("logs").delete().eq("id", id);

  if (error) {
    redirect(
      `${returnTo}?logerror=${encodeURIComponent("Gagal hapus log.")}`,
    );
  }

  revalidatePath("/");
  revalidatePath("/history");
  redirect(`${returnTo}?logdeleted=1`);
}
