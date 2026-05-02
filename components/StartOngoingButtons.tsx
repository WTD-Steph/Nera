"use client";

import { useState } from "react";
import { startOngoingLogAction } from "@/app/actions/logs";
import { SubmitButton } from "@/components/SubmitButton";

export function StartOngoingButton({
  subtype,
  label,
  emoji,
}: {
  subtype: "sleep" | "pumping" | "feeding";
  label: string;
  emoji: string;
}) {
  // Pumping AND DBF (subtype='feeding') share a side picker —
  // Kiri / Kanan / Dua-duanya. Sleep keeps its single-button flow.
  if (subtype === "pumping" || subtype === "feeding") {
    return (
      <StartSidedButton
        subtype={subtype}
        label={label}
        emoji={emoji}
      />
    );
  }
  return (
    <form action={startOngoingLogAction}>
      <input type="hidden" name="subtype" value={subtype} />
      <input type="hidden" name="return_to" value="/" />
      <SubmitButton
        pendingText="…"
        className="flex w-full flex-col items-center gap-1 rounded-2xl border border-rose-200 bg-white p-3 shadow-sm transition-transform active:scale-95"
      >
        <span className="text-2xl" aria-hidden>
          {emoji}
        </span>
        <span className="text-[11px] font-semibold text-rose-700">{label}</span>
      </SubmitButton>
    </form>
  );
}

function StartSidedButton({
  subtype,
  label,
  emoji,
}: {
  subtype: "pumping" | "feeding";
  label: string;
  emoji: string;
}) {
  const [open, setOpen] = useState(false);

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

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-2 shadow-sm">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold text-rose-700">
          Mulai dari mana?
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-gray-400 hover:text-gray-600"
          aria-label="Batal"
        >
          ✕
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <SideChoice subtype={subtype} side="kiri" emoji="🤱" label="Kiri" />
        <SideChoice subtype={subtype} side="kanan" emoji="🤱" label="Kanan" />
        <SideChoice subtype={subtype} side="both" emoji="🤱🤱" label="Dua" />
      </div>
    </div>
  );
}

function SideChoice({
  subtype,
  side,
  emoji,
  label,
}: {
  subtype: "pumping" | "feeding";
  side: "kiri" | "kanan" | "both";
  emoji: string;
  label: string;
}) {
  const sideField = subtype === "pumping" ? "pumping_side" : "dbf_side";
  return (
    <form action={startOngoingLogAction}>
      <input type="hidden" name="subtype" value={subtype} />
      <input type="hidden" name={sideField} value={side} />
      <input type="hidden" name="return_to" value="/" />
      <SubmitButton
        pendingText="…"
        className="flex w-full flex-col items-center gap-0.5 rounded-xl border border-rose-200 bg-white px-2 py-2.5 text-[10px] font-semibold text-rose-700 shadow-sm transition-transform active:scale-95"
      >
        <span aria-hidden>{emoji}</span>
        <span>{label}</span>
      </SubmitButton>
    </form>
  );
}
