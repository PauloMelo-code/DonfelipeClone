"use client";

import { useCallback, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Car, Check, X } from "lucide-react";
import { SwipeCard } from "./cartao";
import type { SwipeStackProps } from "./tipos";

export type { SwipeVehicle, SwipeStackProps } from "./tipos";

// ---------------------------------------------------------------------------
// A pilha de triagem: um carro de cada vez, arrastando pra decidir.
//
// So dois cards ficam montados. O de baixo aparece menor e mais apagado pra
// dar a sensacao de pilha, e nao recebe ponteiro -- o resto da fila nem entra
// no DOM, senao a lista inteira renderizaria a cada decisao.
//
// A direcao da saida e guardada aqui, e nao no card, porque quem sai da tela e
// o card que esta indo embora: quando ele desmonta, quem informa a animacao de
// saida e a pilha.
// ---------------------------------------------------------------------------

/** Quantos cards ficam montados ao mesmo tempo. */
const CARDS_VISIVEIS = 2;

export function SwipeStack({
  vehicles,
  onApprove,
  onReject,
  onPhotoClick,
  onSetMainPhoto,
  onPhotoEdited,
  actionLoading,
  onPublishDirect,
  onUpdateField,
  publishingDirectId,
}: SwipeStackProps) {
  const [direcaoDeSaida, setDirecaoDeSaida] = useState<"left" | "right" | null>(null);

  const aprovar = useCallback((id: string) => {
    setDirecaoDeSaida("right");
    onApprove(id);
  }, [onApprove]);

  const rejeitar = useCallback((id: string) => {
    setDirecaoDeSaida("left");
    onReject(id);
  }, [onReject]);

  if (vehicles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Car className="mb-3 h-12 w-12 opacity-30" />
        <p className="text-sm">Nenhum veículo pendente</p>
      </div>
    );
  }

  // Invertido pra o primeiro da fila ficar por ultimo no DOM, e portanto por cima.
  const naTela = vehicles.slice(0, CARDS_VISIVEIS).reverse();

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex items-center gap-8 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <X className="h-3.5 w-3.5 text-destructive" /> Arraste para rejeitar
        </span>
        <span className="flex items-center gap-1">
          Arraste para aprovar <Check className="h-3.5 w-3.5 text-success" />
        </span>
      </div>

      <div className="relative w-full max-w-sm mx-auto">
        <AnimatePresence mode="popLayout" custom={direcaoDeSaida}>
          {naTela.map((vehicle, i) => (
            <SwipeCard
              key={vehicle.id}
              vehicle={vehicle}
              isTop={i === naTela.length - 1}
              exitDir={direcaoDeSaida}
              onApprove={aprovar}
              onReject={rejeitar}
              onPhotoClick={onPhotoClick}
              onSetMainPhoto={onSetMainPhoto}
              onPhotoEdited={onPhotoEdited}
              actionLoading={actionLoading}
              onPublishDirect={onPublishDirect}
              onUpdateField={onUpdateField}
              publishingDirectId={publishingDirectId}
            />
          ))}
        </AnimatePresence>
      </div>

      <p className="text-sm text-muted-foreground">
        {vehicles.length} veículo(s) pendente(s)
      </p>
    </div>
  );
}
