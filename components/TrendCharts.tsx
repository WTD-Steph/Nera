"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
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
  /** Sufor (formula) bottle ml. */
  suforMl: number;
  /** ASI bottle ml only (NOT including DBF estimate). Separated from DBF
   * supaya bisa di-stack berbeda warna di chart Susu. */
  asiBottleMl: number;
  /** ASI total: bottle ASI + DBF estimate (semua breastmilk). Dipertahankan
   * untuk backward compat + total label di chart. */
  asiMl: number;
  bottleMl: number;
  dbfEstimateMl: number;
  /** DBF estimate per sisi, di-split proportional to duration_l/r. */
  dbfEstimateMlL: number;
  dbfEstimateMlR: number;
  milkTotalMl: number;
  pumpMl: number;
  pumpMlL: number;
  pumpMlR: number;
  /** Jumlah sesi pumping (count of pumping logs) per hari. */
  pumpSessions: number;
  /** Jumlah sesi DBF (feeding logs dengan duration_l/r > 0) per hari. */
  dbfSessions: number;
  /** Jumlah sesi feeding total per hari, dengan cluster-dedup 60 min
   * (feeding <1 jam dianggap satu sesi). Mencakup bottle + DBF. */
  feedingSessions: number;
  sleepMin: number;
  /** Sleep min per quality bucket. Sesi tanpa quality tracked → null. */
  sleepMinNyenyak: number;
  sleepMinGelisah: number;
  sleepMinSeringBangun: number;
  sleepMinUnknown: number;
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
  void SKY;
  if (daily.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400 shadow-sm">
        Belum ada data 14 hari terakhir.
      </div>
    );
  }

  // Sleep in hours for nicer y-axis + per-quality breakdown for stack
  const sleepHoursData = daily.map((d) => ({
    ...d,
    sleepHours: +(d.sleepMin / 60).toFixed(1),
    sleepHoursNyenyak: +(d.sleepMinNyenyak / 60).toFixed(1),
    sleepHoursGelisah: +(d.sleepMinGelisah / 60).toFixed(1),
    sleepHoursSeringBangun: +(d.sleepMinSeringBangun / 60).toFixed(1),
    sleepHoursUnknown: +(d.sleepMinUnknown / 60).toFixed(1),
  }));

  // ─── Chart elements as variables, declared in order of usage ────────

  const chartSusu = (
    <ChartCard
      title="🍼 Susu / hari"
      subtitle="Total intake = Sufor + ASI botol + DBF (estimasi). Target line naik per umur + berat."
      unit="ml"
      anchorId="susu"
    >
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={daily} margin={{ top: 18, right: 8, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="short" tick={{ fontSize: 10, fill: "#9ca3af" }} />
          <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(v, name) => {
              const label =
                name === "suforMl"
                  ? "Sufor"
                  : name === "asiBottleMl"
                    ? "ASI botol"
                    : name === "dbfEstimateMl"
                      ? "DBF (estimasi)"
                      : name === "milkTargetMin"
                        ? "Target min"
                        : name === "milkTargetMax"
                          ? "Target max"
                          : String(name);
              return [`${v} ml`, label];
            }}
          />
          <Bar dataKey="suforMl" stackId="m" fill={AMBER} />
          <Bar dataKey="asiBottleMl" stackId="m" fill={ROSE} />
          <Bar dataKey="dbfEstimateMl" stackId="m" fill={ROSE_LIGHT}>
            <LabelList
              dataKey="milkTotalMl"
              position="top"
              style={{ fontSize: 9, fill: "#374151", fontWeight: 600 }}
              formatter={(v) => {
                const n = typeof v === "number" ? v : Number(v ?? 0);
                return n > 0 ? String(n) : "";
              }}
            />
          </Bar>
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
          { color: AMBER, label: "Sufor" },
          { color: ROSE, label: "ASI botol" },
          { color: ROSE_LIGHT, label: "DBF (estimasi)" },
          { color: EMERALD, label: "Target min/max (per usia)", style: "line" },
        ]}
      />
    </ChartCard>
  );

  const chartSesiFeeding = (
    <ChartCard
      title="🔢 Sesi Feeding / hari"
      subtitle="Bottle + DBF. Feeding dalam jeda <1 jam digabung jadi 1 sesi."
      unit="×"
      anchorId="feeding-sessions"
    >
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={daily} margin={{ top: 18, right: 8, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="short" tick={{ fontSize: 10, fill: "#9ca3af" }} />
          <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(v) => [`${v}× sesi`, "Feeding"]}
          />
          <Bar dataKey="feedingSessions" fill={ROSE} radius={[4, 4, 0, 0]}>
            <LabelList
              dataKey="feedingSessions"
              position="top"
              style={{ fontSize: 9, fill: "#374151", fontWeight: 600 }}
              formatter={(v) => {
                const n = typeof v === "number" ? v : Number(v ?? 0);
                return n > 0 ? String(n) : "";
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-[11px] text-gray-500">
        AAP guideline newborn: 8–12× sehari.
      </p>
    </ChartCard>
  );

  const chartIntervalFeeding = (
    <ChartCard
      title="⏱ Distribusi Interval Antar Feeding"
      subtitle={
        feedingMedianMin != null
          ? `Median ${formatHour(feedingMedianMin)} antar sesi (sesudah cluster <1 jam)`
          : "Belum cukup data"
      }
      unit="×"
      anchorId="feeding-interval"
    >
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={feedingIntervals} margin={{ top: 5, right: 8, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} />
          <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(v) => [`${v}× feeding`, "Jumlah"]}
          />
          <Bar dataKey="count" fill={ROSE} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-[11px] text-gray-500">
        Interval ideal newborn 2–4 jam. Memendek = growth spurt / cluster.
        Memanjang = mulai stretch.
      </p>
    </ChartCard>
  );

  const chartDbfFreq = (
    <ChartCard
      title="🤱 Frekuensi DBF / hari"
      subtitle="Sesi DBF saja (subset dari Sesi Feeding). Cluster jeda <2 jam."
      unit="×"
      anchorId="dbf-freq"
    >
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={daily} margin={{ top: 5, right: 8, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="short" tick={{ fontSize: 10, fill: "#9ca3af" }} />
          <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(v) => [`${v}×`, "Sesi DBF"]}
          />
          <Bar dataKey="dbfSessions" fill={ROSE} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  const chartAsiPerSisi = (
    <ChartCard
      title="💧 Output ASI per sisi"
      subtitle="Pumping + DBF (estimasi) split kiri vs kanan — total ASI per hari"
      unit="ml"
      anchorId="asi-per-sisi"
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={daily.map((d) => ({
            ...d,
            totalAsi:
              d.pumpMlL + d.dbfEstimateMlL + d.pumpMlR + d.dbfEstimateMlR,
          }))}
          margin={{ top: 18, right: 8, left: -10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="short" tick={{ fontSize: 10, fill: "#9ca3af" }} />
          <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(v, name) => {
              const label =
                name === "pumpMlL"
                  ? "Pumping kiri"
                  : name === "dbfEstimateMlL"
                    ? "DBF kiri (est)"
                    : name === "pumpMlR"
                      ? "Pumping kanan"
                      : name === "dbfEstimateMlR"
                        ? "DBF kanan (est)"
                        : String(name);
              return [`${v} ml`, label];
            }}
          />
          <Bar dataKey="pumpMlL" stackId="asi" fill="#f59e0b" />
          <Bar dataKey="dbfEstimateMlL" stackId="asi" fill="#fcd34d" />
          <Bar dataKey="pumpMlR" stackId="asi" fill="#f43f5e" />
          <Bar dataKey="dbfEstimateMlR" stackId="asi" fill="#fda4af">
            <LabelList
              dataKey="totalAsi"
              position="top"
              style={{ fontSize: 9, fill: "#374151", fontWeight: 600 }}
              formatter={(v) => {
                const n = typeof v === "number" ? v : Number(v ?? 0);
                return n > 0 ? String(n) : "";
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <Legend
        items={[
          { color: "#f59e0b", label: "Pumping kiri" },
          { color: "#fcd34d", label: "DBF kiri (est)" },
          { color: "#f43f5e", label: "Pumping kanan" },
          { color: "#fda4af", label: "DBF kanan (est)" },
        ]}
      />
      <p className="mt-2 text-[11px] text-gray-500">
        DBF estimasi pakai rate priority chain (per-row override → profile →
        pumping avg → default 4 ml/min) × effectiveness factor (efektif/sedang/
        kurang_efektif = 1.0/0.8/0.6).
      </p>
    </ChartCard>
  );

  const chartSesiPumping = (
    <ChartCard
      title="🧪 Sesi Pumping · avg per sesi"
      subtitle="Jumlah sesi (bar) + avg ml/sesi (garis). Cluster jeda <2 jam."
      unit="× / ml"
      anchorId="pumping-sessions"
    >
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart
          data={daily.map((d) => ({
            ...d,
            pumpAvgPerSession:
              d.pumpSessions > 0 ? Math.round(d.pumpMl / d.pumpSessions) : 0,
          }))}
          margin={{ top: 5, right: 8, left: -10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="short" tick={{ fontSize: 10, fill: "#9ca3af" }} />
          <YAxis
            yAxisId="count"
            orientation="left"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="avg"
            orientation="right"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(v, name) => {
              if (name === "pumpSessions") return [`${v}×`, "Sesi"];
              if (name === "pumpAvgPerSession") return [`${v} ml`, "Avg / sesi"];
              return [String(v), String(name)];
            }}
          />
          <Bar
            yAxisId="count"
            dataKey="pumpSessions"
            fill="#fbbf24"
            radius={[4, 4, 0, 0]}
          />
          <Line
            yAxisId="avg"
            type="monotone"
            dataKey="pumpAvgPerSession"
            stroke="#b45309"
            strokeWidth={2}
            dot={{ r: 3, fill: "#b45309" }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <Legend
        items={[
          { color: "#fbbf24", label: "Jumlah sesi (kiri)" },
          { color: "#b45309", label: "Avg ml/sesi (kanan)", style: "line" },
        ]}
      />
    </ChartCard>
  );

  const chartDiaper = (
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
          <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} />
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
  );

  const chartTidur = (
    <ChartCard
      title="😴 Tidur / hari"
      subtitle="Stack by quality · cross-day di-split · target naik seiring usia"
      unit="jam"
      anchorId="tidur"
    >
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={sleepHoursData} margin={{ top: 5, right: 8, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="short" tick={{ fontSize: 10, fill: "#9ca3af" }} />
          <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(v, name) => {
              const label =
                name === "sleepHoursNyenyak"
                  ? "Nyenyak"
                  : name === "sleepHoursGelisah"
                    ? "Gelisah"
                    : name === "sleepHoursSeringBangun"
                      ? "Sering bangun"
                      : name === "sleepHoursUnknown"
                        ? "Tidak dicatat"
                        : name === "sleepHoursMin"
                          ? "Target min"
                          : name === "sleepHoursMax"
                            ? "Target max"
                            : String(name);
              return [`${v} jam`, label];
            }}
          />
          <Bar dataKey="sleepHoursNyenyak" stackId="s" fill={EMERALD} />
          <Bar dataKey="sleepHoursGelisah" stackId="s" fill={AMBER} />
          <Bar dataKey="sleepHoursSeringBangun" stackId="s" fill="#ef4444" />
          <Bar dataKey="sleepHoursUnknown" stackId="s" fill="#9ca3af" />
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
      <Legend
        items={[
          { color: EMERALD, label: "Nyenyak" },
          { color: AMBER, label: "Gelisah" },
          { color: "#ef4444", label: "Sering bangun" },
          { color: "#9ca3af", label: "Tidak dicatat" },
        ]}
      />
    </ChartCard>
  );

  const chartSleepHeatmap = (
    <ChartCard
      title="🗓 Pola Tidur · heatmap 14 hari"
      subtitle="Menit tidur per jam (lebih gelap = lebih lama)"
      unit="jam"
      anchorId="sleep-heatmap"
    >
      <SleepHeatmap rows={sleepHeatmap} />
    </ChartCard>
  );

  // ─── Restructured layout dengan section heading ─────────────────────

  return (
    <div className="space-y-6">
      <Section
        title="Intake — Yang masuk"
        emoji="🍼"
        intro="Total ml dikonsumsi + pola frequency. Cek apakah cukup minum."
      >
        {chartSusu}
        {chartSesiFeeding}
        {chartIntervalFeeding}
        {chartDbfFreq}
      </Section>

      <Section
        title="Produksi ASI"
        emoji="💧"
        intro="Output ASI ibu (pumping + DBF estimasi). Cek konsistensi + balance L/R."
      >
        {chartAsiPerSisi}
        {chartSesiPumping}
      </Section>

      <Section
        title="Output — Diaper"
        emoji="🧷"
        intro="Pipis + BAB. Indikator hidrasi & pencernaan."
      >
        {chartDiaper}
      </Section>

      <Section
        title="Istirahat — Tidur"
        emoji="😴"
        intro="Quality breakdown + heatmap distribusi jam tidur."
      >
        {chartTidur}
        {chartSleepHeatmap}
      </Section>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function Section({
  title,
  emoji,
  intro,
  children,
}: {
  title: string;
  emoji: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="px-1">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
          <span aria-hidden className="text-base">
            {emoji}
          </span>
          {title}
        </h2>
        {intro ? (
          <p className="mt-0.5 pl-6 text-[11px] leading-snug text-gray-400">
            {intro}
          </p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
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
  items: { color: string; label: string; style?: "square" | "line" }[];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {it.style === "line" ? (
            <span
              aria-hidden
              className="inline-block h-[2px] w-4"
              style={{
                background: `repeating-linear-gradient(to right, ${it.color} 0 4px, transparent 4px 7px)`,
              }}
            />
          ) : (
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: it.color }}
            />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}
