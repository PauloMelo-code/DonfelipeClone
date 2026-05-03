"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Loader2, TrendingUp, Users, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

interface InsightsData {
  funnel: { captured: number; approved: number; published: number; sold: number };
  topGroups: Array<{ name: string; groupId: string; captured: number; approved: number; sold: number; approvalRate: number; conversionRate: number }>;
  topRejectionTags: Array<{ tag: string; count: number }>;
}

const REJECTION_LABELS: Record<string, string> = {
  fora_padrao: "Não é o padrão",
  sem_margem: "Sem margem (10% FIPE)",
  fora_sul: "Fora do Sul",
  repetido: "Repetido",
  km_alta: "Km alta",
  modelo_mais_margem: "Precisa mais margem",
  sem_foto: "Sem foto / errada",
};

export default function InsightsPage() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/insights")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <>
        <Header title="Insights" subtitle="Analise dos ultimos 30 dias" />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-cugini-orange" />
        </div>
      </>
    );
  }

  if (!data) return null;

  return (
    <>
      <Header title="Insights" subtitle="Análise dos últimos 30 dias" />
      <div className="p-6 space-y-6">
        {/* Funil */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-cugini-orange" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Funil de Conversão</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FunnelStep label="Capturados" value={data.funnel.captured} percent={100} />
            <FunnelStep label="Aprovados" value={data.funnel.approved} percent={data.funnel.captured > 0 ? Math.round((data.funnel.approved / data.funnel.captured) * 100) : 0} />
            <FunnelStep label="Publicados" value={data.funnel.published} percent={data.funnel.captured > 0 ? Math.round((data.funnel.published / data.funnel.captured) * 100) : 0} />
            <FunnelStep label="Vendidos" value={data.funnel.sold} percent={data.funnel.captured > 0 ? Math.round((data.funnel.sold / data.funnel.captured) * 100) : 0} highlight />
          </div>
        </div>

        {/* Top fornecedores */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-cugini-orange" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Top Fornecedores (por taxa aprovação)</h3>
          </div>
          <div className="space-y-2">
            {data.topGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados</p>
            ) : data.topGroups.map((g) => (
              <div key={g.groupId} className="flex items-center gap-3 rounded-lg p-3 bg-card border border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{g.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {g.captured} captados • {g.approved} aprovados • {g.sold} vendidos
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn(
                    "text-sm font-bold",
                    g.approvalRate >= 50 ? "text-success" : g.approvalRate >= 20 ? "text-warning" : "text-destructive"
                  )}>{g.approvalRate}%</p>
                  <p className="text-[10px] text-muted-foreground">aprovação</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Motivos de rejeição */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="h-4 w-4 text-cugini-orange" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Motivos de Rejeição</h3>
          </div>
          <div className="space-y-2">
            {data.topRejectionTags.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados</p>
            ) : data.topRejectionTags.map((t) => (
              <div key={t.tag} className="flex items-center gap-3">
                <span className="text-sm flex-1">{REJECTION_LABELS[t.tag] || t.tag}</span>
                <div className="flex-1 max-w-[200px] h-2 rounded-full bg-card overflow-hidden">
                  <div
                    className="h-full bg-destructive/60"
                    style={{ width: `${Math.min(100, (t.count / data.topRejectionTags[0].count) * 100)}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-destructive shrink-0 min-w-[40px] text-right">{t.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function FunnelStep({ label, value, percent, highlight }: { label: string; value: number; percent: number; highlight?: boolean }) {
  return (
    <div className={cn(
      "rounded-xl p-3 border",
      highlight ? "bg-success/10 border-success/30" : "bg-card border-border"
    )}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground/70">{label}</p>
      <p className={cn("text-2xl font-bold mt-1", highlight && "text-success")}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{percent}% do total</p>
    </div>
  );
}
