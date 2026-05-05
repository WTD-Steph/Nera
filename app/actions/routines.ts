"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";

/** Parse "YYYY-MM-DDTHH:mm" (Asia/Jakarta local) → ISO with +07:00. */
function jakartaLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  return `${local}:00+07:00`;
}

export async function addRoutineAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const emoji = String(formData.get("emoji") ?? "").trim() || null;
  const needsDuration = formData.get("needs_duration") === "1";
  const returnTo = String(formData.get("return_to") ?? "/more/profile");

  if (!name || name.length > 80) redirect(returnTo);

  const [user, baby] = await Promise.all([getCachedUser(), getCurrentBaby()]);
  if (!user) redirect("/login");
  if (!baby) redirect("/setup");

  const supabase = createClient();
  // Find current max display_order to append at end
  const { data: existing } = await supabase
    .from("routines")
    .select("display_order")
    .eq("baby_id", baby.id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (existing?.display_order ?? -1) + 1;

  await supabase.from("routines").insert({
    baby_id: baby.id,
    name,
    emoji,
    needs_duration: needsDuration,
    display_order: nextOrder,
    created_by: user.id,
  });

  revalidatePath("/");
  revalidatePath("/more/profile");
  redirect(returnTo);
}

export async function deleteRoutineAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/more/profile");
  if (!id) redirect(returnTo);

  const [user, baby] = await Promise.all([getCachedUser(), getCurrentBaby()]);
  if (!user) redirect("/login");
  if (!baby) redirect("/setup");

  const supabase = createClient();
  await supabase
    .from("routines")
    .delete()
    .eq("id", id)
    .eq("baby_id", baby.id);

  revalidatePath("/");
  revalidatePath("/more/profile");
  redirect(returnTo);
}

export async function logRoutineAction(formData: FormData) {
  const routineId = String(formData.get("routine_id") ?? "");
  const loggedAtRaw = String(formData.get("logged_at") ?? "").trim();
  const durationRaw = String(formData.get("duration_min") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const returnTo = String(formData.get("return_to") ?? "/");

  if (!routineId) redirect(returnTo);

  const [user, baby] = await Promise.all([getCachedUser(), getCurrentBaby()]);
  if (!user) redirect("/login");
  if (!baby) redirect("/setup");

  const supabase = createClient();
  const insert: {
    routine_id: string;
    baby_id: string;
    created_by: string;
    logged_at?: string;
    duration_min?: number;
    notes?: string | null;
  } = {
    routine_id: routineId,
    baby_id: baby.id,
    created_by: user.id,
  };
  const loggedIso = loggedAtRaw ? jakartaLocalToIso(loggedAtRaw) : null;
  if (loggedIso) insert.logged_at = loggedIso;
  if (durationRaw) {
    const n = Number(durationRaw);
    if (Number.isFinite(n) && n >= 0 && n <= 480) insert.duration_min = n;
  }
  if (notes) insert.notes = notes;

  await supabase.from("routine_logs").insert(insert);

  revalidatePath("/");
  redirect(returnTo);
}

export async function unlogRoutineAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "/");
  if (!id) redirect(returnTo);

  const [user, baby] = await Promise.all([getCachedUser(), getCurrentBaby()]);
  if (!user) redirect("/login");
  if (!baby) redirect("/setup");

  const supabase = createClient();
  await supabase
    .from("routine_logs")
    .delete()
    .eq("id", id)
    .eq("baby_id", baby.id);

  revalidatePath("/");
  redirect(returnTo);
}
