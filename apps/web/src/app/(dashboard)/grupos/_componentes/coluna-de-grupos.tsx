"use client";

import { Radio, Target, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AcoesDeGrupo } from "../_ganchos/use-acoes-de-grupo";
import { ListaDeGrupos } from "./lista-de-grupos";
import type { PaginatedResponse, Papel, Group } from "./tipos";

// ---------------------------------------------------------------------------
// Uma coluna: Fonte (de onde o anuncio vem) ou Destino (pra onde ele vai).
//
// As duas eram o mesmo bloco de JSX copiado, mudando so o icone, o rotulo e
// qual estado usar. Aqui e um componente com dois usos, e o celular reaproveita
// a mesma lista com um cabecalho mais estreito.
// ---------------------------------------------------------------------------

interface Props {
  papel: Papel;
  dados: PaginatedResponse | null;
  grupos: Group[];
  acoes: AcoesDeGrupo;
  aoTrocarPagina: (pagina: number) => void;
  aoLigarTodos: (papel: Papel, ativo: boolean) => void;
  /** No celular o cabecalho encolhe e a lista ganha rolagem propria. */
  compacto?: boolean;
}

export function ColunaDeGrupos({ papel, dados, grupos, acoes, aoTrocarPagina, aoLigarTodos, compacto }: Props) {
  const ehFonte = papel === "SOURCE";
  const Icone = ehFonte ? Radio : Target;
  const corDoIcone = ehFonte ? "text-success" : "text-brand-gold";
  const total = dados?.pagination.total ?? 0;
  const rotuloVazio = `Nenhum grupo ${ehFonte ? "fonte" : "destino"} nesta página`;

  return (
    <div>
      {compacto ? (
        <div className="flex items-center gap-2 mb-3 overflow-hidden">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Icone className={`h-4 w-4 ${corDoIcone} shrink-0`} />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
              {ehFonte ? "Fonte" : "Destino"} ({total})
            </h3>
          </div>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => aoLigarTodos(papel, true)}
              className="flex items-center gap-1 rounded-md border border-border px-1.5 h-6 text-[10px] text-muted-foreground hover:text-success hover:border-success/30 transition-colors"
              title="Ativar todos"
            >
              <ToggleRight className="h-3 w-3" />
              <span className="hidden sm:inline">Ativar</span>
            </button>
            <button
              onClick={() => aoLigarTodos(papel, false)}
              className="flex items-center gap-1 rounded-md border border-border px-1.5 h-6 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
              title="Desativar todos"
            >
              <ToggleLeft className="h-3 w-3" />
              <span className="hidden sm:inline">Desativar</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icone className={`h-4 w-4 ${corDoIcone}`} />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Grupos {ehFonte ? "Fonte" : "Destino"} ({total})
            </h3>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => aoLigarTodos(papel, true)}>
              Ativar todos
            </Button>
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => aoLigarTodos(papel, false)}>
              Desativar todos
            </Button>
          </div>
        </div>
      )}

      <ListaDeGrupos
        grupos={grupos}
        dados={dados}
        acoes={acoes}
        aoTrocarPagina={aoTrocarPagina}
        rotuloVazio={rotuloVazio}
        className={compacto ? "space-y-2 max-h-[calc(100vh-420px)] overflow-y-auto rounded-xl" : undefined}
      />
    </div>
  );
}
