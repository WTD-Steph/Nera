"use client";

import { useState, useTransition } from "react";
import {
  buildAiPrompt,
  type PromptType,
} from "@/lib/report/builder";

const PRESETS: { id: PromptType; label: string; emoji: string }[] = [
  { id: "growth", label: "Analisis pertumbuhan", emoji: "📈" },
  { id: "feeding-sleep", label: "Pola makan & tidur", emoji: "😴" },
  { id: "diaper", label: "Pola pipis & poop", emoji: "🧷" },
  { id: "age-tips", label: "Saran usia ini", emoji: "💡" },
];

export function PromptCopier({
  context,
  babyName,
}: {
  context: string;
  babyName: string;
}) {
  const [active, setActive] = useState<PromptType>("growth");
  const [custom, setCustom] = useState("");
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  const prompt = buildAiPrompt(active, context, babyName, custom);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      startTransition(() => {
        setTimeout(() => setCopied(false), 2000);
      });
    } catch {
      // fallback: select textarea content
      const ta = document.getElementById(
        "prompt-textarea",
      ) as HTMLTextAreaElement | null;
      if (ta) {
        ta.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActive(p.id)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              active === p.id
                ? "border-rose-400 bg-rose-50 text-rose-700"
                : "border-gray-200 bg-white text-gray-700"
            }`}
          >
            <span aria-hidden>{p.emoji}</span>
            <span className="text-xs leading-tight">{p.label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setActive("custom")}
          className={`col-span-2 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
            active === "custom"
              ? "border-rose-400 bg-rose-50 text-rose-700"
              : "border-gray-200 bg-white text-gray-700"
          }`}
        >
          <span aria-hidden>✏️</span>
          <span className="text-xs">Pertanyaan custom</span>
        </button>
      </div>

      {active === "custom" ? (
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Tulis pertanyaan untuk Claude..."
          maxLength={300}
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400"
        />
      ) : null}

      <textarea
        id="prompt-textarea"
        value={prompt}
        readOnly
        rows={10}
        className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 font-mono text-[11px] leading-relaxed text-gray-700"
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onCopy}
          className="flex-1 rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 active:bg-rose-700"
        >
          {copied ? "✓ Disalin" : "📋 Salin prompt"}
        </button>
        <a
          href="https://claude.ai/new"
          target="_blank"
          rel="noreferrer"
          className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Buka Claude →
        </a>
      </div>

      <p className="text-[11px] leading-relaxed text-gray-400">
        Tap "Salin prompt" lalu tap "Buka Claude" — paste di chat Claude.ai.
        Bisa juga paste ke ChatGPT, Gemini, atau LLM lain. Prompt sudah
        include data {babyName} + petunjuk supaya respons terstruktur.
      </p>
    </div>
  );
}
