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
  pumpingOngoing,
  lastEndedLabel,
}: {
  subtype: "sleep" | "pumping" | "feeding" | "hiccup" | "tummy";
  label: string;
  emoji: string;
  /** When subtype=feeding, used to gate the combo "+ pump sisi lain"
   *  toggle — only meaningful when no pumping is ongoing yet. */
  pumpingOngoing?: boolean;
  /** "selesai 1j 30m lalu" — gap since last ended session of this type. */
  lastEndedLabel?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [offsetMin, setOffsetMin] = useState(0);
  const [comboPump, setComboPump] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full flex-col items-center gap-0.5 rounded-2xl border border-rose-200 bg-white p-3 shadow-sm transition-transform active:scale-95"
      >
        <span className="text-2xl" aria-hidden>
          {emoji}
        </span>
        <span className="text-[11px] font-semibold text-rose-700">{label}</span>
        {lastEndedLabel ? (
          <span className="text-[9px] font-medium text-gray-400">
            selesai {lastEndedLabel}
          </span>
        ) : null}
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
      {subtype === "sleep" || subtype === "hiccup" || subtype === "tummy" ? (
        <div className="grid grid-cols-1 gap-1.5">
          <SideChoice
            subtype={subtype}
            side="both"
            offsetMin={offsetMin}
            label="Mulai"
          />
        </div>
      ) : subtype === "feeding" ? (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <SideChoice
              subtype={subtype}
              side="kiri"
              offsetMin={offsetMin}
              label="🤱 Kiri"
              comboPump={comboPump && !pumpingOngoing}
            />
            <SideChoice
              subtype={subtype}
              side="kanan"
              offsetMin={offsetMin}
              label="🤱 Kanan"
              comboPump={comboPump && !pumpingOngoing}
            />
          </div>
          {!pumpingOngoing ? (
            <label className="mt-1.5 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-[10px] leading-snug text-amber-800">
              <input
                type="checkbox"
                checked={comboPump}
                onChange={(e) => setComboPump(e.target.checked)}
                className="mt-0.5 flex-shrink-0 h-3 w-3 accent-amber-600"
              />
              <span>
                💧 <span className="font-semibold">Sekalian pump sisi lain</span>{" "}
                — Capture letdown reflex saat nyusu di satu sisi.
              </span>
            </label>
          ) : null}
        </>
      ) : (
        // Pumping: 3 sides (Kiri / Kanan / Dua sisi). Use 💧 (pumping
        // context) instead of 🤱 (DBF). Equal-width grid; "Dua sisi"
        // text — clearer than "Dua" alone.
        <div className="grid grid-cols-3 gap-1.5">
          <SideChoice
            subtype={subtype}
            side="kiri"
            offsetMin={offsetMin}
            label="💧 Kiri"
          />
          <SideChoice
            subtype={subtype}
            side="kanan"
            offsetMin={offsetMin}
            label="💧 Kanan"
          />
          <SideChoice
            subtype={subtype}
            side="both"
            offsetMin={offsetMin}
            label="💧 Dua sisi"
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
  comboPump,
}: {
  subtype: "sleep" | "pumping" | "feeding" | "hiccup" | "tummy";
  side: "kiri" | "kanan" | "both";
  offsetMin: number;
  label: string;
  /** Feeding only — when true, also start pumping on opposite side. */
  comboPump?: boolean;
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
      {subtype === "feeding" && comboPump && side !== "both" ? (
        <input
          type="hidden"
          name="combo_pump_side"
          value={side === "kiri" ? "kanan" : "kiri"}
        />
      ) : null}
      <input type="hidden" name="return_to" value="/" />
      <SubmitButton
        pendingText="…"
        className={`flex w-full items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-[10px] font-semibold shadow-sm transition-transform active:scale-95 ${
          comboPump && subtype === "feeding"
            ? "border-amber-300 bg-amber-50 text-amber-700"
            : "border-rose-200 bg-white text-rose-700"
        }`}
      >
        {comboPump && subtype === "feeding"
          ? `${label} + 💧`
          : label}
      </SubmitButton>
    </form>
  );
}
