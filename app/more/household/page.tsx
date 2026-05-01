import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentHousehold } from "@/lib/household/current";
import {
  inviteMemberAction,
  revokeInvitationAction,
  removeMemberAction,
  leaveHouseholdAction,
} from "./actions";

type SearchParams = {
  error?: string;
  invited?: string;
  url?: string;
};

export default async function HouseholdPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/more/household");

  const current = await getCurrentHousehold();
  if (!current) redirect("/setup");

  // List members via RPC — household_members SELECT policy adalah self-only
  // untuk anti-recursion; cross-member listing perlu SECURITY DEFINER.
  const { data: members } = await supabase.rpc("list_household_members", {
    h_id: current.household_id,
  });

  // Pending invitations (RLS: owner sees all, non-owner sees own)
  const { data: invitations } = await supabase
    .from("household_invitations")
    .select("id, invited_email, role, expires_at, created_at, accepted_at")
    .eq("household_id", current.household_id)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });

  const isOwner = current.role === "owner";
  const error = searchParams.error;
  const invitedEmail = searchParams.invited;
  const inviteUrl = searchParams.url;

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6 md:max-w-2xl">
      <header className="mb-4 flex items-center gap-3">
        <a
          href="/"
          className="text-sm text-rose-600 hover:underline"
          aria-label="Kembali"
        >
          ← Kembali
        </a>
      </header>

      <h1 className="text-base font-bold text-gray-900">
        Keluarga {current.household_name}
      </h1>
      <p className="mt-1 text-xs text-gray-500">
        Anda: <span className="font-medium">{user.email}</span> ·{" "}
        <span className="font-medium">
          {current.role === "owner" ? "Owner" : "Member"}
        </span>
      </p>

      {/* Invite result banner */}
      {invitedEmail && inviteUrl ? (
        <div className="mt-4 rounded-2xl border border-green-100 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-800">
            Undangan dibuat untuk {invitedEmail}
          </p>
          <p className="mt-1 text-xs text-green-700">
            Share link berikut via WhatsApp / pesan lain. Mereka daftar dengan
            email yang sama untuk terima:
          </p>
          <code className="mt-2 block break-all rounded-lg bg-white px-2 py-1.5 text-[11px] text-gray-800">
            {inviteUrl}
          </code>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      {/* Members */}
      <section className="mt-5">
        <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700">
          Member ({members?.length ?? 0})
        </h2>
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {(members ?? []).map((m) => (
            <div
              key={m.user_id}
              className="flex items-center justify-between border-b border-gray-50 px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-800">
                  {m.email ?? `User ${m.user_id.slice(0, 8)}`}
                </div>
                <div className="text-[11px] text-gray-400">
                  {m.role === "owner" ? "Owner" : "Member"} · bergabung{" "}
                  {new Date(m.joined_at).toLocaleDateString("id-ID")}
                </div>
              </div>
              {isOwner && m.user_id !== user.id ? (
                <form action={removeMemberAction}>
                  <input type="hidden" name="user_id" value={m.user_id} />
                  <input
                    type="hidden"
                    name="household_id"
                    value={current.household_id}
                  />
                  <button
                    type="submit"
                    className="text-[11px] font-medium text-red-600 hover:underline"
                  >
                    Hapus
                  </button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {/* Invite form (owner only) */}
      {isOwner ? (
        <section className="mt-6">
          <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700">
            Undang member baru
          </h2>
          <form
            action={inviteMemberAction}
            className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
          >
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Email</span>
              <input
                type="email"
                name="email"
                required
                inputMode="email"
                autoComplete="email"
                placeholder="pasangan@email.com"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
              />
            </label>
            <fieldset>
              <legend className="text-xs font-semibold text-gray-600">
                Peran
              </legend>
              <div className="mt-1 space-y-2">
                <label className="flex items-start gap-2 rounded-xl border border-gray-200 p-3 hover:bg-rose-50 has-[:checked]:border-rose-400 has-[:checked]:bg-rose-50">
                  <input
                    type="radio"
                    name="role"
                    value="owner"
                    className="mt-0.5"
                  />
                  <div className="text-sm">
                    <div className="font-medium text-gray-800">
                      Co-parent (owner)
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Akses penuh, bisa mengundang member lain. Untuk pasangan
                      atau co-parent setara.
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-2 rounded-xl border border-gray-200 p-3 hover:bg-rose-50 has-[:checked]:border-rose-400 has-[:checked]:bg-rose-50">
                  <input
                    type="radio"
                    name="role"
                    value="member"
                    defaultChecked
                    className="mt-0.5"
                  />
                  <div className="text-sm">
                    <div className="font-medium text-gray-800">Caregiver</div>
                    <div className="text-[11px] text-gray-500">
                      Bisa CRUD data harian (susu, popok, tidur, dll), tidak
                      bisa mengundang lain. Untuk mertua, nanny, dll.
                    </div>
                  </div>
                </label>
              </div>
            </fieldset>
            <button
              type="submit"
              className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-600 active:bg-rose-700"
            >
              Kirim undangan
            </button>
          </form>
        </section>
      ) : null}

      {/* Pending invitations (owner only sees them via RLS) */}
      {isOwner && invitations && invitations.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700">
            Undangan tertunda ({invitations.length})
          </h2>
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {invitations.map((inv) => {
              const isExpired = new Date(inv.expires_at) <= new Date();
              return (
                <div
                  key={inv.id}
                  className="flex items-center justify-between border-b border-gray-50 px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-800">
                      {inv.invited_email}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {inv.role === "owner" ? "Co-parent" : "Caregiver"} ·{" "}
                      {isExpired
                        ? "kedaluwarsa"
                        : `kedaluwarsa ${new Date(inv.expires_at).toLocaleDateString("id-ID")}`}
                    </div>
                  </div>
                  <form action={revokeInvitationAction}>
                    <input type="hidden" name="id" value={inv.id} />
                    <button
                      type="submit"
                      className="text-[11px] font-medium text-red-600 hover:underline"
                    >
                      Cabut
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Leave household */}
      <section className="mt-8">
        <form action={leaveHouseholdAction}>
          <input
            type="hidden"
            name="household_id"
            value={current.household_id}
          />
          <button
            type="submit"
            className="w-full rounded-xl border border-red-200 bg-white py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            Keluar dari keluarga ini
          </button>
        </form>
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-gray-400">
          Setelah keluar, Anda kehilangan akses ke semua data keluarga ini.
          Owner lain bisa mengundang Anda kembali.
        </p>
      </section>
    </main>
  );
}
