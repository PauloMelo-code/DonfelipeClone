"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Header } from "@/components/layout/header";
import { StatCard } from "@/components/dashboard/stat-card";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { StatCardSkeleton, ChartSkeleton } from "@/components/dashboard/skeleton-card";
import { DateRange } from "@/components/dashboard/date-range-picker";
import { Car, Clock, Send, TrendingUp, Crown, Users } from "lucide-react";
import { cn } from "@/lib/utils";

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
  vipPending: number;
  topGroupsWeek: { groupId: string; name: string; count: number }[];
  avgQualityScore: number;
  highScorePending: number;
  staleApproved: number;
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

  // Poll for new VIP vehicles and show local notifications when permission granted
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    let lastVipCount = 0;
    const check = async () => {
      try {
        const res = await fetch("/api/dashboard");
        if (!res.ok) return;
        const d = await res.json();
        if (d.vipPending > lastVipCount && lastVipCount > 0) {
          new Notification("🚗 Novo veículo VIP!", {
            body: `${d.vipPending - lastVipCount} carro(s) premium aguardando revisão`,
            icon: "/icon.svg",
            tag: "cugini-vip",
          });
        }
        lastVipCount = d.vipPending;
      } catch {
        /* ignore */
      }
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

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
        {/* Alert: VIP vehicles pending */}
        {!loading && data && data.vipPending > 0 && (
          <div className="rounded-2xl border border-yellow-400/40 bg-yellow-400/5 p-4 flex items-center gap-3">
            <Crown className="h-6 w-6 text-yellow-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-yellow-400">
                {data.vipPending} veículos VIP aguardando revisão
              </p>
              <p className="text-xs text-yellow-400/70">
                Carros premium — prioridade alta
              </p>
            </div>
            <Link
              href="/veiculos"
              className="rounded-lg bg-yellow-400/15 border border-yellow-400/30 px-3 py-1.5 text-xs font-medium text-yellow-400 hover:bg-yellow-400/20"
            >
              Revisar →
            </Link>
          </div>
        )}

        {/* Alert: stale approved vehicles */}
        {!loading && data && data.staleApproved > 0 && (
          <div className="rounded-2xl border border-warning/40 bg-warning/5 p-4 flex items-center gap-3">
            <Clock className="h-6 w-6 text-warning shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-warning">{data.staleApproved} aprovados há mais de 24h</p>
              <p className="text-xs text-warning/70">Veículos esquecidos sem publicação</p>
            </div>
            <Link href="/veiculos" className="rounded-lg bg-warning/15 border border-warning/30 px-3 py-1.5 text-xs font-medium text-warning hover:bg-warning/20">
              Publicar →
            </Link>
          </div>
        )}

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

        {/* Insights row: top fornecedores + qualidade media */}
        {!loading && data && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="glass rounded-2xl p-5 lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-4 w-4 text-cugini-orange" />
                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
                  Top fornecedores (7 dias)
                </h3>
              </div>
              <div className="space-y-2">
                {data.topGroupsWeek && data.topGroupsWeek.length > 0 ? (
                  data.topGroupsWeek.slice(0, 5).map((g) => (
                    <div key={g.groupId} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{g.name}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{g.count}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Sem dados</p>
                )}
              </div>
            </div>

            <div className="glass rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-cugini-orange" />
                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
                  Qualidade média (pendentes)
                </h3>
              </div>
              <p
                className={cn(
                  "text-3xl font-bold",
                  data.avgQualityScore >= 7
                    ? "text-success"
                    : data.avgQualityScore >= 5
                    ? "text-warning"
                    : "text-destructive"
                )}
              >
                {data.avgQualityScore ? data.avgQualityScore.toFixed(1) : "—"}
                <span className="text-base text-muted-foreground/60">/10</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {data.highScorePending || 0} com score ≥ 8
              </p>
            </div>
          </div>
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
