// Compute aggregations atas log rows.

export type LogRow = {
  id: string;
  subtype: string;
  timestamp: string;
  end_timestamp: string | null;
  amount_ml: number | null;
  amount_l_ml: number | null;
  amount_r_ml: number | null;
  duration_l_min: number | null;
  duration_r_min: number | null;
  poop_color: string | null;
  poop_consistency: string | null;
  temp_celsius: number | null;
  med_name: string | null;
  med_dose: string | null;
  notes: string | null;
};

export type TodayStats = {
  suforML: number;
  suforCount: number;
  dbfMin: number;
  dbfCount: number;
  pumpML: number;
  pumpCount: number;
  pipisCount: number;
  poopCount: number;
  sleepMin: number;
  sleepCount: number;
};

function todayStartMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function computeTodayStats(logs: LogRow[]): TodayStats {
  const start = todayStartMs();
  const today = logs.filter((l) => new Date(l.timestamp).getTime() >= start);
  const s: TodayStats = {
    suforML: 0,
    suforCount: 0,
    dbfMin: 0,
    dbfCount: 0,
    pumpML: 0,
    pumpCount: 0,
    pipisCount: 0,
    poopCount: 0,
    sleepMin: 0,
    sleepCount: 0,
  };
  for (const l of today) {
    if (l.subtype === "sufor") {
      s.suforML += l.amount_ml ?? 0;
      s.suforCount += 1;
    } else if (l.subtype === "dbf") {
      s.dbfMin += (l.duration_l_min ?? 0) + (l.duration_r_min ?? 0);
      s.dbfCount += 1;
    } else if (l.subtype === "pumping") {
      s.pumpML += (l.amount_l_ml ?? 0) + (l.amount_r_ml ?? 0);
      s.pumpCount += 1;
    } else if (l.subtype === "pipis") {
      s.pipisCount += 1;
    } else if (l.subtype === "poop") {
      s.poopCount += 1;
    } else if (l.subtype === "sleep") {
      if (l.end_timestamp) {
        s.sleepMin +=
          (new Date(l.end_timestamp).getTime() -
            new Date(l.timestamp).getTime()) /
          60000;
      }
      s.sleepCount += 1;
    }
  }
  s.suforML = Math.round(s.suforML);
  s.dbfMin = Math.round(s.dbfMin);
  s.pumpML = Math.round(s.pumpML);
  s.sleepMin = Math.round(s.sleepMin);
  return s;
}

export type LastByType = {
  milk: LogRow | null;
  pipis: LogRow | null;
  poop: LogRow | null;
  sleep: LogRow | null;
};

export function computeLastByType(logs: LogRow[]): LastByType {
  // logs sudah di-sort DESC dari query — kita reuse asumsi itu, tapi tetap
  // safe-find dengan iterasi.
  const sorted = [...logs].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  return {
    milk: sorted.find((l) => l.subtype === "sufor" || l.subtype === "dbf") ?? null,
    pipis: sorted.find((l) => l.subtype === "pipis") ?? null,
    poop: sorted.find((l) => l.subtype === "poop") ?? null,
    sleep: sorted.find((l) => l.subtype === "sleep") ?? null,
  };
}
