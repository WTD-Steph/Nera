"use client";

import { useState } from "react";

type Mode = "auto" | "multiplier" | "fixed";

export function DbfEstimateFieldset({
  fixedDefault,
  multiplierDefault,
}: {
  fixedDefault: number | null;
  multiplierDefault: number | null;
}) {
  const initialMode: Mode =
    multiplierDefault != null
      ? "multiplier"
      : fixedDefault != null
        ? "fixed"
        : "auto";
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/40 p-3">
      <div className="text-xs font-semibold text-gray-700">
        Estimasi DBF (opsional)
      </div>
      <p className="mt-1 text-[11px] leading-snug text-gray-500">
        Cara hitung ml dari menit DBF. Default: auto pakai pumping
        terakhir yang ≥5 ml & ≥10 menit, fallback ke 4 ml/menit (literatur
        laktasi 0–6mo).
      </p>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <ModeChoice
          value="auto"
          mode={mode}
          onPick={setMode}
          label="Auto"
          hint="dari pumping"
        />
        <ModeChoice
          value="multiplier"
          mode={mode}
          onPick={setMode}
          label="Multiplier"
          hint="× pumping"
        />
        <ModeChoice
          value="fixed"
          mode={mode}
          onPick={setMode}
          label="Fixed"
          hint="ml/menit"
        />
      </div>

      <input type="hidden" name="dbf_estimate_mode" value={mode} />

      {mode === "multiplier" ? (
        <label className="mt-3 block">
          <span className="text-xs text-gray-600">
            Multiplier dari pumping rate
          </span>
          <input
            type="number"
            name="dbf_pumping_multiplier"
            step="0.05"
            min="0.1"
            max="5"
            inputMode="decimal"
            placeholder="1.0 = sama dgn pumping; 1.2 = baby 20% lebih efisien"
            defaultValue={multiplierDefault ?? ""}
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-rose-400"
          />
          <span className="mt-1 block text-[11px] leading-snug text-gray-400">
            Range 0.1–5.0. Misal 0.8× kalau bayi nyusu lebih lambat dari
            pumping; 1.2× kalau lebih efisien dari pumping.
          </span>
        </label>
      ) : null}

      {mode === "fixed" ? (
        <label className="mt-3 block">
          <span className="text-xs text-gray-600">ml per menit</span>
          <input
            type="number"
            name="dbf_ml_per_min"
            step="0.1"
            min="0.5"
            max="30"
            inputMode="decimal"
            placeholder="Misal 4"
            defaultValue={fixedDefault ?? ""}
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-rose-400"
          />
          <span className="mt-1 block text-[11px] leading-snug text-gray-400">
            Range 0.5–30 ml/menit. Pakai kalau dokter kasih estimasi
            spesifik atau pumping tidak representatif.
          </span>
        </label>
      ) : null}
    </div>
  );
}

function ModeChoice({
  value,
  mode,
  onPick,
  label,
  hint,
}: {
  value: Mode;
  mode: Mode;
  onPick: (m: Mode) => void;
  label: string;
  hint: string;
}) {
  const active = mode === value;
  return (
    <button
      type="button"
      onClick={() => onPick(value)}
      className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2 text-xs font-medium transition-colors ${
        active
          ? "border-rose-400 bg-rose-50 text-rose-700"
          : "border-gray-200 bg-white text-gray-600"
      }`}
    >
      <span>{label}</span>
      <span className="text-[10px] font-normal text-gray-400">{hint}</span>
    </button>
  );
}
