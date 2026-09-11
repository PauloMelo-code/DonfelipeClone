"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles, Camera, FileText, TrendingUp, AlertTriangle,
  CheckCircle2, TrendingDown, Activity, Target, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Insights {
  scores: { overall: number; photo: number; text: number; price: number };
  photo: { heroCategory: string; categories: string[]; exteriorCount: number; interiorCount: number; totalPhotos: number };
  pricing: { captured: number; fipe: number | null; discountPct: number | null; suggested: number; currentSelling: number | null };
  market: { similarCount: number; avg: number | null; min: number | null; max: number | null; soldCount: number };
  saleProbability: number;
  strengths: string[];
  warnings: string[];
}

interface AIInsightsProps {
  vehicleId: string;
  className?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  exterior: "Exterior",
  interior: "Interna",
  motor: "Motor",
  detalhe: "Detalhe",
  screenshot: "Screenshot",
  outro: "Outro",
};

const CATEGORY_COLORS: Record<string, string> = {
  exterior: "bg-success/10 text-success border-success/20",
  interior: "bg-warning/10 text-warning border-warning/20",
  motor: "bg-blue-400/10 text-blue-300 border-blue-400/20",
  detalhe: "bg-warning/10 text-warning border-warning/20",
  screenshot: "bg-destructive/10 text-destructive border-destructive/20",
  outro: "bg-muted/40 text-muted-foreground border-white/[0.06]",
};

