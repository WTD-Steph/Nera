"use client";

import { useEffect, useState } from "react";
import { LiveClock, LiveDate } from "@/components/LiveClock";
import { startOngoingLogAction } from "@/app/actions/logs";
import { SubmitButton } from "@/components/SubmitButton";

export type IdleClockStats = {
  milkTotalMl: number;
  milkTargetMin: number;
  milkTargetMax: number;
  sleepMin: number;
  sleepTargetHoursMin: number;
  sleepTargetHoursMax: number;
  peeCount: number;
  peeTargetMin: number;
  poopCount: number;
  poopTargetMin: number;
};

export type IdleClockReminder = {
  text: string;
  tone: "warning" | "urgent";
  emoji?: string;
};

function fmtH(min: number): string {
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}j ${m}m` : `${h}j`;
}

function pct(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(1, value / target);
}

export function IdleClockMode({
  sinceFeeding,
  sinceDiaper,
  sinceSleep,
  reminder,
  reminders,
  stats,
  ongoingSubtypes,
  onClose,
}: {
  sinceFeeding?: string | null;
  sinceDiaper?: string | null;
  sinceSleep?: string | null;
  reminder: IdleClockReminder | null;
  reminders?: IdleClockReminder[];
  stats: IdleClockStats;
  ongoingSubtypes: string[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

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

  const [dim, setDim] = useState(false);

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
  const barTrack = dim ? "bg-red-950/40" : "bg-rose-950/40";

  const ongoingSet = new Set(ongoingSubtypes);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-black">
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

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-8">
        <LiveDate
          className={`text-sm uppercase tracking-[0.3em] ${subtleColor}`}
        />
        <LiveClock
          withSeconds
          className={`font-mono text-7xl font-light tabular-nums ${accentColor} sm:text-[10rem]`}
        />

        {(() => {
          // Combine legacy single + new array, dedupe by text
          const all: IdleClockReminder[] = [
            ...(reminder ? [reminder] : []),
            ...(reminders ?? []),
          ];
          const uniq = Array.from(
            new Map(all.map((r) => [r.text, r])).values(),
          );
          if (uniq.length === 0) return null;
          return (
            <div className="flex w-full max-w-2xl flex-col items-center gap-1.5">
              {uniq.map((r, i) => (
                <div
                  key={i}
                  className={`flash-in flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
                    r.tone === "urgent"
                      ? "border-red-500/60 bg-red-950/40 text-red-300"
                      : "border-amber-500/40 bg-amber-950/30 text-amber-300"
                  }`}
                >
                  {r.emoji ? <span aria-hidden>{r.emoji}</span> : null}
                  <span>{r.text}</span>
                </div>
              ))}
            </div>
          );
        })()}

        <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
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

        <div
          className={`w-full max-w-2xl space-y-2 rounded-2xl border p-4 ${cardColor}`}
        >
          <div
            className={`text-[11px] uppercase tracking-[0.25em] ${subtleColor}`}
          >
            Total Hari Ini
          </div>
          <CompactStatRow
            label="🍼 Susu"
            valueText={`${stats.milkTotalMl} / ${stats.milkTargetMin}–${stats.milkTargetMax} ml`}
            progress={pct(stats.milkTotalMl, stats.milkTargetMin)}
            accent={accentColor}
            subtle={subtleColor}
            barTrack={barTrack}
          />
          <CompactStatRow
            label="😴 Tidur"
            valueText={`${fmtH(stats.sleepMin)} / ${stats.sleepTargetHoursMin}–${stats.sleepTargetHoursMax} jam`}
            progress={pct(
              stats.sleepMin,
              stats.sleepTargetHoursMin * 60,
            )}
            accent={accentColor}
            subtle={subtleColor}
            barTrack={barTrack}
          />
          <div className="grid grid-cols-2 gap-3">
            <CompactStatRow
              label="💛 Pipis"
              valueText={`${stats.peeCount} / ${stats.peeTargetMin}+`}
              progress={pct(stats.peeCount, stats.peeTargetMin)}
              accent={accentColor}
              subtle={subtleColor}
              barTrack={barTrack}
            />
            <CompactStatRow
              label="💩 BAB"
              valueText={`${stats.poopCount} / ${stats.poopTargetMin}+`}
              progress={pct(stats.poopCount, stats.poopTargetMin)}
              accent={accentColor}
              subtle={subtleColor}
              barTrack={barTrack}
            />
          </div>
        </div>

        <div className="grid w-full max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4">
          <ShortcutForm
            subtype="sleep"
            label="Tidur"
            emoji="😴"
            cardColor={cardColor}
            accent={accentColor}
            subtle={subtleColor}
            disabled={ongoingSet.has("sleep")}
          />
          <ShortcutForm
            subtype="feeding"
            side="kiri"
            label="DBF"
            emoji="🤱"
            cardColor={cardColor}
            accent={accentColor}
            subtle={subtleColor}
            disabled={ongoingSet.has("dbf")}
          />
          <ShortcutForm
            subtype="pumping"
            side="both"
            label="Pumping"
            emoji="💧"
            cardColor={cardColor}
            accent={accentColor}
            subtle={subtleColor}
            disabled={ongoingSet.has("pumping")}
          />
          <ShortcutForm
            subtype="hiccup"
            label="Cegukan"
            emoji="🫨"
            cardColor={cardColor}
            accent={accentColor}
            subtle={subtleColor}
            disabled={ongoingSet.has("hiccup")}
          />
        </div>
      </div>

      <p
        className={`pb-6 text-center text-[10px] tracking-widest ${subtleColor}`}
      >
        Mode jam · Esc / Tutup untuk keluar
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

function CompactStatRow({
  label,
  valueText,
  progress,
  accent,
  subtle,
  barTrack,
}: {
  label: string;
  valueText: string;
  progress: number;
  accent: string;
  subtle: string;
  barTrack: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={`text-xs ${subtle}`}>{label}</span>
        <span className={`text-xs tabular-nums ${accent}`}>{valueText}</span>
      </div>
      <div className={`mt-1 h-1 w-full overflow-hidden rounded-full ${barTrack}`}>
        <div
          className={`h-full rounded-full transition-[width] ${
            progress >= 1
              ? "bg-emerald-500/70"
              : progress >= 0.6
                ? "bg-amber-500/70"
                : "bg-rose-500/70"
          }`}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  );
}

function ShortcutForm({
  subtype,
  side,
  label,
  emoji,
  cardColor,
  accent,
  subtle,
  disabled,
}: {
  subtype: "sleep" | "feeding" | "pumping" | "hiccup";
  side?: "kiri" | "kanan" | "both";
  label: string;
  emoji: string;
  cardColor: string;
  accent: string;
  subtle: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 rounded-2xl border p-3 opacity-50 ${cardColor}`}
      >
        <span className="text-2xl" aria-hidden>
          {emoji}
        </span>
        <span className={`text-[11px] font-semibold ${subtle}`}>
          {label} berlangsung
        </span>
      </div>
    );
  }
  return (
    <form action={startOngoingLogAction}>
      <input type="hidden" name="subtype" value={subtype} />
      <input type="hidden" name="start_offset_min" value="0" />
      <input type="hidden" name="return_to" value="/" />
      {subtype === "feeding" && side ? (
        <input type="hidden" name="dbf_side" value={side} />
      ) : null}
      {subtype === "pumping" && side ? (
        <input type="hidden" name="pumping_side" value={side} />
      ) : null}
      <SubmitButton
        pendingText="…"
        className={`flex w-full flex-col items-center justify-center gap-1 rounded-2xl border p-3 transition-transform active:scale-95 ${cardColor} ${accent}`}
      >
        <span className="text-2xl" aria-hidden>
          {emoji}
        </span>
        <span className="text-[11px] font-semibold">{label}</span>
      </SubmitButton>
    </form>
  );
}

