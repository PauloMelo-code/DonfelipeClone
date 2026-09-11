"use client";

import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FILTROS } from "./tipos";
import type { Usuarios } from "../_ganchos/use-usuarios";

// ---------------------------------------------------------------------------
// Contagem, busca, filtro de status e o botao de criar.
//
// A contagem separa ativos de inativos porque e o numero que o dono olha: sao
// as pessoas que tem acesso ao sistema neste momento.
// ---------------------------------------------------------------------------

/** Bolinha colorida + numero + rotulo, usada nas duas contagens. */
function Contagem({ quantidade, rotulo, cor, texto }: { quantidade: number; rotulo: string; cor: string; texto: string }) {
  if (quantidade === 0) return null;
  return (
    <>
      <span className="text-muted-foreground/30">·</span>
      <span className="inline-flex items-center gap-1.5 text-xs">
        <span className={cn("h-1.5 w-1.5 rounded-full", cor)} />
        <span className={cn("tabular-nums", texto)}>{quantidade}</span>
        <span className="text-muted-foreground/60">{rotulo}</span>
      </span>
    </>
  );
}

export function BarraDeFiltros({ lista, aoCriar }: { lista: Usuarios; aoCriar: () => void }) {
  const total = lista.usuarios.length;

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-foreground font-medium tabular-nums">{total}</span>
          <span className="text-muted-foreground/60">{total === 1 ? "usuário" : "usuários"}</span>
          <Contagem
            quantidade={lista.ativos}
            rotulo="ativos"
            cor="bg-success shadow-[0_0_6px_rgba(52,211,153,0.6)]"
            texto="text-success"
          />
          <Contagem
            quantidade={lista.inativos}
            rotulo="inativos"
            cor="bg-muted-foreground/50"
            texto="text-muted-foreground"
          />
        </div>
        <Button
          size="sm"
          onClick={aoCriar}
          className="gap-1.5 gradient-gold text-white border-0 hover:shadow-[0_4px_20px_rgba(201,151,61,0.3)] transition-all"
        >
          <Plus className="h-4 w-4" />
          Novo usuário
        </Button>
      </div>

      {total > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Buscar por nome ou email..."
              value={lista.busca}
              onChange={(e) => lista.setBusca(e.target.value)}
              className="pl-9 bg-card/50 border-white/[0.06] focus:border-brand-gold/40"
            />
          </div>
          <div className="flex gap-1 rounded-lg border border-white/[0.06] bg-card/40 p-0.5">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                onClick={() => lista.setStatus(f.id)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  lista.status === f.id
                    ? "bg-brand-gold/15 text-brand-gold"
                    : "text-muted-foreground/70 hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
