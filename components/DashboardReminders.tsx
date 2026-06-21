"use client";

import Link from "next/link";
import { computeReminders, type ReminderInputs } from "@/lib/compute/reminders";
import { useNow } from "@/lib/time/use-now";

/**
 * Live feeding/diaper/pumping reminder banners. Recomputes on a client clock
 * so a reminder appears/escalates when its threshold is crossed, even with no
 * new log event (previously frozen into a server snapshot).
 */
export function DashboardReminders({
  inputs,
  initialNowMs,
}: {
  inputs: ReminderInputs;
  initialNowMs: number;
}) {
  const now = useNow(30_000, initialNowMs);
  const { feeding, diaper, pumping, longPump } = computeReminders(inputs, now);

  if (!feeding && !diaper && !pumping && !longPump) return null;

  return (
    <div className="mt-3 space-y-1.5">
      {feeding ? (
        <div
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
            feeding.tone === "urgent"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <span aria-hidden>🍼</span>
          <span>{feeding.text}</span>
        </div>
      ) : null}
      {diaper ? (
        <div
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
            diaper.tone === "urgent"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <span aria-hidden>🧷</span>
          <span>{diaper.text}</span>
        </div>
      ) : null}
      {pumping ? (
        <div
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
            pumping.tone === "urgent"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <span aria-hidden>💧</span>
          <span>{pumping.text}</span>
        </div>
      ) : null}
      {longPump ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">
          <span className="flex items-center gap-2">
            <span aria-hidden>💧</span>
            <span>Pumping sudah {longPump.minsRunning}m · masih jalan?</span>
          </span>
          <Link
            href="#aktivitas"
            className="rounded-full border border-blue-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
          >
            Selesai
          </Link>
        </div>
      ) : null}
    </div>
  );
}
