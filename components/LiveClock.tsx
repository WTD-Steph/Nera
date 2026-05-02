"use client";

import { useEffect, useState } from "react";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function fmt(d: Date, withSeconds: boolean): string {
  // Locked to Asia/Jakarta + en-GB locale (24h with colon) so SSR+CSR
  // render identically — avoids hydration mismatch.
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return withSeconds
    ? `${get("hour")}:${get("minute")}:${get("second")}`
    : `${get("hour")}:${get("minute")}`;
}

export function LiveClock({
  withSeconds = false,
  className,
}: {
  withSeconds?: boolean;
  className?: string;
}) {
  // Defer Date.now() to mount to avoid SSR/CSR hydration drift.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const interval = withSeconds ? 1000 : 30000;
    const id = setInterval(() => setNow(new Date()), interval);
    return () => clearInterval(id);
  }, [withSeconds]);
  if (!now) {
    return (
      <span className={className}>{withSeconds ? "--:--:--" : "--:--"}</span>
    );
  }
  return <span className={className}>{fmt(now, withSeconds)}</span>;
}

const HARI = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];
const BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export function LiveDate({ className }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    // Update once per minute is fine for date display
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <span className={className}>—</span>;
  // Use Asia/Jakarta-aware formatter for the day-of-week + date
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = parseInt(get("day"), 10);
  const month = parseInt(get("month"), 10) - 1;
  const year = parseInt(get("year"), 10);
  const weekdayShort = get("weekday");
  // Map en-US short weekday → Indonesian
  const dayMap: Record<string, string> = {
    Sun: HARI[0]!,
    Mon: HARI[1]!,
    Tue: HARI[2]!,
    Wed: HARI[3]!,
    Thu: HARI[4]!,
    Fri: HARI[5]!,
    Sat: HARI[6]!,
  };
  const dayName = dayMap[weekdayShort] ?? weekdayShort;
  const monthName = BULAN[month] ?? "";
  return (
    <span className={className}>
      {dayName}, {day} {monthName} {year}
    </span>
  );
}
