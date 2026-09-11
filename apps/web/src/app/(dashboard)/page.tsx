"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Header } from "@/components/layout/header";
import { StatCard } from "@/components/dashboard/stat-card";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { CapturesByState } from "@/components/dashboard/captures-by-state";
import { RejectionsRanking } from "@/components/dashboard/rejections-ranking";
import { useRouter } from "next/navigation";
import { StatCardSkeleton, ChartSkeleton } from "@/components/dashboard/skeleton-card";
import { DateRange } from "@/components/dashboard/date-range-picker";
import { Car, Clock, Send, TrendingUp, Crown, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { AlertBanner } from "@/components/ui/alert-banner";
import { PageContainer } from "@/components/ui/page-container";
import { SectionCard } from "@/components/ui/section-card";

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
  const router = useRouter();
  const today = new Date();
  const [data, setData] = useState<DashboardData | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartRange, setChartRange] = useState<DateRange>({
    startDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13, 0, 0, 0, 0),
    endDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999),
    label: "Últimos 14 dias",
  });

  // Track previous VIP count between polls so we can fire desktop notifications
  // without an additional /api/dashboard request.
  const lastVipCountRef = useRef<number>(0);

  const fetchData = useCallback(async () => {
    try {
      const [dashRes, chartRes] = await Promise.all([
        fetch("/api/dashboard"),
        fetch(`/api/dashboard/chart?startDate=${chartRange.startDate.toISOString()}&endDate=${chartRange.endDate.toISOString()}`),
      ]);
      if (dashRes.ok) {
        const d: DashboardData = await dashRes.json();
        setData(d);
        // Fire VIP notification if count grew (consolidated from old 60s poll)
        if (
          typeof window !== "undefined" &&
          "Notification" in window &&
          Notification.permission === "granted" &&
          d.vipPending > lastVipCountRef.current &&
          lastVipCountRef.current > 0
        ) {
          new Notification("🚗 Novo veículo VIP!", {
            body: `${d.vipPending - lastVipCountRef.current} carro(s) premium aguardando revisão`,
            icon: "/icon.svg",
            tag: "don-felipe-vip",
          });
        }
        lastVipCountRef.current = d.vipPending;
      }
      if (chartRes.ok) setChartData(await chartRes.json());
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [chartRange]);

  // Single poll: pause when tab hidden, slower interval (60s instead of 30s).
  useEffect(() => {
    fetchData();
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval) return;
      interval = setInterval(fetchData, 60_000);
    };
    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchData();
        start();
      } else {
        stop();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
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
        subtitle="Visão geral do sistema Don Felipe Repasses"
        live
      />

      <PageContainer>
        {/* Alert: VIP vehicles pending */}
        {!loading && data && data.vipPending > 0 && (
          <AlertBanner
            variant="vip"
            icon={<Crown />}
            title={`${data.vipPending} veículos VIP aguardando revisão`}
            description="Carros premium — prioridade alta"
            actionLabel="Revisar"
            actionHref="/veiculos"
          />
        )}

        {/* Alert: stale approved vehicles */}
        {!loading && data && data.staleApproved > 0 && (
          <AlertBanner
            variant="warning"
            icon={<Clock />}
            title={`${data.staleApproved} aprovados há mais de 24h`}
            description="Veículos esquecidos sem publicação"
            actionLabel="Publicar"
            actionHref="/veiculos"
          />
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
                title="Veículos Pendentes"
                value={data?.vehicles.pending ?? 0}
                icon={<Clock className="h-5 w-5" />}
              />
              <StatCard
                title="Capturas Hoje"
                value={data?.captures.today ?? 0}
                icon={<Car className="h-5 w-5" />}
              />
              <StatCard
                title="Publicações Hoje"
                value={data?.publications.today ?? 0}
                icon={<Send className="h-5 w-5" />}
              />
              <StatCard
                title="Taxa de Aprovação"
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

        {/* Capturas por estado + Ranking de rejeitados (lado a lado em desktop) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CapturesByState
            onStateClick={(state) => router.push(`/veiculos?state=${state}`)}
          />
          <RejectionsRanking />
        </div>

        {/* Insights row: top fornecedores + qualidade media */}
        {!loading && data && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SectionCard
              icon={<Users />}
              title="Fornecedores ativos (7 dias)"
              description={data.topGroupsWeek?.length ? `${data.topGroupsWeek.length} ${data.topGroupsWeek.length === 1 ? "fornecedor" : "fornecedores"} enviando carros` : undefined}
              className="lg:col-span-2"
            >
              {data.topGroupsWeek && data.topGroupsWeek.length > 0 ? (
                <div className="max-h-[400px] overflow-y-auto -mx-1 px-1 space-y-1.5">
                  {(() => {
                    const maxCount = data.topGroupsWeek[0]?.count || 1;
                    return data.topGroupsWeek.map((g, idx) => {
                      const pct = Math.max(4, (g.count / maxCount) * 100);
                      const isTop3 = idx < 3;
                      return (
                        <div
                          key={g.groupId}
                          className="group relative flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.02] transition-colors"
                        >
                          {/* Rank */}
                          <span
                            className={cn(
                              "shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold tabular-nums",
                              isTop3
                                ? "bg-brand-gold/15 text-brand-gold"
                                : "bg-white/[0.04] text-muted-foreground/60"
                            )}
                          >
                            {idx + 1}
                          </span>

                          {/* Name + progress bar */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate text-foreground">{g.name}</p>
                            <div className="mt-1 h-1 rounded-full bg-white/[0.04] overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  isTop3
                                    ? "bg-gradient-to-r from-brand-gold to-brand-gold-light"
                                    : "bg-muted-foreground/30"
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>

                          {/* Count */}
                          <div className="shrink-0 text-right">
                            <p className={cn(
                              "text-sm font-semibold tabular-nums",
                              isTop3 ? "text-brand-gold" : "text-foreground"
                            )}>
                              {g.count}
                            </p>
                            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">
                              {g.count === 1 ? "envio" : "envios"}
                            </p>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sem dados</p>
              )}
            </SectionCard>

            <SectionCard icon={<TrendingUp />} title="Qualidade média (pendentes)">
              {(() => {
                const score = data.avgQualityScore || 0;
                const pct = Math.max(0, Math.min(100, (score / 10) * 100));
                const tone =
                  score >= 7 ? "success" : score >= 5 ? "warning" : "destructive";
                const label =
                  score >= 8 ? "Excelente" : score >= 7 ? "Bom" : score >= 5 ? "Médio" : score > 0 ? "Atenção" : "Sem dados";
                const colorClasses = {
                  success: { text: "text-success", bg: "from-success to-success/60", stroke: "stroke-success", label: "bg-success/10 text-success border-success/20" },
                  warning: { text: "text-warning", bg: "from-warning to-warning/60", stroke: "stroke-warning", label: "bg-warning/10 text-warning border-warning/20" },
                  destructive: { text: "text-destructive", bg: "from-destructive to-destructive/60", stroke: "stroke-destructive", label: "bg-destructive/10 text-destructive border-destructive/20" },
                }[tone];
                // Gauge circular: arco de 270deg (3/4 do circulo, deixa visual "speedometer")
                const RADIUS = 42;
                const CIRC_FULL = 2 * Math.PI * RADIUS;
                const CIRC_ARC = CIRC_FULL * 0.75; // arco de 270deg
                const dashOffset = CIRC_ARC * (1 - pct / 100);

                return (
                  <div className="flex flex-col items-center pt-1">
                    {/* Gauge SVG */}
                    <div className="relative">
                      <svg width="140" height="140" viewBox="0 0 110 110" className="-rotate-[135deg]">
                        {/* Track */}
                        <circle
                          cx="55"
                          cy="55"
                          r={RADIUS}
                          fill="none"
                          stroke="rgba(255,255,255,0.04)"
                          strokeWidth="7"
                          strokeLinecap="round"
                          strokeDasharray={`${CIRC_ARC} ${CIRC_FULL}`}
                        />
                        {/* Progress */}
                        <circle
                          cx="55"
                          cy="55"
                          r={RADIUS}
                          fill="none"
                          className={cn(colorClasses.stroke, "transition-all duration-700")}
                          strokeWidth="7"
                          strokeLinecap="round"
                          strokeDasharray={`${CIRC_ARC} ${CIRC_FULL}`}
                          strokeDashoffset={dashOffset}
                          style={{ filter: `drop-shadow(0 0 6px currentColor)` }}
                        />
                      </svg>
                      {/* Centro do gauge */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={cn("text-3xl font-bold tabular-nums leading-none", colorClasses.text)}>
                          {score ? score.toFixed(1) : "—"}
                        </span>
                        <span className="mt-0.5 text-[10px] text-muted-foreground/50 tabular-nums">de 10</span>
                      </div>
                    </div>

                    {/* Badge de status */}
                    <span
                      className={cn(
                        "mt-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                        colorClasses.label
                      )}
                    >
                      {label}
                    </span>

                    {/* Métricas auxiliares */}
                    <div className="mt-4 w-full grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] py-2">
                        <p className={cn("text-base font-semibold tabular-nums", colorClasses.text)}>
                          {data.highScorePending || 0}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                          score ≥ 8
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] py-2">
                        <p className="text-base font-semibold tabular-nums text-foreground">
                          {data.vehicles.pending}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                          pendentes
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </SectionCard>
          </div>
        )}

        {/* Summary Cards */}
        {!loading && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="Resumo de Veículos" padding="lg">
              <div className="space-y-3">
                {[
                  { label: "Total capturados", value: data?.vehicles.total ?? 0, color: "text-foreground" },
                  { label: "Aprovados", value: data?.vehicles.approved ?? 0, color: "text-success" },
                  { label: "Publicados", value: data?.vehicles.published ?? 0, color: "text-brand-gold" },
                  { label: "Rejeitados", value: data?.vehicles.rejected ?? 0, color: "text-destructive" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    <span className={`text-sm font-semibold tabular-nums ${item.color}`}>
                      {item.value.toLocaleString("pt-BR")}
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Capturas por Período" padding="lg">
              <div className="space-y-3">
                {[
                  { label: "Hoje", value: data?.captures.today ?? 0 },
                  { label: "Esta semana", value: data?.captures.week ?? 0 },
                  { label: "Este mês", value: data?.captures.month ?? 0 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {item.value.toLocaleString("pt-BR")}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
                  <span className="text-sm text-muted-foreground">Grupos fonte</span>
                  <span className="text-sm font-semibold text-brand-gold tabular-nums">
                    {data?.groups.source ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Grupos destino</span>
                  <span className="text-sm font-semibold text-brand-gold tabular-nums">
                    {data?.groups.target ?? 0}
                  </span>
                </div>
              </div>
            </SectionCard>
          </div>
        )}
      </PageContainer>
    </>
  );
}
