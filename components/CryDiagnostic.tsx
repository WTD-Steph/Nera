"use client";

import { useState } from "react";
import type { CryCause } from "@/lib/compute/cry-diagnostic";
import {
  LogModalTrigger,
  type AsiBatchOption,
} from "@/components/LogModal";
import { startOngoingLogAction } from "@/app/actions/logs";
import { SubmitButton } from "@/components/SubmitButton";
import { IluMassageInfo } from "@/components/IluMassageDiagram";

const SIGNAL_STYLES: Record<
  CryCause["signal"],
  { box: string; pill: string; pillLabel: string }
> = {
  strong: {
    box: "border-red-200 bg-red-50",
    pill: "bg-red-500 text-white",
    pillLabel: "Kuat",
  },
  medium: {
    box: "border-amber-200 bg-amber-50",
    pill: "bg-amber-500 text-white",
    pillLabel: "Sedang",
  },
  weak: {
    box: "border-gray-200 bg-white",
    pill: "bg-gray-200 text-gray-700",
    pillLabel: "Lemah",
  },
  info: {
    box: "border-rose-100 bg-rose-50/40",
    pill: "bg-rose-100 text-rose-700",
    pillLabel: "Info",
  },
};

export function CryDiagnostic({
  causes,
  asiBatches,
  babyName,
}: {
  causes: CryCause[];
  asiBatches: AsiBatchOption[];
  babyName: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    const strongCount = causes.filter((c) => c.signal === "strong").length;
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden>😢</span>
          <span>{babyName} nangis? Cek penyebab</span>
        </span>
        {strongCount > 0 ? (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
            {strongCount} sinyal kuat
          </span>
        ) : (
          <span className="text-[10px] text-rose-600/60">→</span>
        )}
      </button>
    );
  }

  return (
    <CryDiagnosticModal
      causes={causes}
      asiBatches={asiBatches}
      babyName={babyName}
      onClose={() => setOpen(false)}
    />
  );
}

function CryDiagnosticModal({
  causes,
  asiBatches,
  babyName,
  onClose,
}: {
  causes: CryCause[];
  asiBatches: AsiBatchOption[];
  babyName: string;
  onClose: () => void;
}) {
  const [showIlu, setShowIlu] = useState(false);

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Cek penyebab ${babyName} nangis`}
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
        onClick={onClose}
      >
        <div
          className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-800">
                😢 Cek penyebab {babyName} nangis
              </h2>
              <p className="text-[11px] text-gray-500">
                Berdasarkan data log terakhir. Sinyal kuat tampil di atas.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Tutup"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {causes.map((c) => (
              <CryCauseRow
                key={c.id}
                cause={c}
                asiBatches={asiBatches}
                onTipsTap={() => setShowIlu(true)}
              />
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/60 p-2 text-[11px] leading-snug text-amber-800">
            ⚠️ Kalau bayi nangis inkonsolabel + ada salah satu: demam ≥38°C,
            sulit bernapas, lethargic, vomit hijau, fontanel cembung — STOP
            checklist, langsung ke DSA / IGD anak.
          </div>
        </div>
      </div>
      {showIlu ? <IluMassageInfo onClose={() => setShowIlu(false)} /> : null}
    </>
  );
}

function CryCauseRow({
  cause,
  asiBatches,
  onTipsTap,
}: {
  cause: CryCause;
  asiBatches: AsiBatchOption[];
  onTipsTap: () => void;
}) {
  const style = SIGNAL_STYLES[cause.signal];
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${style.box}`}>
      <div className="flex items-start gap-2">
        <span className="text-lg" aria-hidden>
          {cause.emoji}
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">
              {cause.label}
            </span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${style.pill}`}
            >
              {style.pillLabel}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-gray-600">
            {cause.context}
          </p>
          {cause.action ? (
            <div className="mt-1.5">
              <ActionButton
                action={cause.action}
                asiBatches={asiBatches}
                onTipsTap={onTipsTap}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  action,
  asiBatches,
  onTipsTap,
}: {
  action: NonNullable<CryCause["action"]>;
  asiBatches: AsiBatchOption[];
  onTipsTap: () => void;
}) {
  const cls =
    "inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-3 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50";

  switch (action.type) {
    case "logFeeding":
      return (
        <LogModalTrigger
          subtype="feeding"
          asiBatches={asiBatches}
          className={cls}
        >
          {action.label}
        </LogModalTrigger>
      );
    case "logDiaper":
      return (
        <LogModalTrigger subtype="diaper" className={cls}>
          {action.label}
        </LogModalTrigger>
      );
    case "logTemp":
      return (
        <LogModalTrigger subtype="temp" className={cls}>
          {action.label}
        </LogModalTrigger>
      );
    case "startSleep":
      return (
        <form action={startOngoingLogAction}>
          <input type="hidden" name="subtype" value="sleep" />
          <input type="hidden" name="start_offset_min" value="0" />
          <input type="hidden" name="return_to" value="/?darklamp=sleep" />
          <SubmitButton pendingText="…" className={cls}>
            😴 {action.label}
          </SubmitButton>
        </form>
      );
    case "info":
      return (
        <button type="button" onClick={onTipsTap} className={cls}>
          {action.label}
        </button>
      );
    default:
      return null;
  }
}
