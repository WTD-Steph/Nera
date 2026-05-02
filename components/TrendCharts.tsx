"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type DailyAgg = {
  date: string;
  short: string;
  bottleMl: number;
  dbfEstimateMl: number;
  milkTotalMl: number;
  pumpMl: number;
  pumpMlL: number;
  pumpMlR: number;
  sleepMin: number;
  peeCount: number;
  poopCount: number;
  /** Per-day target milk range — varies as baby ages over 14 days. */
  milkTargetMin: number | null;
  milkTargetMax: number | null;
  /** Per-day target sleep hours range. */
  sleepHoursMin: number | null;
  sleepHoursMax: number | null;
};

export type SleepHeatmapRow = {
  date: string;
  short: string;
  /** length 24, minutes of sleep during that hour bucket */
  hours: number[];
};

export type FeedingIntervalBucket = {
  label: string;
  /** in minutes (inclusive) */
  minMin: number;
  /** in minutes (exclusive); null = open-ended */
  maxMin: number | null;
  count: number;
};

export type TrendTargets = {
  milkMin: number;
  milkMax: number;
  sleepHoursMin: number;
  sleepHoursMax: number;
  peeMin: number;
  peeMax: number;
  poopMin: number;
  poopMax: number;
};

const ROSE = "#f43f5e";
const ROSE_LIGHT = "#fda4af";
const EMERALD = "#10b981";
const SKY = "#0ea5e9";
const AMBER = "#f59e0b";

