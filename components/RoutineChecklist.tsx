"use client";

import { useState } from "react";
import {
  logRoutineAction,
  unlogRoutineAction,
} from "@/app/actions/routines";
import { SubmitButton } from "@/components/SubmitButton";

export type RoutineItem = {
  id: string;
  name: string;
  emoji: string | null;
  needs_duration: boolean;
};

export type RoutineLogToday = {
  id: string;
  routine_id: string;
  logged_at: string;
  duration_min: number | null;
};

function nowDatetimeLocal(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function fmtTimeJakarta(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function RoutineChecklist({
  routines,
  todayLogs,
}: {
  routines: RoutineItem[];
  todayLogs: RoutineLogToday[];
}) {
  if (routines.length === 0) return null;
  const logsByRoutine = new Map<string, RoutineLogToday>();
  for (const l of todayLogs) logsByRoutine.set(l.routine_id, l);

  return (
    <section className="mt-5">
      <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700">
        Ceklis Harian
      </h2>
      <div className="space-y-1.5 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
        {routines.map((r) => {
          const log = logsByRoutine.get(r.id);
          return (
            <RoutineRow key={r.id} routine={r} todayLog={log ?? null} />
          );
        })}
      </div>
    </section>
  );
}

function RoutineRow({
  routine,
  todayLog,
}: {
  routine: RoutineItem;
  todayLog: RoutineLogToday | null;
}) {
  const [editing, setEditing] = useState(false);
  const checked = !!todayLog;
  const emoji = routine.emoji ?? "✓";

  // Already checked → show check + time + duration, with uncheck option
  if (checked && todayLog) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-emerald-50/40 px-2 py-2">
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-emerald-500 text-white">
          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <span className="flex-1 text-sm text-gray-700">
          <span className="mr-1.5" aria-hidden>
            {emoji}
          </span>
          {routine.name}
        </span>
        <span className="text-[11px] text-emerald-700">
          {fmtTimeJakarta(todayLog.logged_at)}
          {todayLog.duration_min != null
            ? ` · ${todayLog.duration_min}m`
            : ""}
        </span>
        <form action={unlogRoutineAction}>
          <input type="hidden" name="id" value={todayLog.id} />
          <input type="hidden" name="return_to" value="/" />
          <SubmitButton
            pendingText="…"
            className="ml-1 text-[11px] text-gray-300 hover:text-red-500"
          >
            ✕
          </SubmitButton>
        </form>
      </div>
    );
  }

  // Not checked + needs_duration → expand inline form on tap
  if (editing && routine.needs_duration) {
    return (
      <form
        action={logRoutineAction}
        className="space-y-2 rounded-lg border border-rose-100 bg-rose-50/40 p-2"
      >
        <input type="hidden" name="routine_id" value={routine.id} />
        <input type="hidden" name="return_to" value="/" />
        <div className="text-xs font-medium text-gray-700">
          <span aria-hidden className="mr-1.5">
            {emoji}
          </span>
          {routine.name}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex-1">
            <span className="block text-[10px] text-gray-500">Jam</span>
            <input
              type="datetime-local"
              name="logged_at"
              defaultValue={nowDatetimeLocal()}
              className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-rose-400"
            />
          </label>
          <label className="w-24">
            <span className="block text-[10px] text-gray-500">Durasi (m)</span>
            <input
              type="number"
              name="duration_min"
              required
              min="0"
              max="480"
              step="1"
              inputMode="numeric"
              placeholder="10"
              className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-rose-400"
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <SubmitButton
            pendingText="…"
            className="flex-1 rounded-lg bg-rose-500 py-1.5 text-xs font-semibold text-white hover:bg-rose-600"
          >
            ✓ Simpan
          </SubmitButton>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            Batal
          </button>
        </div>
      </form>
    );
  }

  // Not checked + simple → tap to log immediately (no duration)
  if (!routine.needs_duration) {
    return (
      <form
        action={logRoutineAction}
        className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-gray-50"
      >
        <input type="hidden" name="routine_id" value={routine.id} />
        <input type="hidden" name="return_to" value="/" />
        <SubmitButton
          pendingText="…"
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 border-gray-300 hover:border-rose-300"
        >
          {""}
        </SubmitButton>
        <span className="flex-1 text-sm text-gray-700">
          <span className="mr-1.5" aria-hidden>
            {emoji}
          </span>
          {routine.name}
        </span>
      </form>
    );
  }

  // Not checked + needs_duration (collapsed): tap to expand
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-gray-50"
    >
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 border-gray-300" />
      <span className="flex-1 text-sm text-gray-700">
        <span className="mr-1.5" aria-hidden>
          {emoji}
        </span>
        {routine.name}
      </span>
      <span className="text-[10px] text-amber-600">+ durasi</span>
    </button>
  );
}
