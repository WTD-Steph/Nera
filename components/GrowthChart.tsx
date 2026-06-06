"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  type WhoPoint,
  interpolateWho,
  estimatePercentile,
} from "@/lib/constants/who-percentiles";

export type DataPoint = {
  m: number;
  user?: number;
  isBirth?: boolean;
};

export function GrowthChart({
  title,
  unit,
  refData,
  userPoints,
  currentValue,
  currentAgeMonths,
  babyName,
}: {
  title: string;
  unit: string;
  refData: WhoPoint[];
  userPoints: DataPoint[];
  /** Latest measurement value untuk panel percentile reference. */
  currentValue?: number;
  /** Age (bulan) saat measurement terakhir. */
  currentAgeMonths?: number;
  /** Untuk label di panel ("Nera di P5"). */
  babyName?: string;
}) {
  // Merge ref + user data; keep separate keys so each line draws independently.
  const chartData = [
    ...refData.map((r) => ({
      m: r.m,
      p3: r.p3,
      p50: r.p50,
      p97: r.p97,
    })),
    ...userPoints.map((p) => ({ m: +p.m.toFixed(2), user: p.user })),
  ].sort((a, b) => a.m - b.m);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        <span className="text-xs font-normal text-gray-400">({unit})</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 8, left: -15, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis
            dataKey="m"
            type="number"
            domain={[0, 12]}
            ticks={[0, 2, 4, 6, 8, 10, 12]}
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            label={{
              value: "bulan",
              position: "insideBottom",
              offset: -2,
              style: { fontSize: 10, fill: "#9ca3af" },
            }}
          />
          <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const userPoint = payload.find((p) => p.dataKey === "user");
              if (!userPoint || userPoint.value == null) return null;
              return (
                <div className="rounded-lg border border-gray-100 bg-white px-2 py-1 text-xs shadow">
                  <div className="font-semibold text-gray-700">
                    {(+(label ?? 0)).toFixed(1)} bln
                  </div>
                  <div className="font-bold text-rose-500">
                    {String(userPoint.value)} {unit}
                  </div>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="p3"
            stroke="#e5e7eb"
            strokeWidth={1}
            dot={false}
            strokeDasharray="3 3"
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="p50"
            stroke="#cbd5e1"
            strokeWidth={1.5}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="p97"
            stroke="#e5e7eb"
            strokeWidth={1}
            dot={false}
            strokeDasharray="3 3"
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="user"
            stroke="#f43f5e"
            strokeWidth={2.5}
            dot={{ r: 4, fill: "#f43f5e" }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
      {currentValue != null && currentAgeMonths != null ? (
        <PercentilePanel
          refData={refData}
          unit={unit}
          ageMonths={currentAgeMonths}
          value={currentValue}
          babyName={babyName}
        />
      ) : null}
    </div>
  );
}

function PercentilePanel({
  refData,
  unit,
  ageMonths,
  value,
  babyName,
}: {
  refData: WhoPoint[];
  unit: string;
  ageMonths: number;
  value: number;
  babyName?: string;
}) {
  const ref = interpolateWho(refData, ageMonths);
  const est = estimatePercentile(value, ref);
  const fmt = (v: number) => v.toFixed(1);
  // Highlight band yang Nera ada di dalamnya
  const band = est.band;
  const rows: { label: string; value: number; key: string }[] = [
    { label: "P3", value: ref.p3, key: "p3" },
    { label: "P15", value: ref.p15, key: "p15" },
    { label: "P50 (median)", value: ref.p50, key: "p50" },
    { label: "P85", value: ref.p85, key: "p85" },
    { label: "P97", value: ref.p97, key: "p97" },
  ];
  const inBand = (key: string): boolean => {
    if (band === "<P3" || band === ">P97") return false;
    if (band === "P3–P15") return key === "p3" || key === "p15";
    if (band === "P15–P50") return key === "p15" || key === "p50";
    if (band === "P50–P85") return key === "p50" || key === "p85";
    if (band === "P85–P97") return key === "p85" || key === "p97";
    return false;
  };
  const subjectLabel = babyName ?? "Bayi";
  return (
    <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/40 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        Referensi di usia {ageMonths.toFixed(1)} bln
      </div>
      <div className="mt-2 space-y-1 text-[12px]">
        {rows.map((r) => (
          <div
            key={r.key}
            className={`flex items-center justify-between rounded-md px-2 py-0.5 ${
              inBand(r.key) ? "bg-rose-100/60 font-semibold text-rose-700" : "text-gray-600"
            }`}
          >
            <span>{r.label}</span>
            <span className="tabular-nums">
              {fmt(r.value)} {unit}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[12px]">
        <span className="font-semibold text-rose-700">{subjectLabel}: </span>
        <span className="font-semibold text-gray-900">
          {fmt(value)} {unit}
        </span>{" "}
        <span className="text-gray-600">
          → {band}
          {est.pct != null ? ` (≈ P${est.pct.toFixed(0)})` : ""}
        </span>
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-gray-400">
        WHO standard linear-interpolated antara monthly anchors. Estimasi
        percentile pakai linear interpolation di band tertentu — bukan
        LMS z-score. Untuk evaluasi medis konsultasi dokter anak.
      </p>
    </div>
  );
}
