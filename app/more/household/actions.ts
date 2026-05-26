"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "@/lib/household/current";
import { createInvitation, type InviteRole } from "@/lib/household/invite";
import { ACTIVE_HOUSEHOLD_COOKIE } from "@/lib/household/current";

export async function inviteMemberAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const role = String(formData.get("role") ?? "member") as InviteRole;
  if (role !== "owner" && role !== "member") {
    redirect(
      `/more/household?error=${encodeURIComponent("Role tidak valid.")}`,
    );
  }

  const current = await getCurrentHousehold();
  if (!current) {
    redirect("/setup");
  }
  if (current.role !== "owner") {
    redirect(
      `/more/household?error=${encodeURIComponent("Hanya owner yang bisa mengundang.")}`,
    );
  }

  const result = await createInvitation(email, role, current.household_id);
  if (!result.ok) {
    redirect(
      `/more/household?error=${encodeURIComponent(result.error)}`,
    );
  }

  const params = new URLSearchParams({
    invited: email,
    url: result.inviteUrl,
  });
  redirect(`/more/household?${params.toString()}`);
}

export async function revokeInvitationAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) {
    redirect(
      `/more/household?error=${encodeURIComponent("Invitation ID tidak valid.")}`,
    );
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("household_invitations")
    .delete()
    .eq("id", id);

  if (error) {
    redirect(
      `/more/household?error=${encodeURIComponent("Gagal cabut undangan.")}`,
    );
  }

  revalidatePath("/more/household");
  redirect("/more/household");
}

export async function removeMemberAction(formData: FormData) {
  const userId = String(formData.get("user_id") ?? "");
  const householdId = String(formData.get("household_id") ?? "");
  if (!userId || !householdId) {
    redirect(
      `/more/household?error=${encodeURIComponent("Data member tidak lengkap.")}`,
    );
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("remove_household_member", {
    h_id: householdId,
    target_user_id: userId,
  });

  if (error) {
    redirect(
      `/more/household?error=${encodeURIComponent("Gagal hapus member.")}`,
    );
  }

  revalidatePath("/more/household");
  redirect("/more/household");
}

/**
 * Switch active household. Sets cookie + revalidates app-wide so all
 * pages re-render dengan household yang dipilih.
 *
 * Verifies user is member of the target household sebelum set cookie —
 * mencegah user "set" cookie ke household sembarangan (defense in depth;
 * RLS juga blokir tapi cleaner kalau invalid cookie tidak persisted).
 */
export async function setActiveHouseholdAction(formData: FormData) {
  const householdId = String(formData.get("household_id") ?? "");
  if (!householdId) {
    redirect(
      `/more/household?error=${encodeURIComponent("Household ID tidak valid.")}`,
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify membership before setting cookie
  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .eq("household_id", householdId)
    .maybeSingle();
  if (!membership) {
    redirect(
      `/more/household?error=${encodeURIComponent("Anda bukan member household tersebut.")}`,
    );
  }

  cookies().set(ACTIVE_HOUSEHOLD_COOKIE, householdId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90, // 90 days
  });

  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Clear active household selection. App falls back ke oldest joined.
 */
export async function clearActiveHouseholdAction() {
  cookies().delete(ACTIVE_HOUSEHOLD_COOKIE);
  revalidatePath("/", "layout");
  redirect("/more/household");
}

export async function leaveHouseholdAction(formData: FormData) {
  const householdId = String(formData.get("household_id") ?? "");
  if (!householdId) {
    redirect(
      `/more/household?error=${encodeURIComponent("Household ID tidak valid.")}`,
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("household_members")
    .delete()
    .eq("user_id", user.id)
    .eq("household_id", householdId);

  if (error) {
    redirect(
      `/more/household?error=${encodeURIComponent("Gagal keluar dari household.")}`,
    );
  }

  // Kalau active household cookie pointing ke yang baru di-leave, clear
  // supaya next request fall back ke oldest yang masih remaining.
  const cookieStore = cookies();
  if (cookieStore.get(ACTIVE_HOUSEHOLD_COOKIE)?.value === householdId) {
    cookieStore.delete(ACTIVE_HOUSEHOLD_COOKIE);
  }

  revalidatePath("/", "layout");
  redirect("/");
}
