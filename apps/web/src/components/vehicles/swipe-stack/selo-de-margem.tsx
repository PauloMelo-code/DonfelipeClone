"use client";

import { cn } from "@/lib/utils";
import { ESTILO_DA_MARGEM, classificarMargem, margemDoPor } from "./margem";

// ---------------------------------------------------------------------------
// O selo de margem no canto do card. A decisao mora em `margem.ts`.
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
