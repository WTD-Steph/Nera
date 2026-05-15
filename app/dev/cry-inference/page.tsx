// Dev-only test harness untuk CryInferenceEngine.
//
// Gated by NODE_ENV === 'development' — notFound() di production build.
//
// Minimal UI per PR B prompt:
// - Start / Stop buttons
// - Model load status display
// - Live state, latest probability, samples buffered count
// - "Dump tuning session" button → download JSON
// - "Force clear cache" button → wipe IndexedDB cache untuk testing
//   re-download flow
//
// EKSPLISIT TIDAK termasuk: playback/replay, threshold sliders,
// session browser, charts. Itu over-engineering untuk v1 test harness
// — offline analysis di laptop pakai Jupyter/script.

import { notFound } from "next/navigation";
import { CryInferenceHarness } from "./CryInferenceHarness";

export default function CryInferenceDevPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-lg font-bold text-gray-900">
          dev: cry inference harness
        </h1>
        <p className="mt-1 text-xs text-gray-500">
          PR B test harness · gated NODE_ENV=development · 404 di production.
        </p>
      </header>
      <CryInferenceHarness />
    </main>
  );
}
