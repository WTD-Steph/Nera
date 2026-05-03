// Summarize log activity during a handover window: from started_at to now
// (or ended_at). Produces aggregated bullets + recent timeline entries.

import type { LogRow } from "@/lib/compute/stats";
import { fmtDuration, fmtTime } from "@/lib/compute/format";
import { pumpDur } from "@/lib/compute/format";

export type HandoverSummary = {
  /** Aggregated bullets ready to render. Empty if no activity. */
  bullets: string[];
  /** Last N entries in chronological order (newest first). */
  recent: { time: string; text: string }[];
  /** Total entries in window (for the empty-state fallback). */
  total: number;
};

const SUBTYPE_LABEL: Record<string, string> = {
  feeding: "Feeding",
  pumping: "Pumping",
  diaper: "Diaper",
  sleep: "Tidur",
  bath: "Mandi",
  temp: "Suhu",
  med: "Obat",
  hiccup: "Cegukan",
  tummy: "Tummy time",
};

export function summarizeHandoverActivity(
  logs: LogRow[],
  startedAtIso: string,
  endedAtIso?: string | null,
): HandoverSummary {
  const startMs = new Date(startedAtIso).getTime();
  const endMs = endedAtIso ? new Date(endedAtIso).getTime() : Date.now();
  const inWindow = logs.filter((l) => {
    const t = new Date(l.timestamp).getTime();
    return t >= startMs && t <= endMs;
  });

  let feedingMlSufor = 0;
  let feedingMlAsi = 0;
  let feedingBottleCount = 0;
  let dbfCount = 0;
  let dbfMin = 0;
  let pumpMl = 0;
  let pumpCount = 0;
  let sleepCount = 0;
  let sleepMin = 0;
  let diaperPee = 0;
  let diaperPoop = 0;
  let bathCount = 0;
  let medCount = 0;
  let tempCount = 0;

  for (const l of inWindow) {
    if (l.subtype === "feeding") {
      if (l.amount_ml != null) {
        feedingBottleCount += 1;
        if (l.bottle_content === "asi") feedingMlAsi += l.amount_ml;
        else feedingMlSufor += l.amount_ml;
      }
      const lMin = l.duration_l_min ?? 0;
      const rMin = l.duration_r_min ?? 0;
      if (lMin > 0 || rMin > 0) {
        dbfCount += 1;
        dbfMin += lMin + rMin;
      }
    } else if (l.subtype === "pumping") {
      pumpCount += 1;
      pumpMl += (l.amount_l_ml ?? 0) + (l.amount_r_ml ?? 0);
    } else if (l.subtype === "sleep") {
      sleepCount += 1;
      if (l.end_timestamp) {
        sleepMin +=
          (new Date(l.end_timestamp).getTime() -
            new Date(l.timestamp).getTime()) /
          60000;
      }
    } else if (l.subtype === "diaper") {
      if (l.has_pee) diaperPee += 1;
      if (l.has_poop) diaperPoop += 1;
    } else if (l.subtype === "bath") bathCount += 1;
    else if (l.subtype === "med") medCount += 1;
    else if (l.subtype === "temp") tempCount += 1;
  }

  const bullets: string[] = [];
  if (feedingBottleCount > 0) {
    const parts: string[] = [];
    if (feedingMlAsi > 0) parts.push(`ASI ${Math.round(feedingMlAsi)} ml`);
    if (feedingMlSufor > 0)
      parts.push(`Sufor ${Math.round(feedingMlSufor)} ml`);
    bullets.push(
      `🍼 ${feedingBottleCount}× botol${parts.length ? ` (${parts.join(" + ")})` : ""}`,
    );
  }
  if (dbfCount > 0) {
    bullets.push(`🤱 ${dbfCount}× DBF (${fmtDuration(dbfMin)})`);
  }
  if (pumpCount > 0) {
    bullets.push(`💧 ${pumpCount}× Pumping · ${Math.round(pumpMl)} ml`);
  }
  if (sleepCount > 0) {
    bullets.push(
      `😴 ${sleepCount}× Tidur${sleepMin > 0 ? ` (${fmtDuration(Math.round(sleepMin))})` : ""}`,
    );
  }
  if (diaperPee > 0 || diaperPoop > 0) {
    const parts: string[] = [];
    if (diaperPee > 0) parts.push(`${diaperPee}× pipis`);
    if (diaperPoop > 0) parts.push(`${diaperPoop}× pup`);
    bullets.push(`💛 Diaper · ${parts.join(" + ")}`);
  }
  if (bathCount > 0) bullets.push(`🫧 ${bathCount}× Mandi`);
  if (medCount > 0) bullets.push(`💊 ${medCount}× Obat/suplemen`);
  if (tempCount > 0) bullets.push(`🌡️ ${tempCount}× Cek suhu`);

  // Recent timeline — last 8 rows (newest first)
  const sorted = [...inWindow].sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const recent: { time: string; text: string }[] = [];
  for (const l of sorted.slice(0, 8)) {
    const time = fmtTime(l.timestamp);
    const text = brief(l);
    if (text) recent.push({ time, text });
  }

  return { bullets, recent, total: inWindow.length };
}

function brief(l: LogRow): string {
  const label = SUBTYPE_LABEL[l.subtype] ?? l.subtype;
  if (l.subtype === "feeding") {
    if (l.amount_ml != null) {
      const src =
        l.bottle_content === "asi"
          ? "ASI"
          : l.bottle_content === "sufor"
            ? "Sufor"
            : "";
      return `${src ? `${src} ` : ""}${l.amount_ml} ml`;
    }
    const lMin = l.duration_l_min ?? 0;
    const rMin = l.duration_r_min ?? 0;
    if (lMin > 0 || rMin > 0) {
      return `DBF L ${lMin}m / R ${rMin}m`;
    }
    return "DBF";
  }
  if (l.subtype === "pumping") {
    const total = (l.amount_l_ml ?? 0) + (l.amount_r_ml ?? 0);
    const dur =
      pumpDur(l.start_l_at, l.end_l_at) || pumpDur(l.start_r_at, l.end_r_at);
    return `Pumping ${total} ml${dur ? ` · ${dur}m` : ""}`;
  }
  if (l.subtype === "sleep") {
    if (l.end_timestamp) {
      const min = Math.round(
        (new Date(l.end_timestamp).getTime() -
          new Date(l.timestamp).getTime()) /
          60000,
      );
      return `Tidur ${fmtDuration(min)}`;
    }
    return "Tidur (masih berjalan)";
  }
  if (l.subtype === "diaper") {
    const parts: string[] = [];
    if (l.has_pee) parts.push("pipis");
    if (l.has_poop) parts.push("pup");
    return `Diaper ${parts.join("+") || "-"}`;
  }
  if (l.subtype === "temp") return `Suhu ${l.temp_celsius}°C`;
  if (l.subtype === "med")
    return `${l.med_name ?? "Obat"}${l.med_dose ? ` ${l.med_dose}` : ""}`;
  if (l.subtype === "bath") return "Mandi";
  if (l.subtype === "hiccup") return "Cegukan";
  if (l.subtype === "tummy") return "Tummy time";
  return label;
}
