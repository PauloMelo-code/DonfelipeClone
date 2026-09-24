"use client";

import { Car } from "lucide-react";
import { cn } from "@/lib/utils";
import { tituloDoAnuncio } from "@/lib/vehicle-formatter";
import { FotoEditavel } from "./foto-editavel";
import type { VeiculoDaFoto } from "./tipos";

// ---------------------------------------------------------------------------
// A foto do card e o que se faz nela sem sair da triagem.
//
// No card de cima a foto principal ja vem editavel (recorte, blur e pincel) e
// o titulo desce pra baixo dela, pra nao cobrir o que se recorta. Excluir foto
// e o botao "Editar foto" sairam a pedido do cliente: nao ha motivo pra
// apagar foto na triagem, e a edicao agora acontece ali mesmo.
//
// O card de baixo so aparece de fundo: foto estatica com o titulo por cima.
// ---------------------------------------------------------------------------

interface Props {
  vehicle: VeiculoDaFoto;
  /** Na grade todo card esta "por cima": todos aceitam edicao. */
  isTop: boolean;
  /** Abrir a galeria. Quem chama ja sabe de qual carro se trata. */
  aoAmpliar?: () => void;
  onSetMainPhoto?: (vehicleId: string, indice: number) => void;
  onPhotoEdited?: (vehicleId: string, foto: string) => void;
  /** A grade poe a marca na frente; sem isto vale o titulo do anuncio. */
  titulo?: string;
}

export function FotoDoCard({ vehicle, isTop, aoAmpliar, onSetMainPhoto, onPhotoEdited, titulo: tituloDado }: Props) {
  const fotos = vehicle.photos;
  const titulo = tituloDado ?? tituloDoAnuncio(vehicle);
  const aoEditar = isTop && fotos.length > 0 && onPhotoEdited
    ? (foto: string) => onPhotoEdited(vehicle.id, foto)
    : null;

  return (
    <div className="shrink-0">
      {aoEditar ? (
        <FotoEditavel
          foto={fotos[0]}
          alt={vehicle.model}
          aoEditar={aoEditar}
          aoAmpliar={aoAmpliar}
        />
      ) : (
        <div className="relative h-48 sm:h-60 bg-card">
          {fotos.length > 0 ? (
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
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
          <h3 className="pointer-events-none absolute bottom-3 left-4 right-4 text-lg font-bold text-white drop-shadow-lg">
            {titulo}
          </h3>
        </div>
      )}

      {aoEditar && <h3 className="px-4 pt-1 text-lg font-bold text-foreground">{titulo}</h3>}

      {isTop && fotos.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto px-4 pt-2 pb-1 scrollbar-thin">
          {fotos.map((foto, i) => (
            <button
              key={`${foto.slice(0, 64)}-${i}`}
              type="button"
              onClick={() => { if (i !== 0) onSetMainPhoto?.(vehicle.id, i); }}
              title={i === 0 ? "Foto principal" : "Tornar foto principal"}
              className={cn(
                "h-11 w-11 shrink-0 overflow-hidden rounded-md border-2 transition-all",
                i === 0 ? "border-brand-gold ring-1 ring-brand-gold/40" : "border-white/20 hover:border-white/60"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
