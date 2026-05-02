"use client";

import { useEffect, useState } from "react";
import {
  markImmunizationAction,
  unmarkImmunizationAction,
} from "@/app/actions/imunisasi";
import { SubmitButton } from "@/components/SubmitButton";
import { FormCloser } from "@/components/FormCloser";

export type ImunisasiRowData = {
  vaccineKey: string;
  vaccineName: string;
  givenAt: string | null; // YYYY-MM-DD
  facility: string | null;
  notes: string | null;
};

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ImunisasiRow({ data }: { data: ImunisasiRowData }) {
  const [open, setOpen] = useState(false);
  const given = !!data.givenAt;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100"
      >
        <div
          className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
            given
              ? "border-green-500 bg-green-500 text-white"
              : "border-gray-300"
          }`}
        >
          {given ? (
            <svg
              className="h-3 w-3"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          ) : null}
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium text-gray-800">
            {data.vaccineName}
          </div>
          {given ? (
            <div className="mt-0.5 text-[11px] text-green-600">
              {data.givenAt}
              {data.facility ? ` · ${data.facility}` : ""}
            </div>
          ) : (
            <div className="mt-0.5 text-[11px] text-gray-400">
              Tap untuk catat pemberian
            </div>
          )}
        </div>
      </button>
      {open ? (
        <ImunisasiModal data={data} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function ImunisasiModal({
  data,
  onClose,
}: {
  data: ImunisasiRowData;
  onClose: () => void;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const given = !!data.givenAt;

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
            {data.vaccineName}
          </div>
          <span className="w-6" />
        </div>

        <form action={markImmunizationAction} className="space-y-4 p-4">
          <FormCloser onClose={onClose} />
          <input type="hidden" name="vaccine_key" value={data.vaccineKey} />
          <input type="hidden" name="return_to" value="/imunisasi" />

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-600">
              Tanggal pemberian
            </span>
            <input
              type="date"
              name="given_at"
              required
              defaultValue={data.givenAt ?? todayDate()}
              max={todayDate()}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-600">
              Rumah sakit / fasilitas (opsional)
            </span>
            <input
              type="text"
              name="facility"
              maxLength={120}
              defaultValue={data.facility ?? ""}
              placeholder="RS Pondok Indah / Posyandu Mawar"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-600">
              Catatan dokter (opsional)
            </span>
            <textarea
              name="notes"
              maxLength={500}
              rows={2}
              defaultValue={data.notes ?? ""}
              placeholder="Misal: dr. Sarah, ada reaksi demam ringan 1 hari"
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-rose-400"
            />
          </label>

          <SubmitButton
            pendingText={given ? "Mengupdate…" : "Menyimpan…"}
            className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 active:bg-rose-700"
          >
            {given ? "Update" : "Simpan"}
          </SubmitButton>
        </form>

        {given ? (
          <form
            action={unmarkImmunizationAction}
            className="border-t border-gray-100 px-4 pb-4 pt-3"
          >
            <FormCloser onClose={onClose} />
            <input type="hidden" name="vaccine_key" value={data.vaccineKey} />
            <input type="hidden" name="return_to" value="/imunisasi" />
            <SubmitButton
              pendingText="Menghapus…"
              className="w-full rounded-xl border border-red-200 bg-white py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Hapus catatan
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </div>
  );
}