export function IdleClockToggle({
  sinceFeeding,
  sinceDiaper,
  sinceSleep,
  reminder,
  reminders,
  stats,
  ongoingSubtypes,
  variant = "full",
}: {
  sinceFeeding?: string | null;
  sinceDiaper?: string | null;
  sinceSleep?: string | null;
  reminder: IdleClockReminder | null;
  reminders?: IdleClockReminder[];
  stats: IdleClockStats;
  ongoingSubtypes: string[];
  /** "full" = wide button row; "icon" = circular icon for header. */
  variant?: "full" | "icon";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "icon"
            ? "flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-base shadow-sm hover:bg-gray-50 active:scale-95"
            : "flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 active:scale-[0.99]"
        }
        aria-label="Mode Jam"
        title="Mode Jam"
      >
        {variant === "icon" ? (
          <span aria-hidden>⏰</span>
        ) : (
          <>
            <span aria-hidden>⏰</span>
            <span>Mode Jam</span>
          </>
        )}
      </button>
      {open ? (
        <IdleClockMode
          sinceFeeding={sinceFeeding}
          sinceDiaper={sinceDiaper}
          sinceSleep={sinceSleep}
          reminder={reminder}
          reminders={reminders}
          stats={stats}
          ongoingSubtypes={ongoingSubtypes}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
