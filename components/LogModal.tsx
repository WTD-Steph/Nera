"use client";

import { useEffect, useState } from "react";
import { createLogAction } from "@/app/actions/logs";

export type LogSubtype =
  | "sufor"
  | "dbf"
  | "pumping"
  | "pipis"
  | "poop"
  | "sleep"
  | "bath"
  | "temp"
  | "med";

const SUBTYPE_LABEL: Record<LogSubtype, string> = {
  sufor: "Sufor",
  dbf: "DBF",
  pumping: "Pumping",
  pipis: "Pipis",
  poop: "Poop",
  sleep: "Tidur",
  bath: "Mandi",
  temp: "Suhu",
  med: "Obat",
};

const POOP_COLORS = ["kuning", "hijau", "coklat", "hitam", "merah"];
const POOP_CONSISTENCY = ["lembek", "encer", "padat", "berbiji"];

function nowDatetimeLocal(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function LogModalTrigger({
  subtype,
  className,
  children,
  returnTo = "/",
}: {
  subtype: LogSubtype;
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
        <LogModal
          subtype={subtype}
          returnTo={returnTo}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function LogModal({
  subtype,
  returnTo,
  onClose,
}: {
  subtype: LogSubtype;
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

  const [poopColor, setPoopColor] = useState<string>("");
  const [poopCons, setPoopCons] = useState<string>("");

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
            Catat {SUBTYPE_LABEL[subtype]}
          </div>
          <span className="w-6" />
        </div>

        <form action={createLogAction} className="space-y-4 p-4">
          <input type="hidden" name="subtype" value={subtype} />
          <input type="hidden" name="return_to" value={returnTo} />
          <input type="hidden" name="poop_color" value={poopColor} />
          <input type="hidden" name="poop_consistency" value={poopCons} />

          <Field label="Waktu">
            <input
              type="datetime-local"
              name="timestamp"
              defaultValue={nowDatetimeLocal()}
              required
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
            />
          </Field>

          {subtype === "sufor" ? (
            <Field label="Jumlah (ml)">
              <input
                type="number"
                name="amount_ml"
                step="1"
                min="1"
                max="500"
                required
                inputMode="numeric"
                placeholder="60"
                autoFocus
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
              />
            </Field>
          ) : null}

          {subtype === "dbf" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kiri (menit)">
                <input
                  type="number"
                  name="duration_l_min"
                  step="1"
                  min="0"
                  max="180"
                  inputMode="numeric"
                  placeholder="0"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
                />
              </Field>
              <Field label="Kanan (menit)">
                <input
                  type="number"
                  name="duration_r_min"
                  step="1"
                  min="0"
                  max="180"
                  inputMode="numeric"
                  placeholder="0"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
                />
              </Field>
            </div>
          ) : null}

          {subtype === "pumping" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kiri (ml)">
                <input
                  type="number"
                  name="amount_l_ml"
                  step="1"
                  min="0"
                  max="500"
                  inputMode="numeric"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
                />
              </Field>
              <Field label="Kanan (ml)">
                <input
                  type="number"
                  name="amount_r_ml"
                  step="1"
                  min="0"
                  max="500"
                  inputMode="numeric"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
                />
              </Field>
            </div>
          ) : null}

          {subtype === "poop" ? (
            <>
              <Field label="Warna">
                <Chips
                  options={POOP_COLORS}
                  value={poopColor}
                  onChange={setPoopColor}
                />
              </Field>
              <Field label="Konsistensi">
                <Chips
                  options={POOP_CONSISTENCY}
                  value={poopCons}
                  onChange={setPoopCons}
                />
              </Field>
            </>
          ) : null}

          {subtype === "sleep" ? (
            <Field label="Bangun (kosongkan jika masih tidur)">
              <input
                type="datetime-local"
                name="end_timestamp"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
              />
            </Field>
          ) : null}

          {subtype === "temp" ? (
            <Field label="Suhu (°C)">
              <input
                type="number"
                name="temp_celsius"
                step="0.1"
                min="30"
                max="45"
                required
                inputMode="decimal"
                placeholder="36.7"
                autoFocus
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
              />
            </Field>
          ) : null}

          {subtype === "med" ? (
            <>
              <Field label="Nama obat">
                <input
                  type="text"
                  name="med_name"
                  required
                  maxLength={100}
                  autoFocus
                  placeholder="Paracetamol drop"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
                />
              </Field>
              <Field label="Dosis (opsional)">
                <input
                  type="text"
                  name="med_dose"
                  maxLength={50}
                  placeholder="0.6 ml"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
                />
              </Field>
            </>
          ) : null}

          <Field label="Catatan (opsional)">
            <textarea
              name="notes"
              maxLength={500}
              rows={2}
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-rose-400"
            />
          </Field>

          <button
            type="submit"
            className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 active:bg-rose-700"
          >
            Simpan
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-gray-600">
        {label}
      </span>
      {children}
    </label>
  );
}

function Chips({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(value === opt ? "" : opt)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            value === opt
              ? "bg-rose-500 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
