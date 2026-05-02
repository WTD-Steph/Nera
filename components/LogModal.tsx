"use client";

import { useEffect, useState, useTransition } from "react";
import { createLogAction } from "@/app/actions/logs";
import {
  addMedicationAction,
  type Medication,
  type MedUnit,
} from "@/app/actions/medications";
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
  med: "Obat / Suplemen",
};

const POOP_COLORS = ["kuning", "hijau", "coklat", "hitam", "merah"];
const POOP_CONSISTENCY = ["lembek", "encer", "padat", "berbiji"];

function nowDatetimeLocal(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function asiBatchLabel(b: { startedAtIso: string; remainingMl: number }): string {
  const d = new Date(b.startedAtIso);
  const time = d.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const date = d.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
  });
  return `${date} · ${time} — ${b.remainingMl} ml tersisa`;
}

function addMinutesLocal(localStr: string, minutes: number): string {
  // localStr is "YYYY-MM-DDTHH:mm" interpreted in local TZ. Adding by ms
  // and re-deriving local string keeps DST correct.
  const ms = new Date(localStr).getTime();
  if (!Number.isFinite(ms)) return localStr;
  const next = new Date(ms + minutes * 60000);
  const off = next.getTimezoneOffset();
  return new Date(next.getTime() - off * 60000).toISOString().slice(0, 16);
}

export type AsiBatchOption = {
  id: string;
  startedAtIso: string;
  remainingMl: number;
};

export function LogModalTrigger({
  subtype,
  className,
  children,
  returnTo = "/",
  medications,
  asiBatches,
}: {
  subtype: LogSubtype;
  className?: string;
  children: React.ReactNode;
  returnTo?: string;
  medications?: Medication[];
  asiBatches?: AsiBatchOption[];
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
          medications={medications ?? []}
          asiBatches={asiBatches ?? []}
        />
      ) : null}
    </>
  );
}

