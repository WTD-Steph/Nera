// Pure formatting helpers. All wall-clock display is locked to
// Asia/Jakarta (GMT+7) so the same string renders on Vercel UTC server
// and on a client browser regardless of its local timezone — eliminates
// SSR/CSR hydration mismatch and shows times the user actually expects.

const TZ = "Asia/Jakarta";

export function fmtTime(ts: string | Date | null | undefined): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleTimeString("id-ID", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function fmtDate(ts: string | Date | null | undefined): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString("id-ID", {
    timeZone: TZ,
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
