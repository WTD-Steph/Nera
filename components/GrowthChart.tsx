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
import { type WhoPoint } from "@/lib/constants/who-percentiles";

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
}: {
  title: string;
  unit: string;
  refData: WhoPoint[];
  userPoints: DataPoint[];
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
    </div>
  );
}
