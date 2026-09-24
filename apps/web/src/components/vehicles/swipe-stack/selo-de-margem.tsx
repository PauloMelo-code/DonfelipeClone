"use client";

import { Flame, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateQualityScore } from "@/lib/quality-score";
import { ESTILO_DA_MARGEM, classificarMargem, margemDoPor } from "./margem";
import { useCriteriosDoScore } from "./criterios";

// ---------------------------------------------------------------------------
// Os selos do canto do card: margem da compra, margem da venda, nota, VIP e
// hibrido. A decisao da margem mora em `margem.ts`.
//
// Valem para a pilha E para a lista de pendentes -- o mesmo carro tem que
// contar a mesma coisa nas duas telas. Ja aconteceu de duas leituras
// separadas divergirem (ver `origem.ts`), entao aqui e uma so.
// ---------------------------------------------------------------------------

/**
 * O segundo selo: o "Por:" do anuncio contra a Fipe. Dourado, e nao verde ou
 * amarelo, porque aqui o numero e escolha do operador, nao avaliacao da compra.
 */
export function SeloDoPor({ texto, fipePrice }: { texto: string | null | undefined; fipePrice?: number | null }) {
  const margem = margemDoPor(texto, fipePrice);
  if (!margem) return null;
  return (
    <span
      title="Preço de venda (Por:) contra a Fipe do anúncio"
      className="rounded-full border border-brand-gold/40 bg-brand-gold/10 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-brand-gold tabular-nums"
    >
      {margem.rotulo}
    </span>
  );
}

export function SeloDeMargem({ price, fipePrice }: { price: number; fipePrice?: number | null }) {
  const margem = classificarMargem(price, fipePrice);
  if (!margem) return null;
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-xs whitespace-nowrap", ESTILO_DA_MARGEM[margem.nivel])}>
      {margem.rotulo}
    </span>
  );
}

/** O que os selos precisam saber do carro -- so isso, para servir qualquer tela. */
export interface DadosDosSelos {
  km: number;
  year: number;
  price: number;
  fipePrice?: number | null;
  rawDescription?: string | null;
  qualityScore?: number | null;
  isVip?: boolean;
  fuel?: string | null;
}

/**
 * A coluna de selos do card. `texto` e o anuncio que esta na tela agora -- na
 * pilha ele muda enquanto o operador digita; na lista e o anuncio gravado.
 */
export function Selos({ vehicle, texto }: { vehicle: DadosDosSelos; texto: string | null }) {
  // As referencias da nota sao as que o cliente ajusta em Configuracoes.
  const criterios = useCriteriosDoScore();
  // A nota sai dos dados que estao na tela: se o operador corrige o km ou o
  // preco, ela acompanha. E o `title` diz de onde veio cada ponto -- o
  // cliente perguntou como o sistema chega na nota (22/09/2026).
  const nota = calculateQualityScore(
    {
      km: vehicle.km,
      year: vehicle.year,
      price: vehicle.price,
      fipePrice: vehicle.fipePrice,
      rawDescription: vehicle.rawDescription,
    },
    criterios
  );
  const score = vehicle.qualityScore == null ? null : nota.score;
  const porQue = `Nota ${nota.score}/10 — ${nota.reasons.join(" · ") || "sem destaque nem ressalva"}`;
  return (
    <div className="flex flex-col items-end gap-1">
      <SeloDeMargem price={vehicle.price} fipePrice={vehicle.fipePrice} />
      <SeloDoPor texto={texto} fipePrice={vehicle.fipePrice} />
      {score != null && (
        <span title={porQue} className={cn(
          "cursor-help rounded-full border px-2 py-0.5 text-xs font-bold",
          score >= 8 ? "bg-success/20 border-success/50 text-success"
            : score >= 5 ? "bg-warning/15 border-warning/40 text-warning"
              : "bg-destructive/10 border-destructive/30 text-destructive"
        )}>
          {score >= 8 && <Flame className="mr-1 inline h-3 w-3 align-[-2px]" />}Score {score}/10
        </span>
      )}
      {vehicle.isVip && (
        <span className="rounded-full border border-yellow-400/60 bg-yellow-400/15 px-2 py-0.5 text-xs font-bold text-yellow-400">
          <Star className="mr-1 inline h-3 w-3 align-[-2px] fill-current" />VIP
        </span>
      )}
      {vehicle.fuel === "HIBRIDO" && (
        <span className="rounded-full border border-success/30 px-2 py-0.5 text-xs text-success">Hibrido</span>
      )}
    </div>
  );
}