function LogModal({
  subtype,
  returnTo,
  onClose,
  medications,
  asiBatches,
}: {
  subtype: LogSubtype;
  returnTo: string;
  onClose: () => void;
  medications: Medication[];
  asiBatches: AsiBatchOption[];
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
  // Bottle content (only when feedingMode='sufor'): formula vs expressed ASI
  const [bottleContent, setBottleContent] = useState<"sufor" | "asi">("sufor");
  // ASI batch override: "" = auto FIFO (oldest first); else specific batch id
  const [asiBatchId, setAsiBatchId] = useState<string>("");

  // Pumping per-side timestamps. Defaults: Kiri now → now+15, Kanan
  // sequentially after (now+15 → now+30). When user edits Kiri's
  // selesai, Kanan's mulai cascades to match (only as long as Kanan
  // hasn't been manually touched).
  const initialNow = nowDatetimeLocal();
  const [pumpStartL, setPumpStartL] = useState<string>(initialNow);
  const [pumpEndL, setPumpEndL] = useState<string>(
    addMinutesLocal(initialNow, 15),
  );
  const [pumpStartR, setPumpStartR] = useState<string>(
    addMinutesLocal(initialNow, 15),
  );
  const [pumpEndR, setPumpEndR] = useState<string>(
    addMinutesLocal(initialNow, 30),
  );
  const [pumpRTouched, setPumpRTouched] = useState(false);
  const updatePumpEndL = (v: string) => {
    setPumpEndL(v);
    if (!pumpRTouched) {
      setPumpStartR(v);
      setPumpEndR(addMinutesLocal(v, 15));
    }
  };
  const updatePumpStartL = (v: string) => {
    setPumpStartL(v);
    // Bump endL by 15 min relative to new start, keeping cascade
    const nextEndL = addMinutesLocal(v, 15);
    setPumpEndL(nextEndL);
    if (!pumpRTouched) {
      setPumpStartR(nextEndL);
      setPumpEndR(addMinutesLocal(nextEndL, 15));
    }
  };
  const markPumpRTouched = () => setPumpRTouched(true);

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

        <form
          action={createLogAction}
          onSubmit={() => setTimeout(onClose, 0)}
          className="space-y-4 p-4"
        >
          <FormCloser onClose={onClose} />
          <input type="hidden" name="subtype" value={subtype} />
          <input type="hidden" name="return_to" value={returnTo} />
          {subtype === "feeding" ? (
            <>
              <input type="hidden" name="feeding_mode" value={feedingMode} />
              {feedingMode === "sufor" ? (
                <input
                  type="hidden"
                  name="bottle_content"
                  value={bottleContent}
                />
              ) : null}
            </>
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
                <>
                  <Field label="Isi botol">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setBottleContent("asi")}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                          bottleContent === "asi"
                            ? "border-rose-400 bg-rose-50 text-rose-700"
                            : "border-gray-200 bg-white text-gray-700"
                        }`}
                      >
                        🤱 ASI perah
                      </button>
                      <button
                        type="button"
                        onClick={() => setBottleContent("sufor")}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                          bottleContent === "sufor"
                            ? "border-rose-400 bg-rose-50 text-rose-700"
                            : "border-gray-200 bg-white text-gray-700"
                        }`}
                      >
                        🥛 Sufor
                      </button>
                    </div>
                  </Field>
                  {bottleContent === "asi" && asiBatches.length > 0 ? (
                    <Field label="Batch ASI">
                      <input
                        type="hidden"
                        name="asi_batch_id"
                        value={asiBatchId}
                      />
                      <select
                        value={asiBatchId}
                        onChange={(e) => setAsiBatchId(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-rose-400"
                      >
                        <option value="">
                          Auto · FIFO (oldest first)
                        </option>
                        {asiBatches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {asiBatchLabel(b)}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-gray-400">
                        Auto akan deduct dari batch terlama dulu. Pilih batch
                        spesifik kalau mau ambil dari botol tertentu.
                      </p>
                    </Field>
                  ) : null}
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
                </>
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
            <>
              <p className="text-[11px] text-gray-500">
                Isi kedua sisi atau salah satu. Jumlah = 0 → sisi tersebut
                dianggap tidak pumping.
              </p>
              <div className="rounded-2xl border border-gray-100 bg-gray-50/40 p-3">
                <div className="mb-2 text-xs font-semibold text-gray-700">
                  🤱 Kiri
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Mulai">
                    <input
                      type="datetime-local"
                      name="start_l_at"
                      value={pumpStartL}
                      onChange={(e) => updatePumpStartL(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
                    />
                  </Field>
                  <Field label="Selesai">
                    <input
                      type="datetime-local"
                      name="end_l_at"
                      value={pumpEndL}
                      onChange={(e) => updatePumpEndL(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
                    />
                  </Field>
                </div>
                <Field label="Jumlah (ml)">
                  <input
                    type="number"
                    name="amount_l_ml"
                    step="1"
                    min="0"
                    max="500"
                    inputMode="numeric"
                    placeholder="0"
                    defaultValue={0}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
                  />
                </Field>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50/40 p-3">
                <div className="mb-2 text-xs font-semibold text-gray-700">
                  🤱 Kanan
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Mulai">
                    <input
                      type="datetime-local"
                      name="start_r_at"
                      value={pumpStartR}
                      onChange={(e) => {
                        markPumpRTouched();
                        setPumpStartR(e.target.value);
                        setPumpEndR(addMinutesLocal(e.target.value, 15));
                      }}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
                    />
                  </Field>
                  <Field label="Selesai">
                    <input
                      type="datetime-local"
                      name="end_r_at"
                      value={pumpEndR}
                      onChange={(e) => {
                        markPumpRTouched();
                        setPumpEndR(e.target.value);
                      }}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
                    />
                  </Field>
                </div>
                <Field label="Jumlah (ml)">
                  <input
                    type="number"
                    name="amount_r_ml"
                    step="1"
                    min="0"
                    max="500"
                    inputMode="numeric"
                    placeholder="0"
                    defaultValue={0}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
                  />
                </Field>
              </div>
            </>
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
            <>
              <Field label="Bangun (kosongkan jika masih tidur)">
                <input
                  type="datetime-local"
                  name="end_timestamp"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
                />
              </Field>
              <Field label="Kualitas tidur (opsional)">
                <select
                  name="sleep_quality"
                  defaultValue=""
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-rose-400"
                >
                  <option value="">—</option>
                  <option value="nyenyak">😴 Nyenyak</option>
                  <option value="gelisah">😣 Gelisah</option>
                  <option value="sering_bangun">😢 Sering bangun</option>
                </select>
              </Field>
            </>
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
            <MedFields initialMeds={medications} />
          ) : null}

          <Field label="Catatan (opsional)">
            <textarea
              name="notes"
              maxLength={500}
              rows={2}
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-rose-400"
            />
          </Field>

          <div className="sticky bottom-0 -mx-4 -mb-4 mt-2 border-t border-gray-100 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80">
            <SubmitButton className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 active:bg-rose-700">
              Simpan
            </SubmitButton>
          </div>
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

const ADD_NEW = "__add_new__";
const UNITS: { value: MedUnit; label: string }[] = [
  { value: "ml", label: "ml" },
  { value: "drop", label: "drop" },
  { value: "gr", label: "gr" },
  { value: "tab", label: "tablet" },
  { value: "sachet", label: "sachet" },
];

function MedFields({ initialMeds }: { initialMeds: Medication[] }) {
  const [meds, setMeds] = useState<Medication[]>(initialMeds);
  const [selectedId, setSelectedId] = useState<string>(
    initialMeds[0]?.id ?? "",
  );
  const [doseValue, setDoseValue] = useState<string>(
    initialMeds[0]?.default_dose ?? "",
  );
  const [unit, setUnit] = useState<MedUnit>(initialMeds[0]?.unit ?? "ml");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDose, setNewDose] = useState("");
  const [newUnit, setNewUnit] = useState<MedUnit>("ml");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selected = meds.find((m) => m.id === selectedId);
  const medName = selected?.name ?? "";
  const doseString =
    doseValue.trim() === "" ? "" : `${doseValue.trim()} ${unit}`;

  function handlePickMed(id: string) {
    if (id === ADD_NEW) {
      setAdding(true);
      return;
    }
    setSelectedId(id);
    const m = meds.find((x) => x.id === id);
    if (m) {
      setDoseValue(m.default_dose ?? "");
      setUnit(m.unit);
    }
  }

  function handleAddNew() {
    setError(null);
    startTransition(async () => {
      const res = await addMedicationAction(
        newName,
        newDose === "" ? null : newDose,
        newUnit,
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const next = [...meds, res.medication];
      setMeds(next);
      setSelectedId(res.medication.id);
      setDoseValue(res.medication.default_dose ?? "");
      setUnit(res.medication.unit);
      setAdding(false);
      setNewName("");
      setNewDose("");
      setNewUnit("ml");
    });
  }

  return (
    <>
      {/* Hidden inputs that the form action reads */}
      <input type="hidden" name="med_name" value={medName} />
      <input type="hidden" name="med_dose" value={doseString} />

      <Field label="Nama obat / suplemen">
        <select
          value={selectedId}
          onChange={(e) => handlePickMed(e.target.value)}
          required
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-rose-400"
        >
          {meds.length === 0 ? (
            <option value="" disabled>
              Belum ada — tambah dulu di bawah
            </option>
          ) : (
            meds.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.default_dose ? ` · ${m.default_dose} ${m.unit}` : ""}
              </option>
            ))
          )}
          <option value={ADD_NEW}>+ Tambah opsi baru…</option>
        </select>
      </Field>

      {!adding && meds.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dosis">
            <input
              type="text"
              value={doseValue}
              onChange={(e) => setDoseValue(e.target.value)}
              maxLength={20}
              inputMode="decimal"
              placeholder="1"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
            />
          </Field>
          <Field label="Satuan">
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as MedUnit)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-rose-400"
            >
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}

      {adding ? (
        <div className="space-y-3 rounded-2xl border border-rose-100 bg-rose-50/40 p-3">
          <div className="text-xs font-semibold text-rose-700">
            Tambah opsi obat / suplemen
          </div>
          <Field label="Nama">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={100}
              placeholder="Paracetamol"
              autoFocus
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dosis default">
              <input
                type="text"
                value={newDose}
                onChange={(e) => setNewDose(e.target.value)}
                maxLength={20}
                inputMode="decimal"
                placeholder="0.6"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
              />
            </Field>
            <Field label="Satuan">
              <select
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value as MedUnit)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-rose-400"
              >
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {error ? (
            <div className="text-xs text-red-600">{error}</div>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAddNew}
              disabled={pending || newName.trim() === ""}
              className="flex-1 rounded-xl bg-rose-500 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-600 active:bg-rose-700 disabled:opacity-50"
            >
              {pending ? "Menyimpan…" : "Simpan opsi"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="flex-1 rounded-xl border border-gray-200 bg-white py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Batal
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
