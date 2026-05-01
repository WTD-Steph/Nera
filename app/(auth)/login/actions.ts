"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/utils/origin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email || !EMAIL_RE.test(email)) {
    redirect(`/login?error=${encodeURIComponent("Format email tidak valid.")}`);
  }

  const supabase = createClient();
  const origin = getOrigin();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent("Gagal mengirim magic link. Coba lagi sebentar.")}`,
    );
  }

  redirect(`/verify?email=${encodeURIComponent(email)}`);
}
