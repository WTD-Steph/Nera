"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "@/lib/household/current";
import { createInvitation, type InviteRole } from "@/lib/household/invite";

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

  // Setelah leave, user mungkin tidak punya household lagi → /setup
  redirect("/");
}
