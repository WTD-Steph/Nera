"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDailyMoodAction } from "@/app/actions/wellness";

const MOOD_EMOJIS = ["😢", "😕", "😐", "🙂", "😊"];

export function DailyMoodForm() {
  const router = useRouter();
  const [mood, setMood] = useState<number | null>(null);
  const [hours, setHours] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (mood == null) {
      setError("Pilih mood dulu");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createDailyMoodAction({
        mood,
        hoursSlept: hours ? Number(hours) : undefined,
        notes: notes || undefined,
      });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="mt-3 space-y-3">
      <div>
        <div className="mb-1.5 text-xs font-semibold text-gray-700">
          Mood hari ini
        </div>
        <div className="flex justify-between gap-2">
          {MOOD_EMOJIS.map((emoji, i) => {
            const value = i + 1;
            const selected = mood === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setMood(value)}
                className={`flex-1 rounded-xl border py-2 text-2xl transition-transform active:scale-95 ${
                  selected
                    ? "border-emerald-400 bg-emerald-100"
                    : "border-gray-200 bg-white"
                }`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between px-1 text-[10px] text-gray-400">
          <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-700">
          Jam tidur tadi malam (opsional)
        </label>
        <input
          type="number"
          min="0"
          max="24"
          step="0.5"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder="—"
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-700">
          Catatan singkat (opsional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
        />
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={pending || mood == null}
        className="w-full rounded-2xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? "Menyimpan…" : "Simpan"}
      </button>
    </div>
  );
}
