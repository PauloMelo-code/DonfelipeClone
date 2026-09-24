"use client";

import { CheckSquare, Search, Square, Layers, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Filtros } from "../_ganchos/use-fila";

// ---------------------------------------------------------------------------
// Abas de status, chips de filtro e busca.
//
// A busca vai ao servidor e varre o banco inteiro; os chips filtram so a
// pagina ja carregada. Sao coisas diferentes de proposito -- filtrar a busca
// no cliente confundia a paginacao.
// ---------------------------------------------------------------------------

const ABAS = [
  { valor: "PENDING", rotulo: "Pendentes", cor: "data-[state=active]:bg-warning/10 data-[state=active]:text-warning" },
  { valor: "APPROVED", rotulo: "Aprovados", cor: "data-[state=active]:bg-success/10 data-[state=active]:text-success" },
  { valor: "PREPARED", rotulo: "Prontos", cor: "data-[state=active]:bg-info/10 data-[state=active]:text-info" },
  { valor: "PUBLISHED", rotulo: "Publicados", cor: "data-[state=active]:bg-brand-gold/10 data-[state=active]:text-brand-gold" },
  { valor: "REJECTED", rotulo: "Rejeitados", cor: "data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive" },
];

const ESTADOS = ["RS", "SC", "PR", "SP"];

const FAIXAS = [
  { label: "30-60k", value: "30000-60000" },
  { label: "60-100k", value: "60000-100000" },
  { label: "100-150k", value: "100000-150000" },
  { label: "150k+", value: "150000-0" },
];

const CAMBIOS = [
  { valor: "AUTOMATICO", rotulo: "Aut." },
  { valor: "MANUAL", rotulo: "Manual" },
  { valor: "CVT", rotulo: "CVT" },
];

const CHIP = "rounded-lg px-2.5 py-1 text-xs border transition-all";
const CHIP_ATIVO = "bg-brand-gold/10 border-brand-gold/30 text-brand-gold";
const CHIP_INATIVO = "bg-card/50 border-border text-muted-foreground hover:border-white/20";

interface Props {
  abaAtiva: string;
  aoTrocarAba: (v: string) => void;
  filtros: Filtros;
  setFiltros: React.Dispatch<React.SetStateAction<Filtros>>;
  busca: string;
  setBusca: (v: string) => void;
  /** Na aba Pendentes a triagem e por swipe: sem busca, sem selecao em massa. */
  ehPendentes: boolean;
  /** Como a aba Pendentes esta sendo mostrada. */
  modoDosPendentes?: "cards" | "lista";
  aoTrocarModoDosPendentes?: (modo: "cards" | "lista") => void;
  mostrarSelecionarTodos: boolean;
  todosMarcados: boolean;
  aoSelecionarTodos: () => void;
}

export function BarraDeFiltros({
  abaAtiva, aoTrocarAba, filtros, setFiltros, busca, setBusca,
  ehPendentes, mostrarSelecionarTodos, todosMarcados, aoSelecionarTodos,
  modoDosPendentes = "cards", aoTrocarModoDosPendentes,
}: Props) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <Tabs value={abaAtiva} onValueChange={aoTrocarAba}>
          <TabsList className="glass overflow-x-auto flex-nowrap whitespace-nowrap">
            {ABAS.map((aba) => (
              <TabsTrigger key={aba.valor} value={aba.valor} className={aba.cor}>
                {aba.rotulo}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {ehPendentes && aoTrocarModoDosPendentes && (
          <div className="glass flex shrink-0 items-center gap-0.5 rounded-lg p-0.5">
            {([
              { modo: "cards" as const, Icone: Layers, dica: "Um carro de cada vez, com o anúncio inteiro" },
              { modo: "lista" as const, Icone: LayoutGrid, dica: "Todos de uma vez, para escolher onde mexer" },
            ]).map(({ modo, Icone, dica }) => (
              <button
                key={modo}
                onClick={() => aoTrocarModoDosPendentes(modo)}
                title={dica}
                aria-label={dica}
                aria-pressed={modoDosPendentes === modo}
                className={cn(
                  "rounded-md p-1.5 transition-colors",
                  modoDosPendentes === modo
                    ? "bg-brand-gold/15 text-brand-gold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icone className="h-4 w-4" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex flex-wrap gap-1.5">
          {ESTADOS.map((s) => (
            <button
              key={s}
              onClick={() => setFiltros((f) => ({
                ...f,
                states: f.states.includes(s) ? f.states.filter((x) => x !== s) : [...f.states, s],
              }))}
              className={cn(CHIP, filtros.states.includes(s) ? CHIP_ATIVO : CHIP_INATIVO)}
            >
              {s}
            </button>
          ))}
          {FAIXAS.map((p) => (
            <button
              key={p.value}
              onClick={() => setFiltros((f) => ({ ...f, priceRange: f.priceRange === p.value ? "" : p.value }))}
              className={cn(CHIP, filtros.priceRange === p.value ? CHIP_ATIVO : CHIP_INATIVO)}
            >
              {p.label}
            </button>
          ))}
          {CAMBIOS.map((t) => (
            <button
              key={t.valor}
              onClick={() => setFiltros((f) => ({ ...f, transmission: f.transmission === t.valor ? "" : t.valor }))}
              className={cn(CHIP, filtros.transmission === t.valor ? CHIP_ATIVO : CHIP_INATIVO)}
            >
              {t.rotulo}
            </button>
          ))}
        </div>
      </div>

      {!ehPendentes && (
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {mostrarSelecionarTodos && (
            <Button
              size="sm"
              variant="outline"
              onClick={aoSelecionarTodos}
              className="gap-1.5 border-border text-xs shrink-0"
            >
              {todosMarcados
                ? <CheckSquare className="h-3.5 w-3.5 text-brand-gold" />
                : <Square className="h-3.5 w-3.5" />
              }
              Selecionar todos
            </Button>
          )}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar veículo..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9 bg-card border-border"
            />
          </div>
        </div>
      )}
    </div>
  );
}
