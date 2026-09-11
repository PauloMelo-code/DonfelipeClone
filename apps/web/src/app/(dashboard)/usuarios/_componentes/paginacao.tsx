"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE } from "./tipos";
import type { Usuarios } from "../_ganchos/use-usuarios";

// ---------------------------------------------------------------------------
// Paginacao da lista. Some quando tudo cabe numa pagina so.
// ---------------------------------------------------------------------------

const SETA = "h-8 w-8 inline-flex items-center justify-center rounded-lg border border-white/[0.06] bg-card/40 text-muted-foreground transition-colors hover:text-foreground hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed";

export function Paginacao({ lista }: { lista: Usuarios }) {
  const { pagina, totalDePaginas, setPagina, filtrados } = lista;
  if (totalDePaginas <= 1) return null;

  const primeiro = (pagina - 1) * PAGE_SIZE + 1;
  const ultimo = Math.min(pagina * PAGE_SIZE, filtrados.length);

  return (
    <div className="flex items-center justify-between border-t border-white/[0.04] px-5 py-3.5">
      <span className="text-xs text-muted-foreground tabular-nums">
        Mostrando <span className="text-foreground font-medium">{primeiro}–{ultimo}</span> de{" "}
        <span className="text-foreground font-medium">{filtrados.length}</span>
      </span>
      <div className="flex items-center gap-1">
        <button
          disabled={pagina <= 1}
          onClick={() => setPagina((p) => Math.max(1, p - 1))}
          className={SETA}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-3 text-xs font-medium text-foreground tabular-nums">
          {pagina} / {totalDePaginas}
        </span>
        <button
          disabled={pagina >= totalDePaginas}
          onClick={() => setPagina((p) => Math.min(totalDePaginas, p + 1))}
          className={SETA}
          aria-label="Próxima página"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
