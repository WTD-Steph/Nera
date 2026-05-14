"use client";

import { useState } from "react";
import { DbMeter } from "@/components/DbMeter";

export function DbMeterClient() {
  const [active, setActive] = useState(false);
  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="w-full rounded-2xl border border-rose-200 bg-rose-50/60 py-6 text-center shadow-sm transition-transform hover:bg-rose-100 active:scale-[0.99]"
      >
        <div className="text-3xl">🎤</div>
        <div className="mt-1 text-sm font-semibold text-rose-700">
          Mulai pengukuran
        </div>
        <div className="text-[11px] text-rose-600/70">
          App akan minta izin mikrofon
        </div>
      </button>
    );
  }
  return (
    <div className="space-y-3">
      <DbMeter enabled />
      <button
        type="button"
        onClick={() => setActive(false)}
        className="w-full rounded-xl border border-gray-200 bg-white py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
      >
        ⏸ Stop mic
      </button>
    </div>
  );
}