export function TrendCharts({
  daily,
  targets,
  sleepHeatmap,
  feedingIntervals,
  feedingMedianMin,
}: {
  daily: DailyAgg[];
  targets: TrendTargets;
  sleepHeatmap: SleepHeatmapRow[];
  feedingIntervals: FeedingIntervalBucket[];
  feedingMedianMin: number | null;
}) {
  if (daily.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400 shadow-sm">
        Belum ada data 14 hari terakhir.
      </div>
    );
  }

  // Sleep in hours for nicer y-axis
  const sleepHoursData = daily.map((d) => ({
    ...d,
    sleepHours: +(d.sleepMin / 60).toFixed(1),
  }));

  return (
    <div className="space-y-4">
      <ChartCard
        title="🍼 Susu / hari"
        subtitle="Target naik seiring usia bayi"
        unit="ml"
        anchorId="susu"
      >
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={daily} margin={{ top: 5, right: 8, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="short" tick={{ fontSize: 10, fill: "#9ca3af" }} />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(v, name) => {
                const label =
                  name === "bottleMl"
                    ? "Botol"
                    : name === "dbfEstimateMl"
                      ? "DBF estimate"
                      : name === "milkTargetMin"
                        ? "Target min"
                        : name === "milkTargetMax"
                          ? "Target max"
                          : String(name);
                return [`${v} ml`, label];
              }}
            />
            <Bar dataKey="bottleMl" stackId="m" fill={ROSE} />
            <Bar dataKey="dbfEstimateMl" stackId="m" fill={ROSE_LIGHT} />
            <Line
              type="stepAfter"
              dataKey="milkTargetMin"
              stroke={EMERALD}
              strokeDasharray="4 3"
              strokeWidth={1.5}
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="stepAfter"
              dataKey="milkTargetMax"
              stroke={EMERALD}
              strokeDasharray="4 3"
              strokeWidth={1.5}
              strokeOpacity={0.5}
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <Legend
          items={[
            { color: ROSE, label: "Botol (sufor + ASI)" },
            { color: ROSE_LIGHT, label: "DBF (estimate)" },
            { color: EMERALD, label: "Target min/max (per usia)" },
          ]}
        />
      </ChartCard>

      <ChartCard
        title="🌙 Tidur / hari"
        subtitle="Target naik seiring usia · cross-day di-split"
        unit="jam"
        anchorId="tidur"
      >
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart
            data={sleepHoursData}
            margin={{ top: 5, right: 8, left: -10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="short" tick={{ fontSize: 10, fill: "#9ca3af" }} />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(v, name) => {
                const label =
                  name === "sleepHours"
                    ? "Tidur"
                    : name === "sleepHoursMin"
                      ? "Target min"
                      : name === "sleepHoursMax"
                        ? "Target max"
                        : String(name);
                return [`${v} jam`, label];
              }}
            />
            <Bar dataKey="sleepHours" fill={SKY} radius={[4, 4, 0, 0]} />
            <Line
              type="stepAfter"
              dataKey="sleepHoursMin"
              stroke={EMERALD}
              strokeDasharray="4 3"
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="stepAfter"
              dataKey="sleepHoursMax"
              stroke={EMERALD}
              strokeDasharray="4 3"
              strokeWidth={1.5}
              strokeOpacity={0.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="💧 Pumping / hari"
        subtitle="Stacked Kiri (bawah) + Kanan (atas)"
        unit="ml"
        anchorId="pumping"
      >
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={daily} margin={{ top: 5, right: 8, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="short" tick={{ fontSize: 10, fill: "#9ca3af" }} />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(v, name) => {
                const label =
                  name === "pumpMlL"
                    ? "Kiri"
                    : name === "pumpMlR"
                      ? "Kanan"
                      : String(name);
                return [`${v} ml`, label];
              }}
            />
            <Bar dataKey="pumpMlL" stackId="p" fill="#f59e0b" />
            <Bar dataKey="pumpMlR" stackId="p" fill="#fbbf24" />
          </BarChart>
        </ResponsiveContainer>
        <Legend
          items={[
            { color: "#f59e0b", label: "Kiri" },
            { color: "#fbbf24", label: "Kanan" },
          ]}
        />
      </ChartCard>

      <ChartCard
        title="🧷 Diaper / hari"
        subtitle={`Pipis target ${targets.peeMin}+, BAB ${targets.poopMin}–${targets.poopMax}`}
        unit="×"
        anchorId="diaper"
      >
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={daily} margin={{ top: 5, right: 8, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="short" tick={{ fontSize: 10, fill: "#9ca3af" }} />
            <YAxis
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(v, name) => {
                const label = name === "peeCount" ? "Pipis" : "BAB";
                return [`${v}×`, label];
              }}
            />
            <ReferenceLine
              y={targets.peeMin}
              stroke={EMERALD}
              strokeDasharray="3 3"
              strokeOpacity={0.5}
              label={{
                value: `min ${targets.peeMin}`,
                fill: EMERALD,
                fontSize: 9,
                position: "right",
              }}
            />
            <Bar dataKey="peeCount" fill="#fbbf24" radius={[4, 4, 0, 0]}>
              {daily.map((_, i) => (
                <Cell key={i} fill="#fbbf24" />
              ))}
            </Bar>
            <Bar dataKey="poopCount" fill="#a16207" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <Legend
          items={[
            { color: "#fbbf24", label: "💛 Pipis" },
            { color: "#a16207", label: "💩 BAB" },
          ]}
        />
      </ChartCard>

      <ChartCard
        title="🌙 Pola Tidur · 14 hari"
        subtitle="Heatmap menit tidur per jam (lebih gelap = lebih lama)"
        unit="jam"
      >
        <SleepHeatmap rows={sleepHeatmap} />
      </ChartCard>

      <ChartCard
        title="🍼 Interval Feeding"
        subtitle={
          feedingMedianMin != null
            ? `Median ${formatHour(feedingMedianMin)} antar feeding`
            : "Belum cukup data"
        }
        unit="×"
      >
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={feedingIntervals}
            margin={{ top: 5, right: 8, left: -10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} />
            <YAxis
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(v) => [`${v}× feeding`, "Jumlah"]}
            />
            <Bar dataKey="count" fill={ROSE} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-2 text-[11px] text-gray-500">
          Newborn umumnya feeding tiap 2–4 jam (10–14× sehari). Interval
          memendek = baby tumbuh, lebih sering minum. Memanjang = mulai
          stretch interval saat siap.
        </p>
      </ChartCard>
    </div>
  );
}

function SleepHeatmap({ rows }: { rows: SleepHeatmapRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-gray-400">
        Belum ada data tidur.
      </div>
    );
  }
  // Find max minutes/hour across the matrix for normalization
  let max = 0;
  for (const r of rows) {
    for (const m of r.hours) if (m > max) max = m;
  }
  if (max === 0) max = 1;

  const cellColor = (mins: number): string => {
    if (mins <= 0) return "rgba(99, 102, 241, 0.05)";
    const intensity = Math.min(1, mins / max);
    // Indigo-violet gradient (more saturated as intensity grows)
    const opacity = 0.15 + intensity * 0.7;
    return `rgba(99, 102, 241, ${opacity.toFixed(3)})`;
  };

  return (
    <div className="space-y-1">
      {/* Hour axis */}
      <div className="flex items-center gap-0.5 pl-12 text-[9px] text-gray-400">
        {Array.from({ length: 24 }).map((_, h) => (
          <span
            key={h}
            className="flex-1 text-center"
            style={{ minWidth: 0 }}
          >
            {h % 4 === 0 ? h : ""}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <div key={row.date} className="flex items-center gap-0.5">
          <span className="w-12 truncate pr-1 text-right text-[10px] text-gray-500">
            {row.short}
          </span>
          {row.hours.map((mins, h) => (
            <div
              key={h}
              className="flex-1 rounded-sm"
              style={{
                background: cellColor(mins),
                aspectRatio: "1",
                minWidth: 0,
              }}
              title={`${row.short} ${String(h).padStart(2, "0")}:00 — ${Math.round(mins)} mnt`}
            />
          ))}
        </div>
      ))}
      <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-400">
        <span>Sedikit</span>
        <div
          className="h-2 flex-1 rounded-full"
          style={{
            background:
              "linear-gradient(to right, rgba(99,102,241,0.05), rgba(99,102,241,0.85))",
          }}
        />
        <span>Banyak</span>
      </div>
    </div>
  );
}

function formatHour(min: number): string {
  if (min < 60) return `${Math.round(min)} mnt`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}j ${m}m` : `${h} jam`;
}

function ChartCard({
  title,
  subtitle,
  unit,
  anchorId,
  children,
}: {
  title: string;
  subtitle?: string;
  unit: string;
  anchorId?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={anchorId}
      className="scroll-mt-4 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm"
    >
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        <span className="text-xs font-normal text-gray-400">({unit})</span>
      </div>
      {subtitle ? (
        <div className="mb-2 text-[11px] text-gray-500">{subtitle}</div>
      ) : null}
      {children}
    </div>
  );
}

function Legend({
  items,
}: {
  items: { color: string; label: string }[];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}
