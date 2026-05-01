export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-12">
      <div className="mb-8 flex flex-col items-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-pink-400 text-2xl shadow-md">
          <span aria-hidden>👶</span>
        </div>
        <h1 className="mt-3 text-xl font-bold text-gray-900">Nera</h1>
        <p className="mt-1 text-xs text-gray-500">Baby tracker untuk keluarga</p>
      </div>
      <div className="w-full rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        {children}
      </div>
    </main>
  );
}
