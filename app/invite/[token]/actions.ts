"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function acceptInviteAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!token) {
    redirect(
      `/login?error=${encodeURIComponent("Token undangan tidak valid.")}`,
    );
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("accept_household_invitation", {
    invite_token: token,
  });

  if (error) {
    // Generik untuk hindari email enumeration / token leakage
    redirect(
      `/invite/${encodeURIComponent(token)}?error=${encodeURIComponent(
        "Undangan tidak valid, sudah kedaluwarsa, atau bukan untuk akun Anda.",
      )}`,
    );
  }

  redirect("/?welcome=joined");
}
