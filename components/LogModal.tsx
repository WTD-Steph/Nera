"use client";

import { useEffect, useState, useTransition } from "react";
import { createLogAction, updateLogAction } from "@/app/actions/logs";
import {
  addMedicationAction,
  type Medication,
  type MedUnit,
} from "@/app/actions/medications";
import { SubmitButton } from "@/components/SubmitButton";
import { FormCloser } from "@/components/FormCloser";
import { IluInfoButton } from "@/components/IluMassageDiagram";

export type LogSubtype =
  | "feeding"
  | "pumping"
  | "diaper"
  | "sleep"
  | "bath"
  | "temp"
  | "med"
  | "hiccup"
  | "tummy";

export type EditLog = {
  id: string;
  subtype: string;
  timestamp: string;
  end_timestamp: string | null;
  amount_ml: number | null;
  amount_l_ml: number | null;
  amount_r_ml: number | null;
  duration_l_min: number | null;
  duration_r_min: number | null;
  has_pee: boolean | null;
  has_poop: boolean | null;
  poop_color: string | null;
  poop_consistency: string | null;
  temp_celsius: number | null;
  med_name: string | null;
  med_dose: string | null;
  bottle_content: "sufor" | "asi" | "mix" | null;
  amount_asi_ml: number | null;
  amount_sufor_ml: number | null;
  amount_spilled_ml: number | null;
  spilled_attribution: "asi" | "sufor" | "proporsional" | null;
  start_l_at: string | null;
  end_l_at: string | null;
  start_r_at: string | null;
  end_r_at: string | null;
  sleep_quality: string | null;
  effectiveness: string | null;
  dbf_rate_override: number | null;
  bath_pijat_ilu: boolean | null;
  bath_clean_tali_pusat: boolean | null;
  notes: string | null;
};

const SUBTYPE_LABEL: Record<LogSubtype, string> = {
  feeding: "Feeding",
  pumping: "Pumping",
  diaper: "Ganti Diaper",
  sleep: "Tidur",
  bath: "Mandi",
  temp: "Suhu",
  med: "Obat / Suplemen",
  hiccup: "Cegukan",
  tummy: "Tummy time",
};

const POOP_COLORS = ["kuning", "hijau", "coklat", "hitam", "merah"];
const POOP_CONSISTENCY = ["lembek", "encer", "padat", "berbiji"];

function nowDatetimeLocal(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
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

export function EditLogModalTrigger({
  log,
  className,
  children,
  returnTo = "/",
  medications,
}: {
  log: EditLog;
  className?: string;
  children: React.ReactNode;
  returnTo?: string;
  medications?: Medication[];
}) {
  const [open, setOpen] = useState(false);
  if (!isEditableSubtype(log.subtype)) return null;
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
          subtype={log.subtype as LogSubtype}
          returnTo={returnTo}
          onClose={() => setOpen(false)}
          medications={medications ?? []}
          asiBatches={[]}
          editLog={log}
        />
      ) : null}
    </>
  );
}

function isEditableSubtype(s: string): s is LogSubtype {
  return (
    s === "feeding" ||
    s === "pumping" ||
    s === "diaper" ||
    s === "sleep" ||
    s === "bath" ||
    s === "temp" ||
    s === "med" ||
    s === "hiccup" ||
    s === "tummy"
  );
}

