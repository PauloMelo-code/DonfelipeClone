"use client";

import { cn } from "@/lib/utils";
import { ESTILO_DA_MARGEM, classificarMargem } from "./margem";

// ---------------------------------------------------------------------------
// O selo de margem no canto do card. A decisao mora em `margem.ts`.
// ---------------------------------------------------------------------------

export function SeloDeMargem({ price, fipePrice }: { price: number; fipePrice?: number | null }) {
  const margem = classificarMargem(price, fipePrice);
  if (!margem) return null;
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-xs whitespace-nowrap", ESTILO_DA_MARGEM[margem.nivel])}>
      {margem.rotulo}
    </span>
  );
}
