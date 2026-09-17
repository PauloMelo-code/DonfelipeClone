"use client";

import { ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { SwipeStack } from "@/components/vehicles/swipe-stack";
import type { Vehicle } from "./tipos";

// ---------------------------------------------------------------------------
// Triagem da aba Pendentes: um carro de cada vez, decisao por swipe.
//
// Esquerda rejeita, direita aprova, cima publica direto. O teclado faz o
// mesmo, e a legenda em cima lembra disso em telas grandes.
// ---------------------------------------------------------------------------

/** O SwipeStack quer os campos ja como array, nao como JSON em texto. */
type VeiculoDaPilha = Omit<Vehicle, "features" | "photos"> & { features: string[]; photos: string[] };

interface Props {
  veiculos: VeiculoDaPilha[];
  carregandoAcao: string | null;
  publicandoId: string | null;
  aoAprovar: (id: string) => void;
  aoRejeitar: (id: string) => void;
  aoPublicarDireto: (id: string) => void;
  aoAbrirGaleria: (id: string) => void;
  aoEditarFotoPrincipal: (id: string, foto: string) => void;
  aoDefinirPrincipal: (id: string, indice: number) => void;
  aoAtualizarCampo: (id: string, campo: string, valor: string | number) => Promise<void>;
  aoMostrarAtalhos: () => void;
}

export function PilhaPendentes({
  veiculos, carregandoAcao, publicandoId,
  aoAprovar, aoRejeitar, aoPublicarDireto, aoAbrirGaleria, aoEditarFotoPrincipal,
  aoDefinirPrincipal, aoAtualizarCampo, aoMostrarAtalhos,
}: Props) {
  return (
    <>
      <div className="hidden sm:flex items-center justify-center gap-3 text-[11px] text-muted-foreground/70 mt-2">
        <kbd className="inline-flex items-center rounded bg-card border border-border px-1.5 py-1"><ArrowLeft className="h-3 w-3" /></kbd> Rejeitar
        <kbd className="inline-flex items-center rounded bg-card border border-border px-1.5 py-1"><ArrowRight className="h-3 w-3" /></kbd> Aprovar
        <kbd className="inline-flex items-center rounded bg-card border border-border px-1.5 py-1"><ArrowUp className="h-3 w-3" /></kbd> Publicar direto
        <button
          onClick={aoMostrarAtalhos}
          className="rounded bg-card border border-border px-1.5 py-0.5 hover:text-foreground transition-colors"
          title="Atalhos de teclado"
        >
          ? Ajuda
        </button>
      </div>
      <SwipeStack
        vehicles={veiculos}
        onApprove={aoAprovar}
        onReject={aoRejeitar}
        onPhotoClick={(v) => aoAbrirGaleria(v.id)}
        onSetMainPhoto={aoDefinirPrincipal}
        onPhotoEdited={aoEditarFotoPrincipal}
        actionLoading={carregandoAcao}
        onPublishDirect={aoPublicarDireto}
        onUpdateField={aoAtualizarCampo}
        publishingDirectId={publicandoId}
      />
    </>
  );
}
