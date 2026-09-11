"use client";

import { Loader2, Search, UserCog } from "lucide-react";
import { Header } from "@/components/layout/header";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { BarraDeFiltros } from "./_componentes/barra-de-filtros";
import { DialogoUsuario } from "./_componentes/dialogo-usuario";
import { ListaDeUsuarios } from "./_componentes/lista-de-usuarios";
import { useFormulario } from "./_ganchos/use-formulario";
import { useUsuarios } from "./_ganchos/use-usuarios";

export default function UsuariosPage() {
  const lista = useUsuarios();
  const form = useFormulario(lista.buscar);

  // Base vazia e busca sem resultado sao coisas diferentes: uma pede pra criar
  // o primeiro usuario, a outra pede pra mudar o filtro.
  const semNenhum = lista.usuarios.length === 0;
  const semResultado = !semNenhum && lista.filtrados.length === 0;

  return (
    <>
      <Header title="Usuários" subtitle="Gerenciamento de usuários do sistema" />

      <PageContainer>
        <BarraDeFiltros lista={lista} aoCriar={form.abrirNovo} />

        {lista.carregando ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-brand-gold" />
          </div>
        ) : semNenhum ? (
          <EmptyState
            icon={<UserCog />}
            title="Nenhum usuário cadastrado"
            description="Adicione operadores ou administradores para acessar o sistema."
            actionLabel="Novo usuário"
            onAction={form.abrirNovo}
          />
        ) : semResultado ? (
          <EmptyState
            icon={<Search />}
            title="Nenhum usuário encontrado"
            description={
              lista.busca
                ? `Nenhum resultado para "${lista.busca}".`
                : `Sem usuários ${lista.status === "active" ? "ativos" : "inativos"} no momento.`
            }
          />
        ) : (
          <ListaDeUsuarios lista={lista} aoEditar={form.abrirEdicao} />
        )}
      </PageContainer>

      <DialogoUsuario form={form} />
    </>
  );
}
