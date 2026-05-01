import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/utils/origin";

export type InviteRole = "owner" | "member";

const INVITE_TTL_DAYS = 7;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InviteResult =
  | { ok: true; inviteUrl: string; emailSent: boolean }
  | { ok: false; error: string };

export async function createInvitation(
  email: string,
  role: InviteRole,
  householdId: string,
): Promise<InviteResult> {
  const cleanedEmail = email.trim().toLowerCase();
  if (!cleanedEmail || !EMAIL_RE.test(cleanedEmail)) {
    return { ok: false, error: "Format email tidak valid." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sesi habis. Silakan masuk lagi." };
  }

  // RLS verify owner-of-household enforced di INSERT policy.
  // Token: 122-bit UUID, cukup untuk anti-guessing.
  const token = randomUUID().replace(/-/g, "");
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error: insertError } = await supabase
    .from("household_invitations")
    .insert({
      household_id: householdId,
      invited_email: cleanedEmail,
      invited_by: user.id,
      role,
      token,
      expires_at: expiresAt,
    });

  if (insertError) {
    if (insertError.code === "42501" || insertError.message.includes("policy")) {
      return {
        ok: false,
        error: "Hanya owner yang bisa mengundang. Cek role Anda.",
      };
    }
    return { ok: false, error: "Gagal membuat undangan. Coba lagi." };
  }

  const origin = getOrigin();
  const inviteUrl = `${origin}/invite/${token}`;

  // Kirim magic link ke email tersebut. emailRedirectTo akan bawa user
  // melalui /auth/callback → /invite/[token] sebagai logged-in.
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email: cleanedEmail,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(
        `/invite/${token}`,
      )}`,
    },
  });

  // Kalau OTP gagal kirim (rate limit dll), invitation tetap valid —
  // owner bisa share inviteUrl manual via WhatsApp/etc.
  return { ok: true, inviteUrl, emailSent: !otpError };
}
