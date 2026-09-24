"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { Car, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Header } from "@/components/layout/header";
import { BannerProntos } from "./_componentes/banner-prontos";
import { BarraDeFiltros } from "./_componentes/barra-de-filtros";
import { BarraDeLote } from "./_componentes/barra-de-lote";
import { DialogoAtalhos } from "./_componentes/dialogo-atalhos";
import { DialogoGaleria } from "./_componentes/dialogo-galeria";
import { DialogoLote } from "./_componentes/dialogo-lote";
import { DialogoPreview } from "./_componentes/dialogo-preview";
import { DialogoPublicacao } from "./_componentes/dialogo-publicacao";
import { DialogoPublicacaoRapida } from "./_componentes/dialogo-publicacao-rapida";
import { DialogoRejeicao } from "./_componentes/dialogo-rejeicao";
import { GradeDeVeiculos } from "./_componentes/grade-de-veiculos";
import { PilhaPendentes } from "./_componentes/pilha-pendentes";
import type { Vehicle } from "./_componentes/tipos";
import { useAutocorrecao } from "./_ganchos/use-autocorrecao";
import { useFila } from "./_ganchos/use-fila";
import { useModoDosPendentes } from "./_ganchos/use-modo-dos-pendentes";
import { useGrupos } from "./_ganchos/use-grupos";
import { useLote } from "./_ganchos/use-lote";
import { usePublicacao } from "./_ganchos/use-publicacao";
import { usePublicacaoRapida } from "./_ganchos/use-publicacao-rapida";

// Envolve a pagina em <Suspense> -- exigido pelo Next.js quando algum filho
// usa useSearchParams() (o prerender cai pro cliente).
export default function VeiculosPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-gold" /></div>}>
      <TelaDeVeiculos />
    </Suspense>
  );
}

