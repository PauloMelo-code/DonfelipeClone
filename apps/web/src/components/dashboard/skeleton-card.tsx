"use client";

import { cn } from "@/lib/utils";

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-white/[0.05]",
        className
      )}
    />
  );
}

export function StatCardSkeleton() {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <Shimmer className="h-3 w-28" />
          <Shimmer className="h-9 w-20" />
        </div>
        <Shimmer className="h-11 w-11 rounded-xl" />
      </div>
    </div>
  );
}

/**
 * Altura de cada barra do esqueleto, em porcentagem.
 *
 * Duas senoides de periodos que nao se encaixam, somadas: o desenho sai
 * irregular como o de um grafico de verdade, e sai IGUAL no servidor e no
 * cliente.
 *
 * Aqui havia um `Math.random()`. Ele gerava uma altura na renderizacao do
 * servidor e outra na hidratacao, e o React reclamava de incompatibilidade a
 * cada abertura do painel -- um erro de console que escondia os proximos.
 * Nada que entra em `style` durante a renderizacao pode ser sorteado.
 */
function alturaDaBarra(i: number): number {
  return 42 + Math.sin(i * 0.8) * 20 + Math.sin(i * 1.7 + 1.2) * 12;
}

export function ChartSkeleton() {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <Shimmer className="h-3 w-20" />
        <Shimmer className="h-8 w-36 rounded-lg" />
      </div>
      <div className="h-72 flex items-end gap-2 px-2">
        {Array.from({ length: 14 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 animate-pulse rounded-t-sm bg-white/[0.04]"
            style={{ height: `${alturaDaBarra(i)}%` }}
          />
        ))}
      </div>
    </div>
  );
}
