"use client";

import { useState } from "react";
import { startOngoingLogAction } from "@/app/actions/logs";
import { SubmitButton } from "@/components/SubmitButton";

const OFFSET_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Sekarang" },
  { value: 1, label: "1 menit lalu" },
  { value: 3, label: "3 menit lalu" },
  { value: 5, label: "5 menit lalu" },
  { value: 7, label: "7 menit lalu" },
  { value: 10, label: "10 menit lalu" },
];

export function StartOngoingButton({
  subtype,
  label,
  emoji,
}: {
  subtype: "sleep" | "pumping" | "feeding" | "hiccup";
  label: string;
  emoji: string;
}) {
  const [open, setOpen] = useState(false);
  const [offsetMin, setOffsetMin] = useState(0);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full flex-col items-center gap-1 rounded-2xl border border-rose-200 bg-white p-3 shadow-sm transition-transform active:scale-95"
      >
        <span className="text-2xl" aria-hidden>
          {emoji}
        </span>
        <span className="text-[11px] font-semibold text-rose-700">{label}</span>
      </button>
    );
  }

  const close = () => {
    setOpen(false);
    setOffsetMin(0);
  };

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-2 shadow-sm">
      <button
        type="button"
        onClick={close}
        className="mb-1 flex w-full items-center justify-between rounded-lg px-1.5 py-1 hover:bg-rose-100/50 active:scale-[0.98]"
        aria-label="Tutup pilihan"
      >
        <span className="text-[11px] font-semibold text-rose-700">
          {emoji} {label}
        </span>
        <span
          aria-hidden
          className="flex h-6 w-6 items-center justify-center rounded-full text-sm text-gray-500"
        >
          ✕
        </span>
      </button>
      <select
        value={offsetMin}
        onChange={(e) => setOffsetMin(Number(e.target.value))}
        className="mb-1.5 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-rose-400"
      >
        {OFFSET_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            Mulai · {o.label}
          </option>
        ))}
      </select>
      {subtype === "sleep" || subtype === "hiccup" ? (
        <div className="grid grid-cols-1 gap-1.5">
          <SideChoice
            subtype={subtype}
            side="both"
            offsetMin={offsetMin}
            label="Mulai"
          />
        </div>
      ) : subtype === "feeding" ? (
        <div className="grid grid-cols-2 gap-1.5">
          <SideChoice
            subtype={subtype}
            side="kiri"
            offsetMin={offsetMin}
            label="🤱 Kiri"
          />
          <SideChoice
            subtype={subtype}
            side="kanan"
            offsetMin={offsetMin}
            label="🤱 Kanan"
          />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          <SideChoice
            subtype={subtype}
            side="kiri"
            offsetMin={offsetMin}
            label="🤱 Kiri"
          />
          <SideChoice
            subtype={subtype}
            side="kanan"
            offsetMin={offsetMin}
            label="🤱 Kanan"
          />
          <SideChoice
            subtype={subtype}
            side="both"
            offsetMin={offsetMin}
            label="🤱🤱 Dua"
          />
        </div>
      )}
    </div>
  );
}

function SideChoice({
  subtype,
  side,
  offsetMin,
  label,
}: {
  subtype: "sleep" | "pumping" | "feeding" | "hiccup";
  side: "kiri" | "kanan" | "both";
  offsetMin: number;
  label: string;
}) {
  // sleep + hiccup have no side concept; only pumping + feeding use sides.
  const sideField = subtype === "pumping" ? "pumping_side" : "dbf_side";
  return (
    <form action={startOngoingLogAction}>
      <input type="hidden" name="subtype" value={subtype} />
      {subtype === "pumping" || subtype === "feeding" ? (
        <input type="hidden" name={sideField} value={side} />
      ) : null}
      <input
        type="hidden"
        name="start_offset_min"
        value={String(offsetMin)}
      />
      <input type="hidden" name="return_to" value="/" />
      <SubmitButton
        pendingText="…"
        className="flex w-full items-center justify-center gap-1 rounded-xl border border-rose-200 bg-white px-2 py-2.5 text-[10px] font-semibold text-rose-700 shadow-sm transition-transform active:scale-95"
      >
        {label}
      </SubmitButton>
    </form>
  );
}
