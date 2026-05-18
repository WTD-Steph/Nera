import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/SubmitButton";
import { acceptInviteAction } from "./actions";

type SearchParams = { error?: string };

type Params = { token: string };

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { token } = params;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Tidak login — arahkan ke signup. Kita tidak bisa lookup invitation.invited_email
    // di sini (RLS blokir untuk anonymous), jadi user harus daftar email yang
    // sama dengan yang diundang manual.
    redirect(`/signup?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  // Lookup invitation. RLS allows kalau invited_email = auth.email ATAU
  // user adalah owner household tersebut (mis. Stephanus saat test/setup
  // invitation untuk keluarga lain).
  const { data: invitation } = await supabase
    .from("household_invitations")
    .select("id, role, household_id, expires_at, accepted_at, households(name), invited_email")
    .eq("token", token)
    .maybeSingle();

  const error = searchParams.error;
  const isExpired =
    invitation && new Date(invitation.expires_at) <= new Date();
  const isAccepted = invitation && invitation.accepted_at !== null;
  const valid = invitation && !isExpired && !isAccepted;
  const emailMismatch =
    valid &&
    (user.email ?? "").toLowerCase() !==
      invitation.invited_email.toLowerCase();
  const householdName =
    (invitation?.households as { name: string } | null)?.name ??
    "keluarga ini";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-12">
      <div className="mb-8 flex flex-col items-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-pink-400 text-2xl shadow-md">
          <span aria-hidden>👶</span>
        </div>
        <h1 className="mt-3 text-xl font-bold text-gray-900">Nera</h1>
      </div>

      <div className="w-full rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        {valid ? (
          <>
            <h2 className="text-base font-bold text-gray-800">
              Undangan keluarga
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-700">
              Diundang ke{" "}
              <span className="font-semibold">{householdName}</span> sebagai{" "}
              <span className="font-semibold">
                {invitation.role === "owner" ? "co-parent (owner)" : "member"}
              </span>
              .
            </p>

            <div className="mt-4 space-y-1.5 rounded-xl bg-gray-50 px-3 py-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500">Diundang untuk:</span>
                <span className="font-medium text-gray-800">
                  {invitation.invited_email}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500">Login sekarang sebagai:</span>
                <span
                  className={
                    emailMismatch
                      ? "font-medium text-red-700"
                      : "font-medium text-gray-800"
                  }
                >
                  {user.email}
                </span>
              </div>
            </div>

            {emailMismatch ? (
              <>
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
                  Email login tidak sama dengan email yang diundang. Sign out
                  dulu, lalu login (atau daftar baru) pakai{" "}
                  <span className="font-semibold">
                    {invitation.invited_email}
                  </span>{" "}
                  untuk terima undangan ini.
                </div>
                <form
                  action="/auth/signout"
                  method="POST"
                  className="mt-3"
                >
                  <input
                    type="hidden"
                    name="next"
                    value={`/invite/${token}`}
                  />
                  <button
                    type="submit"
                    className="w-full rounded-xl border border-rose-300 bg-white py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 active:bg-rose-100"
                  >
                    Sign out & login dengan email yang benar
                  </button>
                </form>
              </>
            ) : (
              <form action={acceptInviteAction} className="mt-5 space-y-3">
                <input type="hidden" name="token" value={token} />
                <SubmitButton
                  pendingText="Memproses…"
                  className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-600 active:bg-rose-700"
                >
                  Terima undangan
                </SubmitButton>
              </form>
            )}

            {error ? (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <h2 className="text-base font-bold text-gray-800">
              Undangan tidak valid
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-700">
              Link ini sudah kedaluwarsa, sudah pernah dipakai, atau bukan
              untuk akun{" "}
              <span className="font-medium text-gray-800">{user.email}</span>.
            </p>
            <p className="mt-3 text-xs text-gray-500">
              Minta pengundang untuk kirim ulang link, atau pastikan Anda login
              dengan email yang diundang.
            </p>

            <Link
              href="/"
              className="mt-5 block w-full rounded-xl bg-gray-100 py-3 text-center text-sm font-semibold text-gray-700 hover:bg-gray-200"
            >
              Kembali ke beranda
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
