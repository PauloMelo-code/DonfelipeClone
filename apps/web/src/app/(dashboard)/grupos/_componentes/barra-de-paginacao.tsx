"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Paginacao de uma coluna.
//
// Estava declarada DENTRO do componente da pagina, o que fazia o React tratar
// cada render como um tipo novo e remontar a barra inteira. Fora daqui, o
// componente e estavel.
// ---------------------------------------------------------------------------

interface Props {
  pagina: number;
  totalDePaginas: number;
  total: number;
  aoTrocar: (pagina: number) => void;
}

export function BarraDePaginacao({ pagina, totalDePaginas, total, aoTrocar }: Props) {
  if (totalDePaginas <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/50">
      <span className="text-[11px] text-muted-foreground">
        {total} grupos · pág {pagina} de {totalDePaginas}
      </span>
      <div className="flex gap-1">
        <button
          onClick={() => aoTrocar(Math.max(1, pagina - 1))}
          disabled={pagina <= 1}
          className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => aoTrocar(Math.min(totalDePaginas, pagina + 1))}
          disabled={pagina >= totalDePaginas}
          className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
