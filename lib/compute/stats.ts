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
  has_pee: boolean | null;
  has_poop: boolean | null;
  poop_color: string | null;
  poop_consistency: string | null;
  temp_celsius: number | null;
  med_name: string | null;
  med_dose: string | null;
  bottle_content: "sufor" | "asi" | null;
  consumed_ml: number | null;
  start_l_at: string | null;
  end_l_at: string | null;
  start_r_at: string | null;
  end_r_at: string | null;
  notes: string | null;
};

export type TodayStats = {
  /** Total ml dari feeding entries (sufor portion). DBF tidak masuk sini. */
  feedingMlTotal: number;
  /** Jumlah feeding entry yang punya amount_ml (sufor). */
  feedingMlCount: number;
  /** Total menit DBF. */
  dbfMinTotal: number;
  /** DBF per-sisi (menit). */
  dbfMinL: number;
  dbfMinR: number;
  /** Jumlah feeding entry yang punya durasi DBF. */
  dbfCount: number;
  /** Pumping ml total + count. */
  pumpML: number;
  /** Pumping per-sisi: ml + menit (dari start/end_X_at jika ada). */
  pumpMlL: number;
  pumpMlR: number;
  pumpMinL: number;
  pumpMinR: number;
  pumpCount: number;
  /** Diaper changes — total + breakdown. */
  diaperCount: number;
  diaperPeeCount: number;
  diaperPoopCount: number;
  /** Tidur durasi total (menit dari sleep entries dengan end_timestamp). */
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
    feedingMlTotal: 0,
    feedingMlCount: 0,
    dbfMinTotal: 0,
    dbfMinL: 0,
    dbfMinR: 0,
    dbfCount: 0,
    pumpML: 0,
    pumpMlL: 0,
    pumpMlR: 0,
    pumpMinL: 0,
    pumpMinR: 0,
    pumpCount: 0,
    diaperCount: 0,
    diaperPeeCount: 0,
    diaperPoopCount: 0,
    sleepMin: 0,
    sleepCount: 0,
  };
  for (const l of today) {
    if (l.subtype === "feeding") {
      if (l.amount_ml != null) {
        s.feedingMlTotal += l.amount_ml;
        s.feedingMlCount += 1;
      }
      const lMin = l.duration_l_min ?? 0;
      const rMin = l.duration_r_min ?? 0;
      if (lMin > 0 || rMin > 0) {
        s.dbfMinL += lMin;
        s.dbfMinR += rMin;
        s.dbfMinTotal += lMin + rMin;
        s.dbfCount += 1;
      }
    } else if (l.subtype === "pumping") {
      s.pumpMlL += l.amount_l_ml ?? 0;
      s.pumpMlR += l.amount_r_ml ?? 0;
      s.pumpML += (l.amount_l_ml ?? 0) + (l.amount_r_ml ?? 0);
      if (l.start_l_at && l.end_l_at) {
        const min =
          (new Date(l.end_l_at).getTime() -
            new Date(l.start_l_at).getTime()) /
          60000;
        if (min > 0) s.pumpMinL += min;
      }
      if (l.start_r_at && l.end_r_at) {
        const min =
          (new Date(l.end_r_at).getTime() -
            new Date(l.start_r_at).getTime()) /
          60000;
        if (min > 0) s.pumpMinR += min;
      }
      s.pumpCount += 1;
    } else if (l.subtype === "diaper") {
      s.diaperCount += 1;
      if (l.has_pee) s.diaperPeeCount += 1;
      if (l.has_poop) s.diaperPoopCount += 1;
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
  s.feedingMlTotal = Math.round(s.feedingMlTotal);
  s.dbfMinTotal = Math.round(s.dbfMinTotal);
  s.dbfMinL = Math.round(s.dbfMinL);
  s.dbfMinR = Math.round(s.dbfMinR);
  s.pumpML = Math.round(s.pumpML);
  s.pumpMlL = Math.round(s.pumpMlL);
  s.pumpMlR = Math.round(s.pumpMlR);
  s.pumpMinL = Math.round(s.pumpMinL);
  s.pumpMinR = Math.round(s.pumpMinR);
  s.sleepMin = Math.round(s.sleepMin);
  return s;
}

export type LastByType = {
  feeding: LogRow | null;
  diaper: LogRow | null;
  sleep: LogRow | null;
};

export function computeLastByType(logs: LogRow[]): LastByType {
  const sorted = [...logs].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  return {
    feeding: sorted.find((l) => l.subtype === "feeding") ?? null,
    diaper: sorted.find((l) => l.subtype === "diaper") ?? null,
    sleep: sorted.find((l) => l.subtype === "sleep") ?? null,
  };
}
