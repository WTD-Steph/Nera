"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EPDS_ITEMS, EPDS_INSTRUCTION } from "@/lib/wellness/epds-items";
import {
  getBandForRole,
  bandLabel,
  bandRecommendation,
  type Role,
} from "@/lib/wellness/cutoffs";
import { CrisisScreen } from "@/components/CrisisScreen";
import {
  commitEpdsQ10PositiveAction,
  completeEpdsAction,
} from "@/app/actions/wellness";

// EPDS questionnaire client component. One item per screen.
//
// CRITICAL Q10 flow:
// - When user picks Q10 option, IF score > 0: immediately
//   commitEpdsQ10PositiveAction → partial INSERT dengan
//   epds_q10_positive=true (audit preserved even if cancel)
// - Render CrisisScreen modal (non-dismissable)
// - After ack: user choice (continue items 1-9 atau cancel)
// - Q10 = 0: normal flow continues, no commit yet, full commit at
//   "Selesai" button (computes total + inserts complete row)

type ResponsesMap = Record<string, number | undefined>;

export function EpdsClient({
  role,
  partnerPhone,
}: {
  role: Role;
  partnerPhone: string | null;
}) {
  const router = useRouter();
  const [itemIdx, setItemIdx] = useState(0);
  const [responses, setResponses] = useState<ResponsesMap>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Crisis flow state
  const [crisisEntryId, setCrisisEntryId] = useState<string | null>(null);
  const [crisisAcknowledged, setCrisisAcknowledged] = useState(false);

  // Result state (after submit complete)
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [finalEntryId, setFinalEntryId] = useState<string | null>(null);

  const item = EPDS_ITEMS[itemIdx]!;
  const currentScore = responses[`q${item.number}`];

  const handleSelectOption = (score: number) => {
    setResponses((r) => ({ ...r, [`q${item.number}`]: score }));
    setError(null);

    // CRITICAL: Q10 selection commits IMMEDIATELY upon any non-zero
    // pick, BEFORE total computed, BEFORE remaining items.
    if (item.isQ10 && score > 0) {
      startTransition(async () => {
        const result = await commitEpdsQ10PositiveAction(score);
        if (result.ok) {
          setCrisisEntryId(result.entryId);
        } else {
          setError(`Gagal simpan: ${result.error}`);
        }
      });
    }
  };

  const handleNext = () => {
    setError(null);
    if (itemIdx < EPDS_ITEMS.length - 1) {
      setItemIdx((i) => i + 1);
    } else {
      // Last item — submit
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    setError(null);
    const completeResponses: Record<string, number> = {};
    for (let i = 1; i <= 10; i++) {
      const v = responses[`q${i}`];
      if (typeof v !== "number") {
        setError(`Item ${i} belum dijawab`);
        return;
      }
      completeResponses[`q${i}`] = v;
    }
    startTransition(async () => {
      const result = await completeEpdsAction({
        entryId: crisisEntryId ?? undefined,
        responses: completeResponses,
      });
      if (result.ok) {
        let total = 0;
        for (let i = 1; i <= 10; i++) total += completeResponses[`q${i}`] ?? 0;
        setFinalScore(total);
        setFinalEntryId(result.entryId);
      } else {
        setError(result.error);
      }
    });
  };

  // ────── Render: Result screen ──────
  if (finalScore !== null && finalEntryId !== null) {
    const band = getBandForRole(role, finalScore);
    return (
      <ResultScreen role={role} score={finalScore} band={band} />
    );
  }

  // ────── Render: Crisis screen (Q10 trigger active) ──────
  if (crisisEntryId && !crisisAcknowledged) {
    return (
      <CrisisScreen
        entryId={crisisEntryId}
        partnerPhone={partnerPhone}
        onAcknowledged={() => setCrisisAcknowledged(true)}
      />
    );
  }

  // ────── Render: Questionnaire item ──────
  const progress = Math.round(((itemIdx + 1) / EPDS_ITEMS.length) * 100);

  return (
    <div className="space-y-3">
      {itemIdx === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-[12px] leading-relaxed text-gray-700">
          {EPDS_INSTRUCTION}
        </div>
      ) : null}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Item {item.number} dari {EPDS_ITEMS.length}
        </div>
        <div className="mt-2 text-base font-semibold text-gray-900">
          {item.question}
        </div>

        <div className="mt-3 space-y-2">
          {item.options.map((opt, i) => {
            const selected = currentScore === opt.score;
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleSelectOption(opt.score)}
                disabled={pending}
                className={`w-full rounded-xl border p-3 text-left text-sm transition-colors disabled:opacity-50 ${
                  selected
                    ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                    : "border-gray-200 bg-white text-gray-800 hover:border-emerald-200"
                }`}
              >
                {selected ? "● " : "○ "}
                {opt.text}
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            if (itemIdx > 0) setItemIdx((i) => i - 1);
          }}
          disabled={itemIdx === 0}
          className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30"
        >
          ← Sebelumnya
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={pending || currentScore === undefined}
          className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending
            ? "…"
            : itemIdx === EPDS_ITEMS.length - 1
              ? "Selesai"
              : "Lanjut →"}
        </button>
      </div>

      <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function ResultScreen({
  role,
  score,
  band,
}: {
  role: Role;
  score: number;
  band: ReturnType<typeof getBandForRole>;
}) {
  if (!band) return null;
  const color =
    band === "low"
      ? "border-emerald-200 bg-emerald-50"
      : band === "mid"
        ? "border-amber-200 bg-amber-50"
        : "border-red-200 bg-red-50";
  const emoji = band === "low" ? "✓" : band === "mid" ? "⚠️" : "🔴";

  return (
    <div className="space-y-3">
      <div className="text-center">
        <div className="text-4xl font-bold text-gray-900">{score}</div>
        <div className="mt-1 text-xs uppercase tracking-wider text-gray-500">
          Skor EPDS
        </div>
      </div>

      <div className={`rounded-2xl border p-4 ${color}`}>
        <div className="font-bold text-gray-900">
          {emoji} {bandLabel(band)}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          {bandRecommendation(role, band)}
        </p>
      </div>

      {band !== "low" ? (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 text-[12px] leading-snug text-indigo-900/80">
          <div className="font-semibold text-indigo-900">
            Dukungan profesional:
          </div>
          <ul className="mt-1 space-y-0.5 pl-3">
            <li>· SEJIWA (Kemkes): 119 ext 8 · 24 jam · gratis</li>
            <li>· LISA Helpline: +62 811 3855 472 (WhatsApp/telp)</li>
            <li>· RS Pondok Indah · psikiatri: (021) 2569 7777</li>
          </ul>
        </div>
      ) : null}

      <div className="text-[10px] text-gray-400">
        Bukan diagnosis — hanya skrining. EPDS validated for {role === "mother" ? "ibu" : "ayah"} dengan cutoff {role === "mother" ? "10/13" : "10/12"}.
      </div>

      <a
        href="/wellness"
        className="block rounded-2xl bg-emerald-600 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-700"
      >
        Selesai
      </a>
    </div>
  );
}
