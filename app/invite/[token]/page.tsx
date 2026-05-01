import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  // Lookup invitation. RLS allows kalau invited_email = auth.email.
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
              Anda diundang untuk bergabung ke{" "}
              <span className="font-semibold">
                {(invitation.households as { name: string } | null)?.name ??
                  "keluarga ini"}
              </span>{" "}
              sebagai{" "}
              <span className="font-semibold">
                {invitation.role === "owner" ? "co-parent (owner)" : "member"}
              </span>
              .
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Login sebagai{" "}
              <span className="font-medium text-gray-700">{user.email}</span>.
            </p>

            <form action={acceptInviteAction} className="mt-5 space-y-3">
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-600 active:bg-rose-700"
              >
                Terima undangan
              </button>
            </form>

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

            <a
              href="/"
              className="mt-5 block w-full rounded-xl bg-gray-100 py-3 text-center text-sm font-semibold text-gray-700 hover:bg-gray-200"
            >
              Kembali ke beranda
            </a>
          </>
        )}
      </div>
    </main>
  );
}
