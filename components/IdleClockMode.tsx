"use client";

import { useEffect, useState } from "react";
import { LiveClock, LiveDate } from "@/components/LiveClock";

export function IdleClockMode({
  babyName,
  babyAgeText,
  sinceFeeding,
  sinceDiaper,
  sinceSleep,
  onClose,
}: {
  babyName: string;
  babyAgeText: string;
  sinceFeeding?: string | null;
  sinceDiaper?: string | null;
  sinceSleep?: string | null;
  onClose: () => void;
}) {
  // Esc closes the mode
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  // Request fullscreen so chrome (URL bar etc.) hides — same behavior
  // as NightLamp, gives a kiosk-style display.
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    }
    return () => {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  // Toggle: dim/bright. User dapat pilih kalau di samping ranjang vs siang.
  const [dim, setDim] = useState(false);

  // Paint html/body bg to match the mode so safe-area-top + iOS PWA
  // status bar blend in (no rose strip showing through).
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.background;
    const prevBodyBg = body.style.background;
    const bg = dim ? "#000" : "#0a0a0a";
    html.style.background = bg;
    body.style.background = bg;
    return () => {
      html.style.background = prevHtmlBg;
      body.style.background = prevBodyBg;
    };
  }, [dim]);

  const accentColor = dim ? "text-red-700/90" : "text-rose-200";
  const subtleColor = dim ? "text-red-900/50" : "text-rose-300/60";
  const cardColor = dim
    ? "border-red-900/30 bg-black/40"
    : "border-rose-900/40 bg-black/40";

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-black ${
        dim ? "" : ""
      }`}
    >
      <div className="flex items-center justify-between px-5 pt-5">
        <button
          type="button"
          onClick={() => setDim((d) => !d)}
          className={`rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-widest ${cardColor} ${subtleColor} hover:opacity-80`}
        >
          {dim ? "🔆 Terang" : "🌑 Redup"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className={`text-xs uppercase tracking-widest ${subtleColor} hover:opacity-80`}
          aria-label="Tutup mode jam"
        >
          Tutup ✕
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <LiveDate
          className={`text-sm uppercase tracking-[0.3em] ${subtleColor}`}
        />
        <LiveClock
          withSeconds
          className={`mt-4 font-mono text-7xl font-light tabular-nums ${accentColor} sm:text-[10rem]`}
        />

        <div
          className={`mt-10 text-center text-xs uppercase tracking-[0.25em] ${subtleColor}`}
        >
          {babyName} · {babyAgeText}
        </div>

        <div className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
          <SinceCard
            label="Feeding"
            value={sinceFeeding}
            cardColor={cardColor}
            accent={accentColor}
            subtle={subtleColor}
          />
          <SinceCard
            label="Tidur"
            value={sinceSleep}
            cardColor={cardColor}
            accent={accentColor}
            subtle={subtleColor}
          />
          <SinceCard
            label="Diaper"
            value={sinceDiaper}
            cardColor={cardColor}
            accent={accentColor}
            subtle={subtleColor}
          />
        </div>
      </div>

      <p
        className={`pb-6 text-center text-[10px] tracking-widest ${subtleColor}`}
      >
        Mode jam · tap di luar tombol untuk tetap nyala · Esc / Tutup untuk
        keluar
      </p>
    </div>
  );
}

function SinceCard({
  label,
  value,
  cardColor,
  accent,
  subtle,
}: {
  label: string;
  value: string | null | undefined;
  cardColor: string;
  accent: string;
  subtle: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 text-center ${cardColor}`}>
      <div className={`text-[11px] uppercase tracking-widest ${subtle}`}>
        {label}
      </div>
      <div className={`mt-1 text-2xl font-light tabular-nums ${accent}`}>
        {value ?? "—"}
      </div>
    </div>
  );
}

export function IdleClockToggle({
  babyName,
  babyAgeText,
  sinceFeeding,
  sinceDiaper,
  sinceSleep,
}: {
  babyName: string;
  babyAgeText: string;
  sinceFeeding?: string | null;
  sinceDiaper?: string | null;
  sinceSleep?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 active:scale-[0.99]"
      >
        <span aria-hidden>🕐</span>
        <span>Mode Jam</span>
      </button>
      {open ? (
        <IdleClockMode
          babyName={babyName}
          babyAgeText={babyAgeText}
          sinceFeeding={sinceFeeding}
          sinceDiaper={sinceDiaper}
          sinceSleep={sinceSleep}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
