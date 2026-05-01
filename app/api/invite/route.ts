import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "@/lib/household/current";
import { createInvitation, type InviteRole } from "@/lib/household/invite";

type Body = { email?: string; role?: InviteRole };

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || typeof body.email !== "string") {
    return NextResponse.json(
      { error: "email required" },
      { status: 400 },
    );
  }
  const role: InviteRole = body.role === "owner" ? "owner" : "member";

  const current = await getCurrentHousehold();
  if (!current) {
    return NextResponse.json(
      { error: "no household — call /setup first" },
      { status: 409 },
    );
  }
  if (current.role !== "owner") {
    return NextResponse.json(
      { error: "only owner can invite" },
      { status: 403 },
    );
  }

  const result = await createInvitation(body.email, role, current.household_id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    inviteUrl: result.inviteUrl,
    emailSent: result.emailSent,
  });
}
