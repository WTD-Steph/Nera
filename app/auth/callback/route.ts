import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Legacy magic-link callback. Sekarang auth pakai email + password
 * (lihat /login + /signup), jadi route ini cuma fallback.
 *
 * Kalau ?code=… ada (misal dari recovery flow future), exchange.
 * Kalau tidak ada, langsung redirect ke /.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent("Link tidak valid atau sudah kedaluwarsa.")}`,
      );
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
