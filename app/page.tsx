export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-pink-400 text-3xl shadow-md">
        <span aria-hidden>👶</span>
      </div>
      <h1 className="mt-6 text-2xl font-bold text-gray-900">Nera</h1>
      <p className="mt-2 text-sm text-gray-600">
        Baby tracker — multi-user household, Next.js + Supabase.
      </p>
      <p className="mt-8 text-xs text-gray-500">
        Phase 1 scaffold. Auth, baby profile, dan logging belum aktif —
        akan menyusul di PR #2a, #2b, #3, dst.
      </p>
      <a
        href="https://github.com/WTD-Steph/Nera/blob/main/PROJECT_BRIEF.md"
        className="mt-6 text-xs font-semibold text-rose-600 underline-offset-2 hover:underline"
        target="_blank"
        rel="noreferrer"
      >
        Baca PROJECT_BRIEF.md →
      </a>
    </main>
  );
}
