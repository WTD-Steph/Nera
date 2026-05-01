"use client";

import { useEffect, useState } from "react";
import { createGrowthAction } from "@/app/actions/growth";
import { SubmitButton } from "@/components/SubmitButton";

function nowDatetimeLocal(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function GrowthMeasureTrigger({
  className,
  children,
  returnTo = "/growth",
}: {
  className?: string;
  children: React.ReactNode;
  returnTo?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
      >
        {children}
      </button>
      {open ? (
        <Modal returnTo={returnTo} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function Modal({
  returnTo,
  onClose,
}: {
  returnTo: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white shadow-2xl md:rounded-3xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="-ml-1 p-1 text-gray-400 hover:text-gray-700"
            aria-label="Tutup"
          >
            ✕
          </button>
          <div className="text-sm font-semibold text-gray-800">
            Catat Pengukuran
          </div>
          <span className="w-6" />
        </div>

        <form action={createGrowthAction} className="space-y-4 p-4">
          <input type="hidden" name="return_to" value={returnTo} />

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-600">
              Waktu pengukuran
            </span>
            <input
              type="datetime-local"
              name="measured_at"
              defaultValue={nowDatetimeLocal()}
              required
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                Berat (kg)
              </span>
              <input
                type="number"
                name="weight_kg"
                step="0.01"
                min="0.5"
                max="30"
                required
                inputMode="decimal"
                placeholder="3.50"
                autoFocus
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                Panjang (cm)
              </span>
              <input
                type="number"
                name="height_cm"
                step="0.1"
                min="20"
                max="130"
                required
                inputMode="decimal"
                placeholder="52.0"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-600">
              Lingkar kepala (cm) — opsional
            </span>
            <input
              type="number"
              name="head_circ_cm"
              step="0.1"
              min="20"
              max="60"
              inputMode="decimal"
              placeholder="35.0"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-600">
              Catatan (opsional)
            </span>
            <textarea
              name="notes"
              maxLength={500}
              rows={2}
              placeholder="Misal: dari posyandu, atau dokter X"
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-rose-400"
            />
          </label>

          <SubmitButton className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 active:bg-rose-700">
            Simpan
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
