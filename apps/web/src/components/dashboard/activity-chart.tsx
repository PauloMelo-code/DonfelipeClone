"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { DateRangePicker, DateRange } from "./date-range-picker";

interface ChartPoint {
  date: string;
  capturas: number;
  publicacoes: number;
}

interface ActivityChartProps {
  data: ChartPoint[];
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0D0D0F]/95 px-4 py-3 shadow-2xl backdrop-blur-xl">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
        {label}
      </p>
      <div className="space-y-1.5">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center gap-2.5">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: entry.color,
                boxShadow: `0 0 8px ${entry.color}80`,
              }}
            />
            <span className="text-xs text-muted-foreground">
              {entry.dataKey === "capturas" ? "Capturas" : "Publicações"}
            </span>
            <span className="ml-auto text-sm font-semibold tabular-nums text-foreground">
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActiveDot(props: { cx?: number; cy?: number; stroke?: string }) {
  const { cx, cy, stroke } = props;
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={8} fill={stroke} opacity={0.15} />
      <circle cx={cx} cy={cy} r={4} fill={stroke} stroke="#09090B" strokeWidth={2} />
    </g>
  );
}

export function ActivityChart({ data, dateRange, onDateRangeChange }: ActivityChartProps) {
  const totalDays = Math.round(
    (dateRange.endDate.getTime() - dateRange.startDate.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;

  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
          Atividade
        </h3>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Date range picker */}
          <DateRangePicker value={dateRange} onChange={onDateRangeChange} />

          {/* Legend */}
          <div className="flex items-center gap-5 text-xs">
            <div className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  background: "linear-gradient(135deg, #C9973D, #E7C67A)",
                  boxShadow: "0 0 8px rgba(201, 151, 61,0.5)",
                }}
              />
              <span className="text-muted-foreground">Capturas</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  background: "linear-gradient(135deg, #6366F1, #A78BFA)",
                  boxShadow: "0 0 8px rgba(99,102,241,0.5)",
                }}
              />
              <span className="text-muted-foreground">Publicações</span>
            </div>
          </div>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
          >
            <defs>
              <linearGradient id="gradCapturas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E7C67A" stopOpacity={0.4} />
                <stop offset="40%" stopColor="#C9973D" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#C9973D" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gradPublicacoes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.35} />
                <stop offset="40%" stopColor="#6366F1" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#6366F1" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />

            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#8B8B8F" }}
              dy={8}
              interval={totalDays > 20 ? 4 : "preserveStartEnd"}
            />

            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#8B8B8F" }}
              width={40}
              allowDecimals={false}
            />

            <Tooltip
              content={<CustomTooltip />}
              cursor={{
                stroke: "rgba(255,255,255,0.06)",
                strokeWidth: 1,
              }}
            />

            <Area
              type="monotone"
              dataKey="publicacoes"
              stroke="#818CF8"
              strokeWidth={2.5}
              fill="url(#gradPublicacoes)"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              activeDot={(props: any) => <ActiveDot cx={props.cx} cy={props.cy} stroke={props.stroke} />}
              dot={false}
              animationDuration={800}
              animationEasing="ease-in-out"
            />

            <Area
              type="monotone"
              dataKey="capturas"
              stroke="#C9973D"
              strokeWidth={2.5}
              fill="url(#gradCapturas)"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              activeDot={(props: any) => <ActiveDot cx={props.cx} cy={props.cy} stroke={props.stroke} />}
              dot={false}
              animationDuration={800}
              animationEasing="ease-in-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