function LogModal({
  subtype,
  returnTo,
  onClose,
  medications,
  asiBatches,
  editLog,
}: {
  subtype: LogSubtype;
  returnTo: string;
  onClose: () => void;
  medications: Medication[];
  asiBatches: AsiBatchOption[];
  editLog?: EditLog;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const isEdit = !!editLog;

  // Feeding sub-mode: 'sufor' (botol) atau 'dbf' (langsung)
  const [feedingMode, setFeedingMode] = useState<"sufor" | "dbf">(() => {
    if (editLog?.subtype === "feeding") {
      return editLog.amount_ml != null ? "sufor" : "dbf";
    }
    return "sufor";
  });
  // Bottle content: 'asi' | 'sufor' | 'mix' (combined ASIP+sufor in
  // satu botol). Mix mode menampilkan dua input ml — total = asi + sufor.
  const [bottleContent, setBottleContent] = useState<"sufor" | "asi" | "mix">(
    editLog?.bottle_content === "asi"
      ? "asi"
      : editLog?.bottle_content === "mix"
        ? "mix"
        : "sufor",
  );
  // ASI batch override: "" = auto FIFO (oldest first); else specific batch id
  const [asiBatchId, setAsiBatchId] = useState<string>("");
  // Bottle ml — controlled so picking a batch can auto-fill (still user-editable)
  const [bottleMl, setBottleMl] = useState<string>(
    String(editLog?.amount_ml ?? 60),
  );
  // Mix mode: separate ml for ASIP + Sufor. Total = sum.
  const [mixAsiMl, setMixAsiMl] = useState<string>(
    String(editLog?.amount_asi_ml ?? 30),
  );
  const [mixSuforMl, setMixSuforMl] = useState<string>(
    String(editLog?.amount_sufor_ml ?? 30),
  );
  const mixTotalMl = (Number(mixAsiMl) || 0) + (Number(mixSuforMl) || 0);
  // Spillage — ml tumpah / sisa di cup yang ngga terminum. Stock ASI
  // tetap deduct ASI portion of spilled.
  const [spilledMl, setSpilledMl] = useState<string>(
    String(editLog?.amount_spilled_ml ?? 0),
  );
  const [spilledAttribution, setSpilledAttribution] = useState<
    "asi" | "sufor" | "proporsional"
  >(
    editLog?.spilled_attribution === "asi"
      ? "asi"
      : editLog?.spilled_attribution === "sufor"
        ? "sufor"
        : "proporsional",
  );

  // Pumping per-side timestamps. In create mode: Kiri now → now+15,
  // Kanan sequentially after. In edit mode: pre-fill from existing row.
  const initialNow = nowDatetimeLocal();
  const editStartL = isoToDatetimeLocal(editLog?.start_l_at ?? null);
  const editEndL = isoToDatetimeLocal(editLog?.end_l_at ?? null);
  const editStartR = isoToDatetimeLocal(editLog?.start_r_at ?? null);
  const editEndR = isoToDatetimeLocal(editLog?.end_r_at ?? null);
  const [pumpStartL, setPumpStartL] = useState<string>(
    editStartL || initialNow,
  );
  const [pumpEndL, setPumpEndL] = useState<string>(
    editEndL || addMinutesLocal(initialNow, 15),
  );
  const [pumpStartR, setPumpStartR] = useState<string>(
    editStartR || addMinutesLocal(initialNow, 15),
  );
  const [pumpEndR, setPumpEndR] = useState<string>(
    editEndR || addMinutesLocal(initialNow, 30),
  );
  // In edit mode, treat Kanan as already touched so cascade doesn't
  // overwrite the existing per-side times when Kiri changes.
  const [pumpRTouched, setPumpRTouched] = useState(isEdit);
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

  // DBF effectiveness — same enum as endOngoingDbfAction
  const [dbfEffectiveness, setDbfEffectiveness] = useState<
    "efektif" | "sedang" | "kurang_efektif" | ""
  >(
    editLog?.effectiveness === "efektif" ||
      editLog?.effectiveness === "sedang" ||
      editLog?.effectiveness === "kurang_efektif"
      ? editLog.effectiveness
      : "",
  );

  // Diaper toggles
  const [hasPee, setHasPee] = useState(!!editLog?.has_pee);
  const [hasPoop, setHasPoop] = useState(!!editLog?.has_poop);

  // Poop sub-fields (chips)
  const [poopColor, setPoopColor] = useState<string>(
    editLog?.poop_color ?? "",
  );
  const [poopCons, setPoopCons] = useState<string>(
    editLog?.poop_consistency ?? "",
  );

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
            {isEdit ? "Edit" : "Catat"} {SUBTYPE_LABEL[subtype]}
          </div>
          <span className="w-6" />
        </div>

        <form
          action={isEdit ? updateLogAction : createLogAction}
          onSubmit={() => setTimeout(onClose, 0)}
          className="space-y-4 p-4"
        >
          <FormCloser onClose={onClose} />
          <input type="hidden" name="subtype" value={subtype} />
          <input type="hidden" name="return_to" value={returnTo} />
          {isEdit && editLog ? (
            <input type="hidden" name="id" value={editLog.id} />
          ) : null}
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

          {subtype === "pumping" ? (
            <Field label="Waktu Mulai">
              <input
                type="datetime-local"
                name="timestamp"
                value={pumpStartL}
                onChange={(e) => updatePumpStartL(e.target.value)}
                required
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Mengubah waktu di sini auto-shift Mulai/Selesai per sisi di
                bawah.
              </p>
            </Field>
          ) : (
            <Field
              label={
                subtype === "sleep" ||
                subtype === "hiccup" ||
                subtype === "tummy"
                  ? "Waktu Mulai"
                  : "Waktu"
              }
            >
              <input
                type="datetime-local"
                name="timestamp"
                defaultValue={
                  isoToDatetimeLocal(editLog?.timestamp ?? null) ||
                  nowDatetimeLocal()
                }
                required
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
              />
            </Field>
          )}

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
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setBottleContent("asi")}
                        className={`rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors ${
                          bottleContent === "asi"
                            ? "border-rose-400 bg-rose-50 text-rose-700"
                            : "border-gray-200 bg-white text-gray-700"
                        }`}
                      >
                        🤱 ASI
                      </button>
                      <button
                        type="button"
                        onClick={() => setBottleContent("sufor")}
                        className={`rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors ${
                          bottleContent === "sufor"
                            ? "border-rose-400 bg-rose-50 text-rose-700"
                            : "border-gray-200 bg-white text-gray-700"
                        }`}
                      >
                        🥛 Sufor
                      </button>
                      <button
                        type="button"
                        onClick={() => setBottleContent("mix")}
                        className={`rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors ${
                          bottleContent === "mix"
                            ? "border-rose-400 bg-rose-50 text-rose-700"
                            : "border-gray-200 bg-white text-gray-700"
                        }`}
                      >
                        🤱+🥛 Mix
                      </button>
                    </div>
                  </Field>
                  {bottleContent === "asi" && !isEdit && asiBatches.length > 0 ? (
                    <Field label="Batch ASI">
                      <input
                        type="hidden"
                        name="asi_batch_id"
                        value={asiBatchId}
                      />
                      <select
                        value={asiBatchId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setAsiBatchId(id);
                          // Auto-fill ml dengan remaining batch terpilih.
                          // User tetap bisa edit setelahnya. Skip kalau
                          // pilih "Auto" (id=""), supaya nilai sebelumnya
                          // tidak ke-reset.
                          if (id) {
                            const batch = asiBatches.find((b) => b.id === id);
                            if (batch) setBottleMl(String(batch.remainingMl));
                          }
                        }}
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
                        spesifik untuk auto-fill ml dari sisa batch (masih
                        bisa di-edit).
                      </p>
                    </Field>
                  ) : null}
                  {bottleContent === "mix" ? (
                    <>
                      {!isEdit && asiBatches.length > 0 ? (
                        <Field label="Batch ASI (untuk porsi ASIP)">
                          <input
                            type="hidden"
                            name="asi_batch_id"
                            value={asiBatchId}
                          />
                          <select
                            value={asiBatchId}
                            onChange={(e) => {
                              const id = e.target.value;
                              setAsiBatchId(id);
                              if (id) {
                                const batch = asiBatches.find(
                                  (b) => b.id === id,
                                );
                                if (batch)
                                  setMixAsiMl(String(batch.remainingMl));
                              }
                            }}
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-rose-400"
                          >
                            <option value="">Auto · FIFO (oldest first)</option>
                            {asiBatches.map((b) => (
                              <option key={b.id} value={b.id}>
                                {asiBatchLabel(b)}
                              </option>
                            ))}
                          </select>
                        </Field>
                      ) : null}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="mb-1.5 block text-xs font-semibold text-rose-700">
                            🤱 ASIP (ml)
                          </span>
                          <MlInput
                            name="amount_asi_ml"
                            initial={editLog?.amount_asi_ml ?? 30}
                            controlledValue={mixAsiMl}
                            onValueChange={setMixAsiMl}
                          />
                        </div>
                        <div>
                          <span className="mb-1.5 block text-xs font-semibold text-amber-700">
                            🥛 Sufor (ml)
                          </span>
                          <MlInput
                            name="amount_sufor_ml"
                            initial={editLog?.amount_sufor_ml ?? 30}
                            controlledValue={mixSuforMl}
                            onValueChange={setMixSuforMl}
                          />
                        </div>
                      </div>
                      <input
                        type="hidden"
                        name="amount_ml"
                        value={mixTotalMl}
                      />
                      <div className="rounded-lg bg-gray-50 px-3 py-2 text-center text-xs text-gray-600">
                        Total botol:{" "}
                        <span className="font-bold text-gray-900">
                          {mixTotalMl} ml
                        </span>
                      </div>
                    </>
                  ) : (
                    <Field label="Jumlah diminum (ml)">
                      <MlInput
                        name="amount_ml"
                        initial={editLog?.amount_ml ?? 60}
                        controlledValue={bottleMl}
                        onValueChange={setBottleMl}
                      />
                    </Field>
                  )}
                  <SpillageField
                    spilledMl={spilledMl}
                    setSpilledMl={setSpilledMl}
                    bottleContent={bottleContent}
                    spilledAttribution={spilledAttribution}
                    setSpilledAttribution={setSpilledAttribution}
                  />
                </>
              ) : editLog ? (
                // Edit mode: per-side Mulai/Selesai for precision. Duration
                // computed on save. Use case: fix sesi yg di-stop kecepetan.
                <DbfEditPerSide editLog={editLog} />
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
              {feedingMode === "dbf" ? (
                <>
                  <input
                    type="hidden"
                    name="effectiveness"
                    value={dbfEffectiveness}
                  />
                  <Field label="Efektivitas DBF (opsional)">
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      {(
                        [
                          { value: "", label: "Skip", emoji: "—" },
                          {
                            value: "efektif",
                            label: "Efektif",
                            emoji: "😊",
                          },
                          { value: "sedang", label: "Sedang", emoji: "😐" },
                          {
                            value: "kurang_efektif",
                            label: "Kurang",
                            emoji: "😟",
                          },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value || "skip"}
                          type="button"
                          onClick={() => setDbfEffectiveness(opt.value)}
                          className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2 text-[11px] font-medium transition-colors ${
                            dbfEffectiveness === opt.value
                              ? "border-rose-400 bg-rose-50 text-rose-700"
                              : "border-gray-200 bg-white text-gray-600"
                          }`}
                        >
                          <span aria-hidden>{opt.emoji}</span>
                          <span>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-gray-400">
                      Efektif=100% / Sedang=80% / Kurang=60% multiplier untuk
                      ml estimate. Skip = default 100%.
                    </p>
                  </Field>
                  <Field label="Estimasi flow override (opsional, ml/menit)">
                    <input
                      type="number"
                      name="dbf_rate_override"
                      step="0.1"
                      min="0.1"
                      max="30"
                      inputMode="decimal"
                      placeholder="Pakai default Profile (auto/multiplier/fixed)"
                      defaultValue={editLog?.dbf_rate_override ?? ""}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
                    />
                    <p className="mt-1 text-[11px] text-gray-400">
                      Override rate ml/menit untuk SESI INI saja. Kosong =
                      pakai setting Profile (multiplier × pumping / fixed /
                      default 4).
                    </p>
                  </Field>
                </>
              ) : null}
            </>
          ) : null}

          {subtype === "pumping" ? (
            <>
              <p className="text-[11px] text-gray-500">
                Isi kedua sisi atau salah satu. Jumlah = 0 → sisi tersebut
                dianggap tidak pumping.
              </p>
              <div className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50/40 p-4">
                <div className="text-xs font-semibold text-gray-700">
                  🤱 Kiri
                </div>
                <div className="grid grid-cols-2 gap-3">
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
                  <MlInput
                    name="amount_l_ml"
                    initial={editLog?.amount_l_ml ?? 0}
                  />
                </Field>
              </div>
              <div className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50/40 p-4">
                <div className="text-xs font-semibold text-gray-700">
                  🤱 Kanan
                </div>
                <div className="grid grid-cols-2 gap-3">
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
                  <MlInput
                    name="amount_r_ml"
                    initial={editLog?.amount_r_ml ?? 0}
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
              <Field label="Waktu Bangun (kosongkan jika masih tidur)">
                <input
                  type="datetime-local"
                  name="end_timestamp"
                  defaultValue={isoToDatetimeLocal(
                    editLog?.end_timestamp ?? null,
                  )}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  Kosong = bayi masih tidur. Setelah simpan, app akan masuk
                  mode dark biar bisa monitor stopwatch dari jauh.
                </p>
              </Field>
              <Field label="Kualitas tidur (opsional)">
                <select
                  name="sleep_quality"
                  defaultValue={editLog?.sleep_quality ?? ""}
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

          {subtype === "hiccup" || subtype === "tummy" ? (
            <Field label="Waktu Selesai (kosongkan jika masih berlangsung)">
              <input
                type="datetime-local"
                name="end_timestamp"
                defaultValue={isoToDatetimeLocal(
                  editLog?.end_timestamp ?? null,
                )}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
              />
            </Field>
          ) : null}

          {subtype === "bath" ? (
            <Field label="Checklist (opsional)">
              <div className="space-y-1.5">
                <label className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white p-2.5 text-[13px] hover:border-rose-300">
                  <input
                    type="checkbox"
                    name="bath_pijat_ilu"
                    value="1"
                    defaultChecked={editLog?.bath_pijat_ilu ?? false}
                    className="mt-0.5 flex-shrink-0 h-4 w-4 accent-rose-500"
                  />
                  <span className="flex-1">
                    <span className="font-semibold">Pijat I-L-U</span>
                    <span className="ml-1 text-[11px] text-gray-500">
                      — bantu kentut & cerna
                    </span>
                  </span>
                  <IluInfoButton />
                </label>
                <label className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white p-2.5 text-[13px] hover:border-rose-300">
                  <input
                    type="checkbox"
                    name="bath_clean_tali_pusat"
                    value="1"
                    defaultChecked={editLog?.bath_clean_tali_pusat ?? false}
                    className="mt-0.5 flex-shrink-0 h-4 w-4 accent-rose-500"
                  />
                  <span>
                    <span className="font-semibold">Bersihkan tali pusat</span>
                    <span className="ml-1 text-[11px] text-gray-500">
                      — sampai puput
                    </span>
                  </span>
                </label>
              </div>
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
                autoFocus={!isEdit}
                defaultValue={editLog?.temp_celsius ?? undefined}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
              />
            </Field>
          ) : null}

          {subtype === "med" ? (
            <MedFields
              initialMeds={medications}
              editName={editLog?.med_name ?? null}
              editDose={editLog?.med_dose ?? null}
            />
          ) : null}

          <Field label="Catatan (opsional)">
            <textarea
              name="notes"
              maxLength={500}
              rows={2}
              defaultValue={editLog?.notes ?? ""}
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-rose-400"
            />
          </Field>

          <div className="sticky bottom-0 -mx-4 -mb-4 mt-2 border-t border-gray-100 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80">
            <SubmitButton className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 active:bg-rose-700">
              {isEdit ? "Update" : "Simpan"}
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

function DbfEditPerSide({ editLog }: { editLog: EditLog }) {
  // Pre-fill from start/end_X_at if available; else derive from
  // timestamp anchored with duration_X_min for legacy manual entries.
  const lStart = editLog.start_l_at;
  const lEnd = editLog.end_l_at;
  const rStart = editLog.start_r_at;
  const rEnd = editLog.end_r_at;

  const [kiriMulai, setKiriMulai] = useState(
    isoToDatetimeLocal(lStart ?? null),
  );
  const [kiriSelesai, setKiriSelesai] = useState(
    isoToDatetimeLocal(lEnd ?? null),
  );
  const [kananMulai, setKananMulai] = useState(
    isoToDatetimeLocal(rStart ?? null),
  );
  const [kananSelesai, setKananSelesai] = useState(
    isoToDatetimeLocal(rEnd ?? null),
  );

  const computeMin = (mulai: string, selesai: string): number | null => {
    if (!mulai || !selesai) return null;
    const ms = new Date(selesai).getTime() - new Date(mulai).getTime();
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return Math.round(ms / 60000);
  };
  const lMin = computeMin(kiriMulai, kiriSelesai);
  const rMin = computeMin(kananMulai, kananSelesai);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-500">
        Edit waktu Mulai + Selesai per sisi. Durasi dihitung otomatis.
        Kosongkan kedua field untuk mengabaikan sisi.
      </p>
      <div className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50/40 p-4">
        <div className="text-xs font-semibold text-gray-700">🤱 Kiri</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mulai">
            <input
              type="datetime-local"
              name="dbf_start_l_at"
              value={kiriMulai}
              onChange={(e) => setKiriMulai(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
            />
          </Field>
          <Field label="Selesai">
            <input
              type="datetime-local"
              name="dbf_end_l_at"
              value={kiriSelesai}
              onChange={(e) => setKiriSelesai(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
            />
          </Field>
        </div>
        <div className="text-[11px] text-gray-500">
          Durasi: {lMin != null ? `${lMin} menit` : "—"}
        </div>
      </div>
      <div className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50/40 p-4">
        <div className="text-xs font-semibold text-gray-700">🤱 Kanan</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mulai">
            <input
              type="datetime-local"
              name="dbf_start_r_at"
              value={kananMulai}
              onChange={(e) => setKananMulai(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
            />
          </Field>
          <Field label="Selesai">
            <input
              type="datetime-local"
              name="dbf_end_r_at"
              value={kananSelesai}
              onChange={(e) => setKananSelesai(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
            />
          </Field>
        </div>
        <div className="text-[11px] text-gray-500">
          Durasi: {rMin != null ? `${rMin} menit` : "—"}
        </div>
      </div>
    </div>
  );
}

function SpillageField({
  spilledMl,
  setSpilledMl,
  bottleContent,
  spilledAttribution,
  setSpilledAttribution,
}: {
  spilledMl: string;
  setSpilledMl: (v: string) => void;
  bottleContent: "asi" | "sufor" | "mix";
  spilledAttribution: "asi" | "sufor" | "proporsional";
  setSpilledAttribution: (a: "asi" | "sufor" | "proporsional") => void;
}) {
  const spilledNum = Number(spilledMl) || 0;
  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold text-amber-800">
          Tumpah / sisa (ml)
        </label>
        <select
          name="amount_spilled_ml"
          value={spilledMl}
          onChange={(e) => setSpilledMl(e.target.value)}
          className="appearance-none rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm font-semibold tabular-nums text-amber-900 outline-none focus:border-amber-400"
        >
          {Array.from({ length: 51 }, (_, i) => (
            <option key={i} value={i}>
              {i} ml
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-amber-700/70">
        Tumpah = stock ASI tetap berkurang, tapi intake bayi tidak.
      </p>
      {bottleContent === "mix" && spilledNum > 0 ? (
        <div className="mt-2">
          <label className="block text-[11px] font-semibold text-amber-800">
            Tumpahnya dari sisi mana?
          </label>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {(
              [
                { v: "asi", label: "🤱 ASI" },
                { v: "proporsional", label: "≈ Mix" },
                { v: "sufor", label: "🥛 Sufor" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setSpilledAttribution(opt.v)}
                className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  spilledAttribution === opt.v
                    ? "border-amber-400 bg-amber-100 text-amber-900"
                    : "border-amber-200 bg-white text-amber-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <input
            type="hidden"
            name="spilled_attribution"
            value={spilledAttribution}
          />
        </div>
      ) : null}
    </div>
  );
}

const ML_PRESETS = [30, 50, 80, 100, 120, 150];
const ML_STEP = 5;

// Native <select> 0-200 → iOS wheel picker, no keyboard. Keep ± stepper
// and chip presets sebagai shortcut quick-jump.
const ML_MAX = 200;

function MlInput({
  name,
  initial,
  controlledValue,
  onValueChange,
}: {
  name: string;
  initial: number;
  /** When provided, MlInput acts controlled — parent state is the source of truth. */
  controlledValue?: string;
  onValueChange?: (v: string) => void;
}) {
  const [internal, setInternal] = useState<string>(String(initial));
  const value = controlledValue ?? internal;
  const setValue = (v: string) => {
    if (onValueChange) onValueChange(v);
    else setInternal(v);
  };
  const numeric = Number(value) || 0;
  return (
    <div>
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          onClick={() =>
            setValue(String(Math.max(0, numeric - ML_STEP)))
          }
          className="rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-600 hover:bg-rose-50 hover:text-rose-700 active:scale-95"
          aria-label={`-${ML_STEP} ml`}
        >
          −
        </button>
        <select
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-center text-base font-semibold tabular-nums outline-none focus:border-rose-400"
        >
          {Array.from({ length: ML_MAX + 1 }, (_, i) => (
            <option key={i} value={i}>
              {i} ml
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() =>
            setValue(String(Math.min(ML_MAX, numeric + ML_STEP)))
          }
          className="rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-600 hover:bg-rose-50 hover:text-rose-700 active:scale-95"
          aria-label={`+${ML_STEP} ml`}
        >
          +
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {ML_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setValue(String(p))}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              numeric === p
                ? "bg-rose-500 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-rose-100 hover:text-rose-700"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
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

function parseDoseString(s: string | null): { value: string; unit: MedUnit } {
  if (!s) return { value: "", unit: "ml" };
  const parts = s.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? "";
  const unit: MedUnit = (UNITS.find((u) => u.value === last)?.value ?? "ml") as MedUnit;
  const valueParts = unit === last ? parts.slice(0, -1) : parts;
  return { value: valueParts.join(" "), unit };
}

function MedFields({
  initialMeds,
  editName,
  editDose,
}: {
  initialMeds: Medication[];
  editName?: string | null;
  editDose?: string | null;
}) {
  const [meds, setMeds] = useState<Medication[]>(initialMeds);
  const editMatch = editName
    ? initialMeds.find((m) => m.name === editName)
    : undefined;
  const editParsed = editDose ? parseDoseString(editDose) : null;
  const [selectedId, setSelectedId] = useState<string>(
    editMatch?.id ?? initialMeds[0]?.id ?? "",
  );
  const [doseValue, setDoseValue] = useState<string>(
    editParsed?.value ?? initialMeds[0]?.default_dose ?? "",
  );
  const [unit, setUnit] = useState<MedUnit>(
    editParsed?.unit ?? initialMeds[0]?.unit ?? "ml",
  );
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDose, setNewDose] = useState("");
  const [newUnit, setNewUnit] = useState<MedUnit>("ml");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selected = meds.find((m) => m.id === selectedId);
  const medName = selected?.name ?? editName ?? "";
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
