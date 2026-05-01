// Pure formatting helpers — easy to unit test.

export function fmtTime(ts: string | Date | null | undefined): string {
  if (!ts) return "-";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtDate(ts: string | Date | null | undefined): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function fmtDuration(mins: number): string {
  const m = Math.round(mins);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}j ${rem}m` : `${h}j`;
}

export function timeSince(ts: string | Date): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins}m lalu`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs < 24) return remMins > 0 ? `${hrs}j ${remMins}m lalu` : `${hrs}j lalu`;
  return `${Math.floor(hrs / 24)} hari lalu`;
}
