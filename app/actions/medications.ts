"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentHousehold } from "@/lib/household/current";

export type MedUnit = "ml" | "drop" | "gr" | "tab" | "sachet";

export type Medication = {
  id: string;
  name: string;
  default_dose: string | null;
  unit: MedUnit;
};

export type AddMedicationResult =
  | { ok: true; medication: Medication }
  | { ok: false; error: string };

const VALID_UNITS: MedUnit[] = ["ml", "drop", "gr", "tab", "sachet"];

export async function addMedicationAction(
  name: string,
  defaultDose: string | null,
  unit: string,
): Promise<AddMedicationResult> {
  const trimmedName = name.trim();
  if (!trimmedName) return { ok: false, error: "Nama obat harus diisi." };
  if (trimmedName.length > 100)
    return { ok: false, error: "Nama maks 100 karakter." };
  if (!VALID_UNITS.includes(unit as MedUnit))
    return { ok: false, error: "Satuan tidak valid." };

  const trimmedDose = (defaultDose ?? "").trim();
  const dose = trimmedDose === "" ? null : trimmedDose;

  const [user, household] = await Promise.all([
    getCachedUser(),
    getCurrentHousehold(),
  ]);
  if (!user) return { ok: false, error: "Belum login." };
  if (!household) return { ok: false, error: "Belum punya keluarga." };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("medications")
    .insert({
      household_id: household.household_id,
      name: trimmedName,
      default_dose: dose,
      unit,
      created_by: user.id,
    })
    .select("id, name, default_dose, unit")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Nama sudah ada di daftar." };
    }
    return { ok: false, error: `Gagal: ${error.message}` };
  }

  revalidatePath("/");
  return {
    ok: true,
    medication: {
      id: data.id,
      name: data.name,
      default_dose: data.default_dose,
      unit: data.unit as MedUnit,
    },
  };
}
