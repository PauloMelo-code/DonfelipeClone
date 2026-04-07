"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Header } from "@/components/layout/header";
import { StatCard } from "@/components/dashboard/stat-card";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { StatCardSkeleton, ChartSkeleton } from "@/components/dashboard/skeleton-card";
import { DateRange } from "@/components/dashboard/date-range-picker";
import { Car, Clock, Send, TrendingUp } from "lucide-react";

interface DashboardData {
  vehicles: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    published: number;
  };
  captures: { today: number; week: number; month: number };
  publications: { total: number; today: number };
  groups: { source: number; target: number };
  rates: { approval: string };
}

interface ChartPoint {
  date: string;
  capturas: number;
  publicacoes: number;
}

export default function DashboardPage() {
  const today = new Date();
  const [data, setData] = useState<DashboardData | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartRange, setChartRange] = useState<DateRange>({
    startDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13, 0, 0, 0, 0),
    endDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999),
    label: "Últimos 14 dias",
  });

  const fetchData = useCallback(async () => {
    try {
      const [dashRes, chartRes] = await Promise.all([
        fetch("/api/dashboard"),
        fetch(`/api/dashboard/chart?startDate=${chartRange.startDate.toISOString()}&endDate=${chartRange.endDate.toISOString()}`),
      ]);
      if (dashRes.ok) setData(await dashRes.json());
      if (chartRes.ok) setChartData(await chartRes.json());
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [chartRange]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  };

  return (
    <>
      <Header
        title={`${greeting()}!`}
        subtitle="Visao geral do sistema Cugini Repasses"
        live
      />

      <div className="p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {loading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : (
            <motion.div
              className="contents"
              initial="hidden"
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
            >
              <StatCard
                title="Veiculos Pendentes"
                value={data?.vehicles.pending ?? 0}
                icon={<Clock className="h-5 w-5" />}
              />
              <StatCard
                title="Capturas Hoje"
                value={data?.captures.today ?? 0}
                icon={<Car className="h-5 w-5" />}
              />
              <StatCard
                title="Publicacoes Hoje"
                value={data?.publications.today ?? 0}
                icon={<Send className="h-5 w-5" />}
              />
              <StatCard
                title="Taxa de Aprovacao"
                value={data ? parseFloat(data.rates.approval) : 0}
                suffix="%"
                icon={<TrendingUp className="h-5 w-5" />}
              />
            </motion.div>
          )}
        </div>

        {/* Activity Chart */}
        {loading ? (
          <ChartSkeleton />
        ) : chartData.length > 0 && (
          <ActivityChart
            data={chartData}
            dateRange={chartRange}
            onDateRangeChange={setChartRange}
          />
        )}

        {/* Summary Cards */}
        {!loading && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="glass rounded-2xl p-6">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
                Resumo de Veiculos
              </h3>
              <div className="space-y-3">
                {[
                  { label: "Total capturados", value: data?.vehicles.total ?? 0, color: "text-foreground" },
                  { label: "Aprovados", value: data?.vehicles.approved ?? 0, color: "text-success" },
                  { label: "Publicados", value: data?.vehicles.published ?? 0, color: "text-cugini-orange" },
                  { label: "Rejeitados", value: data?.vehicles.rejected ?? 0, color: "text-destructive" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    <span className={`text-sm font-semibold ${item.color}`}>
                      {item.value.toLocaleString("pt-BR")}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass rounded-2xl p-6">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
                Capturas por Periodo
              </h3>
              <div className="space-y-3">
                {[
                  { label: "Hoje", value: data?.captures.today ?? 0 },
                  { label: "Esta semana", value: data?.captures.week ?? 0 },
                  { label: "Este mes", value: data?.captures.month ?? 0 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    <span className="text-sm font-semibold text-foreground">
                      {item.value.toLocaleString("pt-BR")}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
                  <span className="text-sm text-muted-foreground">Grupos fonte</span>
                  <span className="text-sm font-semibold text-cugini-orange">
                    {data?.groups.source ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Grupos destino</span>
                  <span className="text-sm font-semibold text-cugini-orange">
                    {data?.groups.target ?? 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
