"use client";

import { useEffect, useState } from "react";
import { createLogAction } from "@/app/actions/logs";
import { SubmitButton } from "@/components/SubmitButton";
import { FormCloser } from "@/components/FormCloser";

export type LogSubtype =
  | "feeding"
  | "pumping"
  | "diaper"
  | "sleep"
  | "bath"
  | "temp"
  | "med";

const SUBTYPE_LABEL: Record<LogSubtype, string> = {
  feeding: "Feeding",
  pumping: "Pumping",
  diaper: "Ganti Diaper",
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

  // Feeding sub-mode: 'sufor' (botol) atau 'dbf' (langsung)
  const [feedingMode, setFeedingMode] = useState<"sufor" | "dbf">("sufor");

  // Diaper toggles
  const [hasPee, setHasPee] = useState(false);
  const [hasPoop, setHasPoop] = useState(false);

  // Poop sub-fields (chips)
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
          <FormCloser onClose={onClose} />
          <input type="hidden" name="subtype" value={subtype} />
          <input type="hidden" name="return_to" value={returnTo} />
          {subtype === "feeding" ? (
            <input type="hidden" name="feeding_mode" value={feedingMode} />
          ) : null}
          {subtype === "diaper" ? (
            <>
              <input type="hidden" name="has_pee" value={hasPee ? "1" : "0"} />
              <input type="hidden" name="has_poop" value={hasPoop ? "1" : "0"} />
              <input type="hidden" name="poop_color" value={poopColor} />
              <input
                type="hidden"
                name="poop_consistency"
                value={poopCons}
              />
            </>
          ) : null}

          <Field label="Waktu">
            <input
              type="datetime-local"
              name="timestamp"
              defaultValue={nowDatetimeLocal()}
              required
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
            />
          </Field>

          {subtype === "feeding" ? (
            <>
              <Field label="Jenis">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFeedingMode("sufor")}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                      feedingMode === "sufor"
                        ? "border-rose-400 bg-rose-50 text-rose-700"
                        : "border-gray-200 bg-white text-gray-700"
                    }`}
                  >
                    🍼 Susu (botol)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedingMode("dbf")}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                      feedingMode === "dbf"
                        ? "border-rose-400 bg-rose-50 text-rose-700"
                        : "border-gray-200 bg-white text-gray-700"
                    }`}
                  >
                    🤱 DBF (langsung)
                  </button>
                </div>
              </Field>

              {feedingMode === "sufor" ? (
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
              ) : (
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
              )}
            </>
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

          {subtype === "diaper" ? (
            <>
              <Field label="Apa yang ada di diaper?">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setHasPee(!hasPee)}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                      hasPee
                        ? "border-rose-400 bg-rose-50 text-rose-700"
                        : "border-gray-200 bg-white text-gray-700"
                    }`}
                  >
                    💛 Pipis {hasPee ? "✓" : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHasPoop(!hasPoop)}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                      hasPoop
                        ? "border-rose-400 bg-rose-50 text-rose-700"
                        : "border-gray-200 bg-white text-gray-700"
                    }`}
                  >
                    💩 BAB {hasPoop ? "✓" : ""}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-gray-400">
                  Pilih satu atau dua-duanya.
                </p>
              </Field>

              {hasPoop ? (
                <>
                  <Field label="Warna BAB">
                    <Chips
                      options={POOP_COLORS}
                      value={poopColor}
                      onChange={setPoopColor}
                    />
                  </Field>
                  <Field label="Konsistensi BAB">
                    <Chips
                      options={POOP_CONSISTENCY}
                      value={poopCons}
                      onChange={setPoopCons}
                    />
                  </Field>
                </>
              ) : null}
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

          <SubmitButton className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 active:bg-rose-700">
            Simpan
          </SubmitButton>
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