function formatBRL(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function ScoreBar({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  const pct = (value / 10) * 100;
  const color = value >= 7 ? "from-success to-success/60" : value >= 5 ? "from-warning to-warning/60" : "from-destructive to-destructive/60";
  const textColor = value >= 7 ? "text-success" : value >= 5 ? "text-warning" : "text-destructive";

  return (
    <div className="flex items-center gap-2.5">
      <div className="flex items-center gap-1.5 w-20 shrink-0">
        <span className="text-muted-foreground/60 [&>svg]:h-3 [&>svg]:w-3">{icon}</span>
        <span className="text-[11px] text-muted-foreground/80">{label}</span>
      </div>
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={cn("h-full rounded-full bg-gradient-to-r", color)}
        />
      </div>
      <span className={cn("text-xs font-semibold tabular-nums w-8 text-right", textColor)}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

export function AIInsights({ vehicleId, className }: AIInsightsProps) {
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vehicleId) return;
    setLoading(true);
    fetch(`/api/vehicles/${vehicleId}/insights`)
      .then((r) => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [vehicleId]);

  if (loading) {
    return (
      <div className={cn("rounded-2xl border border-white/[0.06] bg-gradient-to-br from-brand-gold/[0.03] to-transparent p-4 flex items-center gap-2", className)}>
        <Loader2 className="h-4 w-4 animate-spin text-brand-gold" />
        <span className="text-xs text-muted-foreground">Analisando com IA...</span>
      </div>
    );
  }

  if (!data) return null;

  const overallTone = data.scores.overall >= 7 ? "success" : data.scores.overall >= 5 ? "warning" : "destructive";
  const overallColors = {
    success: { text: "text-success", bg: "bg-success/10", border: "border-success/30", glow: "shadow-[0_0_24px_rgba(52,211,153,0.15)]" },
    warning: { text: "text-warning", bg: "bg-warning/10", border: "border-warning/30", glow: "shadow-[0_0_24px_rgba(251,191,36,0.15)]" },
    destructive: { text: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30", glow: "shadow-[0_0_24px_rgba(239,68,68,0.15)]" },
  }[overallTone];

  const recommendation =
    data.scores.overall >= 8 ? "Excelente oportunidade — publique já" :
    data.scores.overall >= 6.5 ? "Bom anúncio — recomendado publicar" :
    data.scores.overall >= 5 ? "Anúncio médio — revise antes" :
    "Atenção — anúncio com pontos fracos";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-brand-gold/[0.04] via-card to-card p-4 space-y-4",
        overallColors.glow,
        className
      )}
    >
      {/* Subtle decoration */}
      <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-brand-gold/[0.06] blur-3xl" />

      {/* Header */}
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-gold/30 to-brand-gold/10">
            <Sparkles className="h-3.5 w-3.5 text-brand-gold" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-gold">Análise IA</p>
            <p className="text-[10px] text-muted-foreground/60">{recommendation}</p>
          </div>
        </div>
        {/* Score overall */}
        <div className={cn("flex items-baseline gap-0.5 rounded-lg border px-2.5 py-1", overallColors.bg, overallColors.border)}>
          <span className={cn("text-xl font-bold tabular-nums leading-none", overallColors.text)}>
            {data.scores.overall.toFixed(1)}
          </span>
          <span className={cn("text-xs", overallColors.text, "opacity-60")}>/10</span>
        </div>
      </div>

      {/* Score breakdown */}
      <div className="relative space-y-1.5">
        <ScoreBar label="Foto" value={data.scores.photo} icon={<Camera />} />
        <ScoreBar label="Texto" value={data.scores.text} icon={<FileText />} />
        <ScoreBar label="Preço" value={data.scores.price} icon={<TrendingUp />} />
      </div>

      {/* Métricas em grid */}
      <div className="relative grid grid-cols-2 gap-2">
        {/* Sale probability */}
        <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Target className="h-3 w-3 text-muted-foreground/60" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Chance de venda</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className={cn("text-lg font-bold tabular-nums",
              data.saleProbability >= 70 ? "text-success" :
              data.saleProbability >= 40 ? "text-warning" : "text-destructive"
            )}>
              {data.saleProbability}%
            </span>
          </div>
        </div>

        {/* Discount FIPE */}
        <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            {data.pricing.discountPct !== null && data.pricing.discountPct >= 0
              ? <TrendingDown className="h-3 w-3 text-muted-foreground/60" />
              : <TrendingUp className="h-3 w-3 text-muted-foreground/60" />
            }
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">vs FIPE</span>
          </div>
          <span className={cn("text-lg font-bold tabular-nums",
            data.pricing.discountPct === null ? "text-muted-foreground" :
            data.pricing.discountPct >= 10 ? "text-success" :
            data.pricing.discountPct >= 0 ? "text-warning" : "text-destructive"
          )}>
            {data.pricing.discountPct === null ? "—" :
             data.pricing.discountPct >= 0 ? `-${data.pricing.discountPct}%` : `+${Math.abs(data.pricing.discountPct)}%`}
          </span>
        </div>

        {/* Market comparison */}
        {data.market.similarCount > 0 && data.market.avg && (
          <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-2.5 col-span-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Activity className="h-3 w-3 text-muted-foreground/60" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                Mercado ({data.market.similarCount} similares · {data.market.soldCount} vendidos)
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-1">
              <div>
                <p className="text-[9px] text-muted-foreground/50 uppercase">Mín</p>
                <p className="text-xs font-semibold tabular-nums text-foreground">{formatBRL(data.market.min)}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground/50 uppercase">Média</p>
                <p className="text-xs font-semibold tabular-nums text-brand-gold">{formatBRL(data.market.avg)}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground/50 uppercase">Máx</p>
                <p className="text-xs font-semibold tabular-nums text-foreground">{formatBRL(data.market.max)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Foto categoria do destaque */}
      {data.photo.heroCategory && data.photo.totalPhotos > 0 && (
        <div className="relative flex items-center gap-2 text-[11px]">
          <Camera className="h-3 w-3 text-muted-foreground/50" />
          <span className="text-muted-foreground/60">Foto destaque:</span>
          <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            CATEGORY_COLORS[data.photo.heroCategory] || CATEGORY_COLORS.outro
          )}>
            {CATEGORY_LABELS[data.photo.heroCategory] || data.photo.heroCategory}
          </span>
          {data.photo.totalPhotos > 1 && (
            <span className="text-muted-foreground/40 ml-auto">
              {data.photo.totalPhotos} fotos · {data.photo.exteriorCount} exteriores
            </span>
          )}
        </div>
      )}

      {/* Strengths */}
      {data.strengths.length > 0 && (
        <div className="relative space-y-1">
          {data.strengths.slice(0, 4).map((s, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-success/90">
              <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}

      {/* Warnings */}
      {data.warnings.length > 0 && (
        <div className="relative space-y-1 rounded-lg border border-warning/20 bg-warning/[0.04] p-2">
          {data.warnings.slice(0, 3).map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-warning">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
