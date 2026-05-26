"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { data } from "@/lib/data";

export function OccupancyChart() {
  const series = data.occupancySeries();
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="fillInside" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C8102E" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#C8102E" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
          <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "#7A7A7A" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#7A7A7A" }} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            contentStyle={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.6)",
              background: "rgba(255,255,255,0.85)",
              backdropFilter: "blur(8px)",
              fontSize: 12,
            }}
            labelStyle={{ fontWeight: 700, color: "#1A1A1A" }}
          />
          <Area
            type="monotone"
            dataKey="inside"
            name="Inside"
            stroke="#C8102E"
            strokeWidth={2.5}
            fill="url(#fillInside)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
