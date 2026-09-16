"use client";

import type { ReactNode } from "react";
import { Car, Pencil, Trash2, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { tituloDoAnuncio } from "@/lib/vehicle-formatter";
import type { CardProps } from "./tipos";

// ---------------------------------------------------------------------------
// A foto do card e o que se faz nela sem sair da triagem.
//
// Todo controle aqui precisa parar a propagacao do ponteiro: o card inteiro e
// arrastavel, e sem isso tocar num botao viraria um swipe. Por isso existe o
// `BotaoSobreFoto` -- era o mesmo par de handlers repetido em cada botao.
// ---------------------------------------------------------------------------

/** Pilula flutuante sobre a foto, imune ao arrasto do card. */
function BotaoSobreFoto({
  posicao, cor, titulo, aoClicar, children,
}: {
  posicao: string;
  cor: string;
  titulo?: string;
  aoClicar: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); aoClicar(); }}
      title={titulo}
      className={cn(
        "absolute z-30 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-all pointer-events-auto",
        posicao, cor
      )}
    >
      {children}
    </button>
  );
}

type Props = Pick<CardProps,
  "vehicle" | "isTop" | "onPhotoClick" | "onDeletePhoto" | "onSetMainPhoto" | "onEditPhoto">;

export function FotoDoCard({
  vehicle, isTop, onPhotoClick, onDeletePhoto, onSetMainPhoto, onEditPhoto,
}: Props) {
  const fotos = vehicle.photos;
  const temFoto = fotos.length > 0;

  return (
    <div className="relative h-48 sm:h-60 bg-card shrink-0 group/photo">
      {temFoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fotos[0]}
          alt={vehicle.model}
          className="h-full w-full object-cover pointer-events-none select-none"
          draggable={false}
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Car className="h-16 w-16 text-muted-foreground/20" />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />

      {isTop && fotos.length > 1 && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute bottom-2 left-2 right-2 z-30 flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin"
        >
          {fotos.map((foto, i) => (
            <div
              key={`${foto}-${i}`}
              className={cn(
                "relative shrink-0 rounded-md overflow-hidden border-2 transition-all group/thumb",
                i === 0 ? "border-brand-gold ring-1 ring-brand-gold/40" : "border-white/30 hover:border-white"
              )}
              style={{ width: 44, height: 44 }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (i !== 0 && onSetMainPhoto) onSetMainPhoto(vehicle.id, i);
                }}
                className="block w-full h-full"
                title={i === 0 ? "Foto principal" : "Tornar foto principal"}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={foto} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" draggable={false} />
              </button>
              {onDeletePhoto && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // A capa e a que vai pro WhatsApp: apagar ela promove a proxima.
                    const pergunta = i === 0
                      ? "Excluir foto principal? A 2a foto vira a principal."
                      : "Excluir esta foto?";
                    if (confirm(pergunta)) onDeletePhoto(vehicle.id, i);
                  }}
                  className="absolute top-0 right-0 bg-destructive text-white rounded-bl-md w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover/thumb:opacity-100 hover:bg-destructive/80 transition-opacity"
                  title="Excluir foto"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isTop && onPhotoClick && (
        <BotaoSobreFoto
          posicao="top-3 right-3"
          cor="bg-black/60 text-white/80 hover:text-white hover:bg-black/80"
          aoClicar={() => onPhotoClick(vehicle)}
        >
          <ZoomIn className="h-3.5 w-3.5" />
          Ver original
        </BotaoSobreFoto>
      )}

      {isTop && onDeletePhoto && temFoto && (
        <BotaoSobreFoto
          posicao="top-3 left-3"
          cor="bg-black/60 text-destructive/80 hover:text-destructive hover:bg-black/80"
          aoClicar={() => { if (confirm("Excluir esta foto?")) onDeletePhoto(vehicle.id, 0); }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Excluir
        </BotaoSobreFoto>
      )}

      {isTop && onEditPhoto && temFoto && (
        <BotaoSobreFoto
          posicao="top-12 left-3"
          cor="bg-brand-gold/90 text-black hover:bg-brand-gold"
          titulo="Editar foto (cortar/pintar)"
          aoClicar={() => onEditPhoto(vehicle)}
        >
          <Pencil className="h-3.5 w-3.5" />
          Editar foto
        </BotaoSobreFoto>
      )}

      <div className="absolute bottom-3 left-4 right-4">
        <h3 className="text-lg font-bold text-white drop-shadow-lg">
          {tituloDoAnuncio(vehicle)}
        </h3>
      </div>
    </div>
  );
}
