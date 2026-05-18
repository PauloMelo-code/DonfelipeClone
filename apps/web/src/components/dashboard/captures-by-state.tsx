"use client";

import { useEffect, useState, useCallback } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { DateRangePicker, DateRange } from "./date-range-picker";
import { cn } from "@/lib/utils";

interface CapturesByStateData {
  startDate: string;
  endDate: string;
  total: number;
  states: { state: string; count: number }[];
  unknown: number;
}

interface CapturesByStateProps {
  /** Optional callback when user clicks a state — useful pra navegar pra Pendentes filtrado */
  onStateClick?: (state: string) => void;
}

export function CapturesByState({ onStateClick }: CapturesByStateProps) {
  const today = new Date();
  const [range, setRange] = useState<DateRange>(() => {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6, 0, 0, 0);
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    return { startDate: start, endDate: end, label: "Últimos 7 dias" };
  });
  const [data, setData] = useState<CapturesByStateData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/dashboard/captures-by-state?startDate=${range.startDate.toISOString()}&endDate=${range.endDate.toISOString()}`
      );
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const maxCount = data?.states.reduce((m, s) => Math.max(m, s.count), 1) ?? 1;

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="h-4 w-4 text-cugini-orange shrink-0" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
            Capturas por estado
          </h3>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
        </div>
      ) : !data || data.total === 0 ? (
        <p className="text-sm text-muted-foreground/60 text-center py-8">
          Nenhuma captura no período
        </p>
      ) : (
        <>
          <p className="text-2xl font-bold mb-3">
            {data.total}
            <span className="text-sm font-normal text-muted-foreground ml-1">
              {data.total === 1 ? "captura" : "capturas"} no período
            </span>
          </p>

          <div className="space-y-2">
            {data.states.map((s) => {
              const pct = (s.count / maxCount) * 100;
              const sharePct = data.total > 0 ? (s.count / data.total) * 100 : 0;
              return (
                <button
                  key={s.state}
                  onClick={() => onStateClick?.(s.state)}
                  className={cn(
                    "w-full text-left group",
                    onStateClick && "cursor-pointer"
                  )}
                  disabled={!onStateClick}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-foreground w-12 shrink-0">
                      {s.state}
                    </span>
                    <div className="flex-1 relative h-6 bg-card/40 rounded-md overflow-hidden">
                      <div
                        className={cn(
                          "absolute inset-y-0 left-0 bg-cugini-orange/20 rounded-md transition-all",
                          onStateClick && "group-hover:bg-cugini-orange/30"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                      <div className="absolute inset-0 flex items-center px-2">
                        <span className="text-xs font-bold text-cugini-orange">{s.count}</span>
                        <span className="text-[10px] text-muted-foreground ml-2">
                          {sharePct.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}

            {data.unknown > 0 && (
              <div className="flex items-center gap-3 pt-2 border-t border-white/[0.04]">
                <span className="text-sm text-muted-foreground/60 w-12 shrink-0">?</span>
                <div className="flex-1 flex items-center justify-between text-xs text-muted-foreground/60">
                  <span>Sem estado detectado</span>
                  <span>{data.unknown}</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
