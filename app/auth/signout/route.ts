import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  await supabase.auth.signOut();
  const { origin } = new URL(request.url);
  const formData = await request.formData().catch(() => null);
  const nextRaw = formData?.get("next");
  // Allow chaining signout → login dengan next param (mis. invite flow:
  // user salah login, signout, login lagi dengan email yang diundang).
  // Validate next must be relative path (start with /) untuk avoid open redirect.
  const next =
    typeof nextRaw === "string" && nextRaw.startsWith("/") ? nextRaw : null;
  const loginUrl = next
    ? `${origin}/login?next=${encodeURIComponent(next)}`
    : `${origin}/login`;
  return NextResponse.redirect(loginUrl, { status: 303 });
}
