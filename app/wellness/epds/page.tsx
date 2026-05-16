import { redirect } from "next/navigation";
import Link from "next/link";
import { getCachedUser } from "@/lib/auth/cached";
import { getCurrentBaby } from "@/lib/household/baby";
import { createClient } from "@/lib/supabase/server";
import { EpdsClient } from "./EpdsClient";

export default async function EpdsPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login?next=/wellness/epds");
  const baby = await getCurrentBaby();
  if (!baby) redirect("/setup");

  const supabase = createClient();
  const { data: member } = await supabase
    .from("household_members")
    .select("perinatal_role")
    .eq("household_id", baby.household_id)
    .eq("user_id", user.id)
    .single();
  const role = member?.perinatal_role;
  if (role !== "mother" && role !== "father") {
    redirect("/wellness/intro");
  }

  // Lookup partner phone for crisis "kirim ke pasangan" CTA. Phone
  // bukan stored di standard fields; coba dari auth.users metadata
  // jika ada. Fallback null (button hidden kalau no phone).
  const { data: partnerMember } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", baby.household_id)
    .neq("user_id", user.id)
    .limit(1)
    .single();
  // Phone lookup deferred — Anda + istri share phone numbers via WA
  // already. v2: tambah household_members.phone_e164 column kalau perlu.
  const partnerPhone: string | null = null;
  void partnerMember;

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6 md:max-w-lg">
      <header className="mb-4 flex items-center justify-between">
        <Link
          href="/wellness"
          className="text-sm text-rose-600 hover:underline"
        >
          ← Wellness
        </Link>
        <h1 className="text-base font-bold text-gray-900">
          EPDS · {role === "mother" ? "Ibu" : "Ayah"}
        </h1>
        <span className="w-12" />
      </header>

      <EpdsClient role={role} partnerPhone={partnerPhone} />

      <p className="mt-6 text-[10px] leading-snug text-gray-400">
        Edinburgh Postnatal Depression Scale (Cox, Holden, Sagovsky 1987).
        Indonesian version: Kusumadewi et al. 1998 / validated Hutauruk
        2012. EPDS © Royal College of Psychiatrists, used with
        acknowledgment. Bukan diagnosis — hanya skrining.
      </p>
    </main>
  );
}
