"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!email || !EMAIL_RE.test(email)) {
    redirect(`/login?error=${encodeURIComponent("Format email tidak valid.")}`);
  }
  if (!password || password.length < 6) {
    redirect(
      `/login?error=${encodeURIComponent("Password minimal 6 karakter.")}`,
    );
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent("Email atau password salah.")}`,
    );
  }

  redirect(next);
}
