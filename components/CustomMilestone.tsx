"use client";

import { useState } from "react";
import {
  addCustomMilestoneAction,
  updateCustomMilestoneAction,
  deleteCustomMilestoneAction,
} from "@/app/actions/milestone";
import { SubmitButton } from "@/components/SubmitButton";

function todayJakarta(): string {
  const now = new Date();
  const offsetMs = 7 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offsetMs);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
}

function isoToJakartaDateInput(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return todayJakarta();
  const offsetMs = 7 * 60 * 60 * 1000;
  const local = new Date(d.getTime() + offsetMs);
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

export function CustomMilestoneAdd() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-rose-200 bg-rose-50/40 px-3 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
      >
        <span aria-hidden>＋</span>
        <span>Tambah catatan ad-hoc (puput tali pusat, gigi pertama, dll)</span>
      </button>
    );
  }

  return (
    <form
      action={addCustomMilestoneAction}
      className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3"
    >
      <input type="hidden" name="return_to" value="/milestone" />
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-rose-700">
          📌 Catatan ad-hoc
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-gray-400 hover:text-gray-700"
          aria-label="Tutup"
        >
          ✕
        </button>
      </div>
      <input
        type="text"
        name="text"
        required
        maxLength={200}
        autoFocus
        placeholder="Mis. puput tali pusat / gigi bawah pertama / jatuh"
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-400"
      />
      <div className="flex items-center gap-2">
        <input
          type="date"
          name="achieved_date"
          defaultValue={todayJakarta()}
          max={todayJakarta()}
          required
          className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs outline-none focus:border-rose-400"
        />
        <SubmitButton
          pendingText="…"
          className="rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-600"
        >
          Simpan
        </SubmitButton>
      </div>
    </form>
  );
}

export function CustomMilestoneRow({
  id,
  text,
  achievedAt,
}: {
  id: string;
  text: string;
  achievedAt: string;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <form
        action={updateCustomMilestoneAction}
        className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3"
      >
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="return_to" value="/milestone" />
        <input
          type="text"
          name="text"
          required
          maxLength={200}
          defaultValue={text}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-400"
        />
        <div className="flex items-center gap-2">
          <input
            type="date"
            name="achieved_date"
            defaultValue={isoToJakartaDateInput(achievedAt)}
            max={todayJakarta()}
            required
            className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs outline-none focus:border-rose-400"
          />
          <SubmitButton
            pendingText="…"
            className="rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-600"
          >
            Update
          </SubmitButton>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs text-gray-600 hover:bg-gray-50"
          >
            Batal
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-rose-100 bg-white px-3 py-2.5">
      <span className="mt-0.5 text-base" aria-hidden>
        📌
      </span>
      <div className="flex-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="block w-full text-left"
        >
          <div className="text-sm leading-snug text-gray-800">{text}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-rose-500">
            <span>{fmtDateJakarta(achievedAt)}</span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-400 hover:text-rose-600">✏️ edit</span>
          </div>
        </button>
      </div>
      <form action={deleteCustomMilestoneAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="return_to" value="/milestone" />
        <SubmitButton
          pendingText="…"
          className="text-[11px] text-gray-300 hover:text-red-500"
        >
          Hapus
        </SubmitButton>
      </form>
    </div>
  );
}
