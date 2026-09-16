"use client";

import { useState } from "react";
import { Loader2, Users } from "lucide-react";
import { Header } from "@/components/layout/header";
import { BarraDeAcoes } from "./_componentes/barra-de-acoes";
import { ColunaDeGrupos } from "./_componentes/coluna-de-grupos";
import { DialogoAcesso } from "./_componentes/dialogo-acesso";
import { DialogoAdicionar } from "./_componentes/dialogo-adicionar";
import { DialogoSincronizar } from "./_componentes/dialogo-sincronizar";
import { Filtros } from "./_componentes/filtros";
import { MenuDeTipo } from "./_componentes/menu-de-tipo";
import type { Papel } from "./_componentes/tipos";
import { useAcoesDeGrupo } from "./_ganchos/use-acoes-de-grupo";
import { useListaDeGrupos } from "./_ganchos/use-lista-de-grupos";
import { useManutencao } from "./_ganchos/use-manutencao";

export default function GruposPage() {
  const lista = useListaDeGrupos();
  const acoes = useAcoesDeGrupo({ buscar: lista.buscar, buscarStats: lista.buscarStats });
  const manutencao = useManutencao(lista.buscar);

  // No celular as duas colunas nao cabem lado a lado: uma aba de cada vez.
  const [abaDoCelular, setAbaDoCelular] = useState<Papel>("TARGET");
  const ehFonteNoCelular = abaDoCelular === "SOURCE";

  return (
    <>
      <Header title="Grupos" subtitle="Gerencie grupos de monitoramento e publicação" />

      <div className="p-6 space-y-6">
        <BarraDeAcoes manutencao={manutencao} />

        <DialogoSincronizar
          aberto={manutencao.modalSync}
          aoMudar={manutencao.setModalSync}
          sincronizando={manutencao.sincronizando}
          aoEscolher={manutencao.sincronizar}
        />
        <DialogoAcesso
          aberto={manutencao.modalAcesso}
          aoMudar={manutencao.setModalAcesso}
          relatorio={manutencao.relatorio}
        />
        <DialogoAdicionar manutencao={manutencao} />

        {lista.carregando ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-brand-gold" />
          </div>
        ) : lista.totalCarregado === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Users className="mb-3 h-12 w-12 opacity-20" />
            <p className="text-sm">Nenhum grupo encontrado</p>
            <p className="text-xs mt-1">Clique em Sincronizar para importar grupos do WhatsApp</p>
          </div>
        ) : (
          <>
            <Filtros
              busca={lista.busca}
              setBusca={lista.setBusca}
              regioes={lista.regioes}
              setRegioes={lista.setRegioes}
              tipo={lista.tipo}
              setTipo={lista.setTipo}
              statsFonte={lista.statsFonte}
              statsDestino={lista.statsDestino}
              abaDoCelular={abaDoCelular}
              setAbaDoCelular={setAbaDoCelular}
              totalFonte={lista.fonte?.pagination.total ?? 0}
              totalDestino={lista.destino?.pagination.total ?? 0}
            />

            <div className="hidden lg:grid grid-cols-2 gap-6">
              <ColunaDeGrupos
                papel="SOURCE"
                dados={lista.fonte}
                grupos={lista.gruposFonte}
                acoes={acoes}
                aoTrocarPagina={lista.setPaginaFonte}
                aoLigarTodos={(papel, ativo) => manutencao.ligarTodos(papel, ativo, lista.tipo)}
              />
              <ColunaDeGrupos
                papel="TARGET"
                dados={lista.destino}
                grupos={lista.gruposDestino}
                acoes={acoes}
                aoTrocarPagina={lista.setPaginaDestino}
                aoLigarTodos={(papel, ativo) => manutencao.ligarTodos(papel, ativo, lista.tipo)}
              />
            </div>

            <div className="lg:hidden">
              <ColunaDeGrupos
                compacto
                papel={abaDoCelular}
                dados={ehFonteNoCelular ? lista.fonte : lista.destino}
                grupos={ehFonteNoCelular ? lista.gruposFonte : lista.gruposDestino}
                acoes={acoes}
                aoTrocarPagina={ehFonteNoCelular ? lista.setPaginaFonte : lista.setPaginaDestino}
                aoLigarTodos={(papel, ativo) => manutencao.ligarTodos(papel, ativo, lista.tipo)}
              />
            </div>
          </>
        )}
      </div>

      <MenuDeTipo acoes={acoes} />
    </>
  );
}