function TelaDeVeiculos() {
  const fila = useFila();
  const grupos = useGrupos();

  const pub = usePublicacao({
    grupos: grupos.grupos,
    carregarGrupos: grupos.carregar,
    gruposSelecionados: grupos.selecionados,
    setGruposSelecionados: grupos.setSelecionados,
    setRegioesAbertas: grupos.setRegioesAbertas,
    removerDaLista: fila.removerDaLista,
    buscar: fila.buscar,
  });

  const rapida = usePublicacaoRapida({
    grupos: grupos.grupos,
    carregarGrupos: grupos.carregar,
    setRegioesAbertas: grupos.setRegioesAbertas,
    removerDaLista: fila.removerDaLista,
    buscar: fila.buscar,
  });

  const lote = useLote({
    filtrados: fila.filtrados,
    setVehicles: fila.setVehicles,
    buscar: fila.buscar,
    gruposSelecionados: grupos.selecionados,
  });

  useAutocorrecao(fila.buscar);

  // Pendentes em pilha (um carro de cada vez) ou em lista (todos de uma vez).
  const [modoDosPendentes, trocarModoDosPendentes] = useModoDosPendentes();
  const pilhaAberta = fila.isPending && modoDosPendentes === "cards";

  const [preview, setPreview] = useState<Vehicle | null>(null);
  const [galeria, setGaleria] = useState<Vehicle | null>(null);
  const [fotoDaGaleria, setFotoDaGaleria] = useState(0);
  const [rejeitando, setRejeitando] = useState<string | null>(null);
  const [mostrarAtalhos, setMostrarAtalhos] = useState(false);

  /** Os componentes filhos so tem o id em maos; a fila tem o veiculo. */
  const porId = useCallback((id: string) => fila.vehicles.find((v) => v.id === id), [fila.vehicles]);

  const aprovar = useCallback(
    (id: string) => fila.executarAcao(id, "approve", setRejeitando),
    [fila],
  );

  const publicarDireto = useCallback((id: string) => {
    const v = porId(id);
    if (v) rapida.abrir(v);
  }, [porId, rapida]);

  // Atalhos da aba Pendentes: agem sempre no carro do topo da pilha.
  useEffect(() => {
    // Na lista nao ha "carro do topo": a seta agiria num carro que o operador
    // nem esta olhando.
    if (!pilhaAberta) return;
    const handler = (e: KeyboardEvent) => {
      // Fora quando o operador esta digitando ou com algum modal aberto.
      const alvo = e.target as HTMLElement;
      if (alvo?.tagName === "INPUT" || alvo?.tagName === "TEXTAREA" || alvo?.isContentEditable) return;
      if (rejeitando || pub.veiculo || rapida.veiculo || galeria) return;

      const topo = fila.swipeVehicles[0];
      if (!topo) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setRejeitando(topo.id);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        aprovar(topo.id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        publicarDireto(topo.id);
      } else if (e.key === "?") {
        e.preventDefault();
        setMostrarAtalhos(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pilhaAberta, fila.swipeVehicles, rejeitando, pub.veiculo, rapida.veiculo, galeria, aprovar, publicarDireto]);

  const aprovadosNaTela = fila.filtrados.filter((v) => v.status === "APPROVED").length;

  const abrirLote = () => {
    // O lote comeca com TODOS os grupos marcados -- o operador tira o que nao quer.
    if (grupos.grupos.length === 0) {
      grupos.carregar().then((lista) => grupos.setSelecionados(lista.map((g) => g.groupId)));
    } else {
      grupos.setSelecionados(grupos.grupos.map((g) => g.groupId));
    }
    lote.setModalAberto(true);
  };

  return (
    <>
      <Header title="Veículos" subtitle="Fila de revisão e publicação" />

      <div className="p-6 space-y-4">
        <BarraDeFiltros
          abaAtiva={fila.activeTab}
          aoTrocarAba={fila.setActiveTab}
          filtros={fila.filters}
          setFiltros={fila.setFilters}
          busca={fila.search}
          setBusca={fila.setSearch}
          ehPendentes={fila.isPending}
          modoDosPendentes={modoDosPendentes}
          aoTrocarModoDosPendentes={trocarModoDosPendentes}
          mostrarSelecionarTodos={fila.activeTab === "APPROVED" && fila.filtrados.length > 0}
          todosMarcados={lote.selecionados.size === aprovadosNaTela && lote.selecionados.size > 0}
          aoSelecionarTodos={lote.marcarTodosAprovados}
        />

        {fila.activeTab === "PREPARED" && !fila.loading && fila.filtrados.length > 0 && (
          <BannerProntos
            veiculos={fila.filtrados}
            publicando={lote.publicando}
            aoPublicar={lote.publicarProntos}
          />
        )}

        {fila.loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-brand-gold" />
          </div>
        ) : pilhaAberta ? (
          <PilhaPendentes
            veiculos={fila.swipeVehicles}
            carregandoAcao={fila.actionLoading}
            publicandoId={rapida.publicandoId}
            aoAprovar={aprovar}
            aoRejeitar={setRejeitando}
            aoPublicarDireto={publicarDireto}
            aoAbrirGaleria={(id) => { const v = porId(id); if (v) { setGaleria(v); setFotoDaGaleria(0); } }}
            aoEditarFotoPrincipal={fila.trocarFotoPrincipal}
            aoDefinirPrincipal={fila.definirFotoPrincipal}
            aoAtualizarCampo={fila.atualizarCampo}
            aoMostrarAtalhos={() => setMostrarAtalhos(true)}
          />
        ) : fila.filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-gold/[0.06] border border-brand-gold/10">
              <Car className="h-10 w-10 text-brand-gold/40" />
            </div>
            <p className="text-base font-medium text-foreground/70">Fila vazia</p>
            <p className="mt-1 text-sm text-muted-foreground/50">Nenhum veículo nesta categoria no momento</p>
          </div>
        ) : (
          <GradeDeVeiculos
            veiculos={fila.filtrados}
            abaAtiva={fila.activeTab}
            carregandoAcao={fila.actionLoading}
            marcados={lote.selecionados}
            aoMarcar={lote.alternar}
            aoEditar={(v) => pub.abrirParaPublicar(v)}
            aoReenviar={pub.abrirParaReenviar}
            aoRejeitar={setRejeitando}
            aoPreVisualizar={setPreview}
            aoAprovar={aprovar}
            aoPublicarDireto={publicarDireto}
            publicandoId={rapida.publicandoId}
            aoAtualizarCampo={fila.atualizarCampo}
            aoAbrirGaleria={(id) => { const v = porId(id); if (v) { setGaleria(v); setFotoDaGaleria(0); } }}
            aoEditarFotoPrincipal={fila.trocarFotoPrincipal}
            aoDefinirPrincipal={fila.definirFotoPrincipal}
          />
        )}

        {!pilhaAberta && fila.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-4">
            <button
              onClick={() => fila.setPage((p) => Math.max(1, p - 1))}
              disabled={fila.page <= 1}
              className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Anterior
            </button>
            <span className="text-xs text-muted-foreground">
              {fila.page} / {fila.totalPages} ({fila.totalCount} veículos)
            </span>
            <button
              onClick={() => fila.setPage((p) => Math.min(fila.totalPages, p + 1))}
              disabled={fila.page >= fila.totalPages}
              className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              Próximo
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {fila.activeTab === "APPROVED" && lote.selecionados.size > 0 && (
        <BarraDeLote
          quantidade={lote.selecionados.size}
          aoLimpar={() => lote.setSelecionados(new Set())}
          aoAbrir={abrirLote}
        />
      )}

      <DialogoPreview veiculo={preview} aoFechar={() => setPreview(null)} />

      <DialogoPublicacao pub={pub} grupos={grupos} carregandoAcao={fila.actionLoading} />

      <DialogoGaleria
        veiculo={galeria}
        indice={fotoDaGaleria}
        aoTrocarIndice={setFotoDaGaleria}
        aoFechar={() => setGaleria(null)}
      />

      <DialogoRejeicao
        veiculoId={rejeitando}
        carregando={fila.actionLoading === rejeitando}
        aoFechar={() => setRejeitando(null)}
        aoConfirmar={async (motivo, etiquetas) => {
          if (!rejeitando) return;
          if (await fila.rejeitar(rejeitando, motivo, etiquetas)) setRejeitando(null);
        }}
      />

      <DialogoPublicacaoRapida rapida={rapida} grupos={grupos} />

      <DialogoAtalhos aberto={mostrarAtalhos} aoMudar={setMostrarAtalhos} />

      <DialogoLote
        aberto={lote.modalAberto}
        quantidade={lote.selecionados.size}
        grupos={grupos}
        publicando={lote.publicando}
        aoFechar={() => lote.setModalAberto(false)}
        aoConfirmar={lote.publicar}
      />
    </>
  );
}
