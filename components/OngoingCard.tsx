"use client";

import { useEffect, useState } from "react";
import {
  endOngoingSleepAction,
  endOngoingPumpingAction,
} from "@/app/actions/logs";
import { Stopwatch } from "@/components/Stopwatch";
import { SubmitButton } from "@/components/SubmitButton";
import { FormCloser } from "@/components/FormCloser";

type Subtype = "sleep" | "pumping";

const TITLES: Record<Subtype, string> = {
  sleep: "Tidur",
  pumping: "Pumping",
};

const EMOJIS: Record<Subtype, string> = {
  sleep: "🌙",
  pumping: "💧",
};

function fmtClock(iso: string): string {
  // Locked to Asia/Jakarta so server (UTC) and client (any TZ) render
  // identically — no hydration mismatch.
  return new Date(iso).toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function OngoingCard({
  id,
  subtype,
  startIso,
}: {
  id: string;
  subtype: Subtype;
  startIso: string;
}) {
  const [showLamp, setShowLamp] = useState(false);
  const [showPumpEnd, setShowPumpEnd] = useState(false);

  const title = TITLES[subtype];
  const emoji = EMOJIS[subtype];

  return (
    <>
      <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-600">
              <span aria-hidden>{emoji}</span>
              <span>{title} berlangsung</span>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
              </span>
            </div>
            <div className="text-[11px] text-gray-500">
              Sejak {fmtClock(startIso)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowLamp(true)}
            className="rounded-full bg-gray-900/5 p-2 text-gray-600 hover:bg-gray-900/10"
            aria-label="Mode night lamp"
          >
            🌑
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowLamp(true)}
          className="mt-2 block w-full text-left"
        >
          <Stopwatch
            startIso={startIso}
            className="font-mono text-4xl font-bold tabular-nums tracking-tight text-rose-600"
          />
        </button>

        {subtype === "sleep" ? (
          <form
            action={endOngoingSleepAction}
            onSubmit={() => setTimeout(() => setShowLamp(false), 0)}
            className="mt-3"
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="return_to" value="/" />
            <SubmitButton
              pendingText="Menyimpan…"
              className="w-full rounded-xl bg-rose-500 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 active:bg-rose-700"
            >
              Bangun · Stop
            </SubmitButton>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowPumpEnd(true)}
            className="mt-3 w-full rounded-xl bg-rose-500 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 active:bg-rose-700"
          >
            Stop · Catat ml
          </button>
        )}
      </div>

      {showLamp ? (
        <NightLamp
          id={id}
          subtype={subtype}
          startIso={startIso}
          title={title}
          onClose={() => setShowLamp(false)}
          onPumpStop={() => {
            setShowLamp(false);
            setShowPumpEnd(true);
          }}
        />
      ) : null}

      {showPumpEnd ? (
        <EndPumpingModal id={id} onClose={() => setShowPumpEnd(false)} />
      ) : null}
    </>
  );
}

function NightLamp({
  id,
  subtype,
  startIso,
  title,
  onClose,
  onPumpStop,
}: {
  id: string;
  subtype: Subtype;
  startIso: string;
  title: string;
  onClose: () => void;
  onPumpStop: () => void;
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
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black"
      style={{ color: "#7f1d1d" }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 text-xs uppercase tracking-widest text-red-900/70 hover:text-red-700"
        aria-label="Tutup night lamp"
      >
        Tutup ✕
      </button>

      <div className="text-xs uppercase tracking-[0.3em] text-red-900/60">
        {title}
      </div>
      <Stopwatch
        startIso={startIso}
        className="mt-4 font-mono text-7xl font-light tabular-nums text-red-700/90 sm:text-[8rem]"
      />
      <div className="mt-2 text-[11px] tracking-widest text-red-900/50">
        Sejak {fmtClock(startIso)}
      </div>

      <div className="mt-12 w-full max-w-xs px-6">
        {subtype === "sleep" ? (
          <form
            action={endOngoingSleepAction}
            onSubmit={() => setTimeout(onClose, 0)}
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="return_to" value="/" />
            <FormCloser onClose={onClose} />
            <SubmitButton
              pendingText="Menyimpan…"
              className="w-full rounded-2xl border border-red-900/40 bg-transparent py-3 text-sm font-medium text-red-700/90 hover:bg-red-950/30 active:bg-red-950/50"
            >
              Bangun · Stop
            </SubmitButton>
          </form>
        ) : (
          <button
            type="button"
            onClick={onPumpStop}
            className="w-full rounded-2xl border border-red-900/40 bg-transparent py-3 text-sm font-medium text-red-700/90 hover:bg-red-950/30 active:bg-red-950/50"
          >
            Stop · Catat ml
          </button>
        )}
      </div>

      <p className="absolute bottom-6 px-6 text-center text-[10px] tracking-widest text-red-950/40">
        Layar redup untuk malam · tap luar tombol untuk tetap nyala
      </p>
    </div>
  );
}

function EndPumpingModal({
  id,
  onClose,
}: {
  id: string;
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
        className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl md:rounded-3xl"
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="-ml-1 p-1 text-gray-400 hover:text-gray-700"
            aria-label="Tutup"
          >
            ✕
          </button>
          <div className="text-sm font-semibold text-gray-800">Selesai pumping</div>
          <span className="w-6" />
        </div>

        <form
          action={endOngoingPumpingAction}
          onSubmit={() => setTimeout(onClose, 0)}
          className="mt-4 space-y-4"
        >
          <FormCloser onClose={onClose} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="return_to" value="/" />

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                Kiri (ml)
              </span>
              <input
                type="number"
                name="amount_l_ml"
                step="1"
                min="0"
                max="500"
                inputMode="numeric"
                placeholder="0"
                autoFocus
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-gray-600">
                Kanan (ml)
              </span>
              <input
                type="number"
                name="amount_r_ml"
                step="1"
                min="0"
                max="500"
                inputMode="numeric"
                placeholder="0"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
              />
            </label>
          </div>

          <SubmitButton
            pendingText="Menyimpan…"
            className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 active:bg-rose-700"
          >
            Simpan
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
