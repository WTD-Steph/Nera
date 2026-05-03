"use client";

import { useState } from "react";
import {
  toggleMilestoneAction,
  updateMilestoneDateAction,
} from "@/app/actions/milestone";
import { SubmitButton } from "@/components/SubmitButton";

/** Convert ISO timestamp to "YYYY-MM-DD" in Asia/Jakarta. */
function isoToJakartaDateInput(iso: string | null | undefined): string {
  if (!iso) return todayJakarta();
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return todayJakarta();
  const offsetMs = 7 * 60 * 60 * 1000;
  const local = new Date(d.getTime() + offsetMs);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
}

function todayJakarta(): string {
  const now = new Date();
  const offsetMs = 7 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offsetMs);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
}

function fmtDateJakarta(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function MilestoneRow({
  milestoneKey,
  text,
  achievedAt,
}: {
  milestoneKey: string;
  text: string;
  achievedAt: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const checked = !!achievedAt;

  if (editing) {
    return (
      <form
        action={checked ? updateMilestoneDateAction : toggleMilestoneAction}
        className="space-y-2 px-4 py-3"
      >
        <input type="hidden" name="milestone_key" value={milestoneKey} />
        <input type="hidden" name="achieved" value={checked ? "1" : "0"} />
        <input type="hidden" name="return_to" value="/milestone" />
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 border-rose-400 bg-rose-50" />
          <div className="flex-1">
            <div className="text-sm leading-snug text-gray-700">{text}</div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="date"
                name="achieved_date"
                defaultValue={isoToJakartaDateInput(achievedAt)}
                max={todayJakarta()}
                required
                className="flex-1 rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-rose-400"
              />
              <SubmitButton
                pendingText="…"
                className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600"
              >
                {checked ? "Update" : "Tercapai"}
              </SubmitButton>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
          checked
            ? "border-rose-500 bg-rose-500 text-white"
            : "border-gray-300 hover:border-rose-300"
        }`}
        aria-label={checked ? "Edit tanggal" : "Tandai tercapai"}
      >
        {checked ? (
          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        ) : null}
      </button>
      <div className="flex-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="block w-full text-left"
        >
          <div
            className={`text-sm leading-snug ${
              checked ? "text-gray-800" : "text-gray-700"
            }`}
          >
            {text}
          </div>
          {achievedAt ? (
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-rose-500">
              <span>tercapai {fmtDateJakarta(achievedAt)}</span>
              <span className="text-gray-300">·</span>
              <span className="text-gray-400 hover:text-rose-600">
                ✏️ ubah tanggal
              </span>
            </div>
          ) : (
            <div className="mt-0.5 text-[11px] text-gray-400">
              Tap untuk tandai tercapai
            </div>
          )}
        </button>
      </div>
      {checked ? (
        <form action={toggleMilestoneAction}>
          <input type="hidden" name="milestone_key" value={milestoneKey} />
          <input type="hidden" name="achieved" value="1" />
          <input type="hidden" name="return_to" value="/milestone" />
          <SubmitButton
            pendingText="…"
            className="text-[11px] text-gray-300 hover:text-red-500"
          >
            ✕
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
