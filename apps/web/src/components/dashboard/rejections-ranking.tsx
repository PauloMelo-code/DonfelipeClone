"use client";

import { useEffect, useState, useCallback } from "react";
import { XCircle, Loader2, TagIcon, Car, Radio } from "lucide-react";
import { DateRangePicker, DateRange } from "./date-range-picker";
import { cn } from "@/lib/utils";

interface Ranking {
  total: number;
  topTags: { tag: string; label: string; count: number }[];
  topModels: { model: string; brand: string | null; count: number }[];
  topSources: { groupId: string; name: string; count: number }[];
}

type Tab = "tags" | "models" | "sources";

export function RejectionsRanking() {
  const today = new Date();
  const [range, setRange] = useState<DateRange>(() => {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29, 0, 0, 0);
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    return { startDate: start, endDate: end, label: "Últimos 30 dias" };
  });
  const [data, setData] = useState<Ranking | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("tags");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/dashboard/rejections-ranking?startDate=${range.startDate.toISOString()}&endDate=${range.endDate.toISOString()}`
      );
      if (res.ok) setData(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const items = data
    ? tab === "tags"
      ? data.topTags.map((t) => ({ key: t.tag, label: t.label, count: t.count, sub: null as string | null }))
      : tab === "models"
        ? data.topModels.map((m) => ({
            key: `${m.brand}-${m.model}`,
            label: m.model,
            count: m.count,
            sub: m.brand,
          }))
        : data.topSources.map((s) => ({ key: s.groupId, label: s.name, count: s.count, sub: null }))
    : [];

  const maxCount = items.reduce((m, x) => Math.max(m, x.count), 1);

  const tabs: { id: Tab; label: string; icon: typeof TagIcon }[] = [
    { id: "tags", label: "Motivos", icon: TagIcon },
    { id: "models", label: "Modelos", icon: Car },
    { id: "sources", label: "Fontes", icon: Radio },
  ];

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <XCircle className="h-4 w-4 text-destructive shrink-0" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
            Ranking de rejeitados
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
          Nenhuma rejeição no período
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xl font-bold">
              {data.total}
              <span className="text-xs font-normal text-muted-foreground ml-1.5">
                rejeitados
              </span>
            </p>
            <div className="flex gap-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-all",
                    tab === t.id
                      ? "bg-brand-gold/10 border-brand-gold/30 text-brand-gold"
                      : "bg-card/50 border-border text-muted-foreground hover:border-white/20"
                  )}
                >
                  <t.icon className="h-3 w-3" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground/60 text-center py-6">
              Sem dados nessa visão
            </p>
          ) : (
            <div className="space-y-1.5">
              {items.map((it) => {
                const pct = (it.count / maxCount) * 100;
                return (
                  <div key={it.key} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0 relative h-7 bg-card/40 rounded-md overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-destructive/15 rounded-md"
                        style={{ width: `${pct}%` }}
                      />
                      <div className="absolute inset-0 flex items-center px-2.5 gap-2">
                        <span className="text-xs font-medium truncate flex-1">
                          {it.sub && (
                            <span className="text-muted-foreground/50 mr-1">{it.sub}</span>
                          )}
                          {it.label}
                        </span>
                        <span className="text-xs font-bold text-destructive shrink-0">
                          {it.count}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "tags" && (
            <p className="text-[10px] text-muted-foreground/40 mt-3">
              Carros podem ter múltiplos motivos — soma pode ser maior que o total
            </p>
          )}
        </>
      )}
    </div>
  );
}
