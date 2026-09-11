"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { REGIONS, TIPOS, type Papel, type TypeStats } from "./tipos";

// ---------------------------------------------------------------------------
// Busca, regiao, tipo e -- no celular -- a escolha entre Fonte e Destino.
//
// As pastilhas de tipo mostram a soma das duas colunas. A contagem vem de uma
// consulta propria, nao da pagina carregada, senao o numero mudaria a cada
// virada de pagina.
// ---------------------------------------------------------------------------

const PILULA = "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium border transition-all";
const PILULA_ATIVA = "bg-brand-gold/10 border-brand-gold/30 text-brand-gold";
const PILULA_INATIVA = "bg-card/50 border-border text-muted-foreground hover:border-white/20";

interface Props {
  busca: string;
  setBusca: (v: string) => void;
  regioes: string[];
  setRegioes: React.Dispatch<React.SetStateAction<string[]>>;
  tipo: string;
  setTipo: (v: string) => void;
  statsFonte: TypeStats | null;
  statsDestino: TypeStats | null;
  abaDoCelular: Papel;
  setAbaDoCelular: (v: Papel) => void;
  totalFonte: number;
  totalDestino: number;
}

export function Filtros({
  busca, setBusca, regioes, setRegioes, tipo, setTipo,
  statsFonte, statsDestino, abaDoCelular, setAbaDoCelular, totalFonte, totalDestino,
}: Props) {
  const temContagem = statsFonte !== null || statsDestino !== null;

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar grupo por nome..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9 bg-card border-border"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {REGIONS.map((r) => (
          <button
            key={r}
            onClick={() => setRegioes((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))}
            className={cn(PILULA, regioes.includes(r) ? PILULA_ATIVA : PILULA_INATIVA)}
          >
            {r}
          </button>
        ))}
        {regioes.length > 0 && (
          <button
            onClick={() => setRegioes([])}
            className="shrink-0 rounded-lg px-3 py-1.5 text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            Limpar
          </button>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TIPOS.map((t) => {
          const contagem = (statsFonte?.[t.key] ?? 0) + (statsDestino?.[t.key] ?? 0);
          const ativo = tipo === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTipo(t.id)}
              className={cn(
                PILULA,
                "inline-flex items-center gap-1.5",
                ativo ? PILULA_ATIVA : `${PILULA_INATIVA} hover:text-foreground`
              )}
            >
              <span>{t.label}</span>
              {temContagem && (
                <span
                  className={cn(
                    "tabular-nums text-[10px] font-semibold rounded-full px-1.5 min-w-[20px] text-center",
                    ativo ? "bg-brand-gold/20 text-brand-gold" : "bg-white/[0.05] text-muted-foreground/80"
                  )}
                >
                  {contagem}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* No celular as duas colunas nao cabem lado a lado. */}
      <div className="flex gap-0 rounded-xl border border-border overflow-hidden lg:hidden">
        {([
          { papel: "TARGET" as const, rotulo: "Destino", total: totalDestino },
          { papel: "SOURCE" as const, rotulo: "Fonte", total: totalFonte },
        ]).map((aba) => (
          <button
            key={aba.papel}
            onClick={() => setAbaDoCelular(aba.papel)}
            className={cn(
              "flex-1 py-2.5 text-xs font-medium transition-all text-center",
              abaDoCelular === aba.papel ? "bg-brand-gold text-white" : "bg-card/50 text-muted-foreground"
            )}
          >
            {aba.rotulo} ({aba.total})
          </button>
        ))}
      </div>
    </>
  );
}
