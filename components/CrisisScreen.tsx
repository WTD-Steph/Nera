"use client";

import { useEffect, useState, useTransition } from "react";
import {
  CRISIS_RESOURCES,
  partnerWaUrl,
} from "@/lib/wellness/crisis-resources";
import { ackCrisisAction } from "@/app/actions/wellness";

// SAFETY-CRITICAL component.
//
// Renders full-screen, non-dismissable modal. Cannot close via:
// - Backdrop tap (no onClick on backdrop)
// - Escape key (event listener removed)
// - Swipe gesture (no swipe handlers)
//
// User MUST tap "Saya sudah membaca, lanjutkan" to dismiss. On dismiss,
// calls ackCrisisAction(entryId) yang persists crisis_acknowledged_at
// timestamp.
//
// Renders BEFORE total score displayed. Triggered immediately upon Q10
// selection >0, BEFORE user completes remaining items (audit preserved
// even kalau cancel rest of questionnaire).

export function CrisisScreen({
  entryId,
  partnerPhone,
  onAcknowledged,
}: {
  entryId: string;
  /** Partner phone in E164 format untuk WhatsApp deep link. */
  partnerPhone: string | null;
  /** Called after server ack succeeds. Caller decides next step
   *  (continue questionnaire / cancel / go home). */
  onAcknowledged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [ackError, setAckError] = useState<string | null>(null);

  // Block Escape key dari closing modal.
  useEffect(() => {
    const stopEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.stopPropagation();
    };
    document.addEventListener("keydown", stopEscape, true);
    // Lock body scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", stopEscape, true);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const handleAck = () => {
    setAckError(null);
    startTransition(async () => {
      const result = await ackCrisisAction(entryId);
      if (result.ok) {
        onAcknowledged();
      } else {
        setAckError(result.error);
      }
    });
  };

  const partnerUrl = partnerWaUrl(partnerPhone);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="crisis-title"
      className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-gradient-to-b from-rose-50 to-white px-4 py-6"
    >
      <div className="mx-auto w-full max-w-md md:max-w-lg">
        <h1
          id="crisis-title"
          className="text-2xl font-bold text-rose-900"
        >
          🤝 Anda tidak sendirian
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-800">
          Memiliki pikiran untuk menyakiti diri sendiri adalah pengalaman
          yang berat, dan bantuan tersedia 24 jam.
        </p>

        <div className="mt-5 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-rose-700">
            Hubungi sekarang — gratis, anonim
          </div>

          {CRISIS_RESOURCES.map((r) => (
            <a
              key={r.id}
              href={r.primaryUrl}
              className="block rounded-2xl border border-rose-200 bg-white p-4 shadow-sm hover:bg-rose-50 active:scale-[0.99]"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden>
                  {r.emoji}
                </span>
                <div className="flex-1">
                  <div className="font-bold text-gray-900">{r.name}</div>
                  <div className="text-xs text-gray-600">{r.description}</div>
                  <div className="mt-1.5 text-sm font-semibold text-rose-700">
                    {r.primaryLabel}
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-500">
                    {r.hours}
                  </div>
                  {r.secondaryUrl && r.secondaryLabel ? (
                    <a
                      href={r.secondaryUrl}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 inline-block text-[11px] text-rose-600 underline"
                    >
                      {r.secondaryLabel} →
                    </a>
                  ) : null}
                </div>
              </div>
            </a>
          ))}

          {partnerUrl ? (
            <a
              href={partnerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm hover:bg-indigo-100 active:scale-[0.99]"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden>
                  💌
                </span>
                <div>
                  <div className="font-bold text-indigo-900">
                    Kirim pesan ke pasangan
                  </div>
                  <div className="mt-1 text-xs italic text-indigo-800">
                    &ldquo;Aku baru isi screening dan butuh ngobrol. Bisa
                    kita bicara?&rdquo;
                  </div>
                </div>
              </div>
            </a>
          ) : null}
        </div>

        <p className="mt-6 text-[11px] leading-relaxed text-gray-500">
          Pesan ini muncul karena Anda menjawab item 10 dengan nilai di
          atas nol. Tidak ada penilaian — hanya kepedulian.
        </p>

        {ackError ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            Gagal simpan acknowledgment: {ackError}. Coba lagi.
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleAck}
          disabled={pending}
          className="mt-4 w-full rounded-2xl bg-rose-600 py-4 text-base font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
        >
          {pending
            ? "Menyimpan…"
            : "✓ Saya sudah membaca, lanjutkan"}
        </button>
      </div>
    </div>
  );
}
