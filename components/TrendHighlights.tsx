// Server component (no client hooks needed). Renders narrative bullet
// insights summarizing today's data with status indicators.

export type HighlightsData = {
  // Today
  milkTotalMl: number;
  milkTargetMin: number;
  milkTargetMax: number;
  bottleMl: number;
  dbfMin: number;
  dbfEstimateMl: number;
  dbfRate: number;
  dbfRateSource: "row" | "fixed" | "multiplier" | "pumping" | "default";
  sleepMin: number;
  sleepTargetHoursMin: number;
  sleepTargetHoursMax: number;
  sleepLongestMin: number;
  sleepCount: number;
  peeCount: number;
  peeTargetMin: number;
  poopCount: number;
  poopTargetMin: number;
  feedingCount: number;
  /** After cluster-dedup */
  feedingSessionCount: number;
  feedingMedianMin: number | null;
  // 7-day comparison
  milk7dAvg: number | null;
  sleep7dAvgMin: number | null;
};

function fmtH(min: number): string {
  if (min < 60) return `${Math.round(min)} mnt`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}j ${m}m` : `${h} jam`;
}

type Tone = "ok" | "warn" | "alert" | "info";
const TONE_STYLE: Record<Tone, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  alert: "border-red-200 bg-red-50 text-red-800",
  info: "border-gray-200 bg-gray-50 text-gray-700",
};
const TONE_ICON: Record<Tone, string> = {
  ok: "✓",
  warn: "⚠",
  alert: "🚨",
  info: "ℹ",
};

function buildBullets(d: HighlightsData): { tone: Tone; text: string }[] {
  const bullets: { tone: Tone; text: string }[] = [];

  // Susu
  {
    const pct = d.milkTargetMin > 0 ? d.milkTotalMl / d.milkTargetMin : 0;
    const tone: Tone = pct >= 1 ? "ok" : pct >= 0.6 ? "warn" : "alert";
    const status =
      pct >= 1
        ? "on target"
        : pct >= 0.6
          ? "agak kurang"
          : "jauh dari target";
    bullets.push({
      tone,
      text: `🍼 Susu hari ini ${d.milkTotalMl} ml (${d.bottleMl} botol + ≈${d.dbfEstimateMl} DBF) dari target ${d.milkTargetMin}–${d.milkTargetMax} ml — ${status}`,
    });
  }

  // Tidur + longest stretch
  {
    const hours = d.sleepMin / 60;
    const pct = hours / d.sleepTargetHoursMin;
    const tone: Tone = pct >= 1 ? "ok" : pct >= 0.6 ? "warn" : "alert";
    const longest =
      d.sleepLongestMin > 0 ? `, stretch terlama ${fmtH(d.sleepLongestMin)}` : "";
    const status =
      pct >= 1 ? "cukup" : pct >= 0.6 ? "kurang sedikit" : "kurang banyak";
    bullets.push({
      tone,
      text: `🌙 Tidur ${fmtH(d.sleepMin)} dari target ${d.sleepTargetHoursMin}–${d.sleepTargetHoursMax} jam (${d.sleepCount} sesi${longest}) — ${status}`,
    });
  }

  // Diaper
  {
    const peePct =
      d.peeTargetMin > 0 ? d.peeCount / d.peeTargetMin : 0;
    const tone: Tone = peePct >= 1 ? "ok" : peePct >= 0.5 ? "warn" : "alert";
    const status =
      peePct >= 1
        ? "hidrasi cukup"
        : peePct >= 0.5
          ? "perhatikan"
          : "perlu lebih banyak feeding";
    bullets.push({
      tone,
      text: `💛 Pipis ${d.peeCount}× (target ${d.peeTargetMin}+) · 💩 BAB ${d.poopCount}× — ${status}`,
    });
  }

  // Feeding pattern
  if (d.feedingMedianMin != null && d.feedingSessionCount >= 2) {
    const m = d.feedingMedianMin;
    let tone: Tone = "info";
    let status = "pola normal newborn";
    if (m < 60) {
      tone = "warn";
      status = "interval pendek — bisa cluster feeding atau growth spurt";
    } else if (m >= 60 && m < 240) {
      tone = "ok";
      status = "interval ideal newborn (1–4 jam)";
    } else if (m >= 240) {
      tone = "warn";
      status = "interval panjang — pastikan cukup minum";
    }
    bullets.push({
      tone,
      text: `🍼 Median jeda antar feeding: ${fmtH(m)} (${d.feedingSessionCount} sesi) — ${status}`,
    });
  }

  // DBF rate sanity check: literature 3-5 ml/min for newborn-6mo. Flag
  // anything below 3 as potentially under-counting milk intake.
  if (d.dbfMin > 0 && d.dbfRate < 3) {
    const sourceLabel =
      d.dbfRateSource === "row"
        ? "per-row override"
        : d.dbfRateSource === "fixed"
          ? "fixed override"
          : d.dbfRateSource === "multiplier"
            ? "multiplier × pumping"
            : d.dbfRateSource === "pumping"
              ? "dari pumping terakhir"
              : "default literatur";
    bullets.push({
      tone: "info",
      text: `ℹ Rate DBF ${d.dbfRate.toFixed(1)} ml/menit (${sourceLabel}) di bawah literatur 3–5 ml/menit. Estimasi mungkin under-count. Bisa adjust di Profile → Estimasi DBF.`,
    });
  }

  // 7-day trend
  if (d.milk7dAvg != null && d.milk7dAvg > 0) {
    const delta = d.milkTotalMl - d.milk7dAvg;
    const sign = delta > 0 ? "↑" : delta < 0 ? "↓" : "≈";
    const pct = Math.round((Math.abs(delta) / d.milk7dAvg) * 100);
    bullets.push({
      tone: "info",
      text: `${sign} Susu hari ini ${pct}% ${
        delta > 0 ? "lebih banyak" : delta < 0 ? "lebih sedikit" : "sama"
      } dari rata-rata 7 hari (${Math.round(d.milk7dAvg)} ml)`,
    });
  }

  return bullets;
}

export function TrendHighlights({ data }: { data: HighlightsData }) {
  const bullets = buildBullets(data);
  if (bullets.length === 0) return null;
  return (
    <div className="space-y-2">
      <h2 className="px-1 text-sm font-semibold text-gray-700">
        Highlights Hari Ini
      </h2>
      <div className="space-y-2">
        {bullets.map((b, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-snug ${TONE_STYLE[b.tone]}`}
          >
            <span aria-hidden className="flex-shrink-0 font-bold">
              {TONE_ICON[b.tone]}
            </span>
            <span>{b.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
