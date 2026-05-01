"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signUpAction(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!email || !EMAIL_RE.test(email)) {
    redirect(`/signup?error=${encodeURIComponent("Format email tidak valid.")}`);
  }
  if (!password || password.length < 6) {
    redirect(
      `/signup?error=${encodeURIComponent("Password minimal 6 karakter.")}`,
    );
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    // Generik untuk anti email enumeration. Common case: user sudah ada.
    redirect(
      `/signup?error=${encodeURIComponent(
        "Gagal daftar. Email mungkin sudah terdaftar — coba masuk.",
      )}`,
    );
  }

  // Email confirmation di Supabase Auth → Settings harus DISABLED supaya
  // signUp langsung memberikan session. Kalau enabled, data.session akan null.
  if (!data.session) {
    redirect(
      `/login?error=${encodeURIComponent(
        "Akun terdaftar. Silakan masuk dengan email + password.",
      )}`,
    );
  }

  redirect(next);
}
