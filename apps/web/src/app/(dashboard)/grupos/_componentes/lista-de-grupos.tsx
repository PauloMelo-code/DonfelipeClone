"use client";

import type { AcoesDeGrupo } from "../_ganchos/use-acoes-de-grupo";
import { BarraDePaginacao } from "./barra-de-paginacao";
import { CartaoDeGrupo } from "./cartao-de-grupo";
import type { PaginatedResponse, Group } from "./tipos";

// ---------------------------------------------------------------------------
// A lista de cards com sua paginacao.
//
// Serve as tres aparicoes da mesma coisa na tela: as colunas Fonte e Destino
// no desktop e a aba unica no celular.
// ---------------------------------------------------------------------------

interface Props {
  grupos: Group[];
  dados: PaginatedResponse | null;
  acoes: AcoesDeGrupo;
  aoTrocarPagina: (pagina: number) => void;
  rotuloVazio: string;
  /** No celular a lista rola dentro de si mesma pra sobrar tela pros filtros. */
  className?: string;
}

export function ListaDeGrupos({ grupos, dados, acoes, aoTrocarPagina, rotuloVazio, className }: Props) {
  return (
    <>
      <div className={className ?? "space-y-2"}>
        {grupos.map((group) => (
          <CartaoDeGrupo key={group.id} group={group} acoes={acoes} />
        ))}
        {grupos.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">{rotuloVazio}</p>
        )}
      </div>
      {dados && (
        <BarraDePaginacao
          pagina={dados.pagination.page}
          totalDePaginas={dados.pagination.totalPages}
          total={dados.pagination.total}
          aoTrocar={aoTrocarPagina}
        />
      )}
    </>
  );
}
