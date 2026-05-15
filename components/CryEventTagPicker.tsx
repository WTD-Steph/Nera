"use client";

import { useState, useTransition } from "react";
import { tagCryEventAction } from "@/app/actions/cry-events";
import {
  REASON_EMOJIS,
  REASON_LABELS,
  TAGGABLE_REASONS,
  type Reason,
} from "@/lib/cry-detection/reason-heuristics";

// Tag picker untuk cry event — used di /listen event rows + di
// CryRealtimeBanner inline. Manual ground-truth labeling per parent.
//
// UX:
// - Belum tagged: 6 button row [🍼 Lapar] [😴 Lelah] [🧷 Popok]
//   [😣 Tidak Nyaman] [❓ Tidak Pasti] [• Lainnya]
// - Sudah tagged: show ✓ tag + edit affordance
// - Compact variant (banner): collapsed dropdown atau condensed buttons

export function CryEventTagPicker({
  eventId,
  currentTag,
  suggested,
  compact = false,
}: {
  eventId: string;
  currentTag: string | null;
  /** Heuristic suggestion untuk match/mismatch display. */
  suggested?: string | null;
  /** Compact = banner inline. Default = full row. */
  compact?: boolean;
}) {
  const [tag, setTag] = useState<string | null>(currentTag);
  const [editing, setEditing] = useState(currentTag === null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (reason: Reason | "other") => {
    setError(null);
    startTransition(async () => {
      const result = await tagCryEventAction({ id: eventId, reason });
      if (result.ok) {
        setTag(reason);
        setEditing(false);
      } else {
        setError(result.error);
      }
    });
  };

  // Compact (banner) mode — only show buttons if not yet tagged.
  if (compact && tag) {
    const isMatch = suggested && suggested !== "unclear" && tag === suggested;
    return (
      <div className="text-[11px] text-red-50">
        <span className="font-semibold">
          {REASON_EMOJIS[tag as Reason | "other"]}{" "}
          {REASON_LABELS[tag as Reason | "other"]}
        </span>
        {suggested && suggested !== "unclear" ? (
          <span className="ml-2 opacity-70">
            (suggested {REASON_LABELS[suggested as Reason]}
            {isMatch ? " ✓" : " ✗"})
          </span>
        ) : null}
      </div>
    );
  }

  if (compact) {
    // Banner mode, not tagged yet — inline buttons.
    return (
      <div className="mt-1.5 flex flex-wrap gap-1">
        {TAGGABLE_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            disabled={pending}
            onClick={() => submit(r)}
            className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-white/30 disabled:opacity-50"
          >
            {REASON_EMOJIS[r]} {REASON_LABELS[r]}
          </button>
        ))}
      </div>
    );
  }

  // Full row mode — /listen event card.
  if (!editing && tag) {
    const isMatch =
      suggested && suggested !== "unclear" && tag === suggested;
    const mismatch =
      suggested && suggested !== "unclear" && tag !== suggested;
    return (
      <div className="mt-1 flex items-center gap-2 text-[11px]">
        <span className="font-semibold text-gray-800">
          Actual: {REASON_EMOJIS[tag as Reason | "other"]}{" "}
          {REASON_LABELS[tag as Reason | "other"]}
        </span>
        {isMatch ? (
          <span className="text-emerald-600">✓ match</span>
        ) : mismatch ? (
          <span className="text-red-600">✗ suggested {REASON_LABELS[suggested as Reason]}</span>
        ) : null}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-gray-400 hover:text-gray-600"
        >
          ✎ ubah
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex flex-wrap gap-1">
        {TAGGABLE_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            disabled={pending}
            onClick={() => submit(r)}
            className="rounded-full border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:border-rose-300 hover:bg-rose-50 active:scale-[0.97] disabled:opacity-50"
          >
            {REASON_EMOJIS[r]} {REASON_LABELS[r]}
          </button>
        ))}
        {currentTag !== null ? (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-full px-2 py-1 text-[11px] text-gray-400 hover:text-gray-600"
          >
            batal
          </button>
        ) : null}
      </div>
      {error ? (
        <div className="text-[10px] text-red-600">{error}</div>
      ) : null}
    </div>
  );
}
