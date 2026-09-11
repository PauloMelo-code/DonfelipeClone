"use client";

import { ChevronLeft, ChevronRight, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BolhaRecebida } from "./bolha-whatsapp";
import { formatKm, parseArray, type Vehicle } from "./tipos";

// ---------------------------------------------------------------------------
// Galeria de fotos com a mensagem original ao lado.
//
// Serve pra conferir o carro contra a fonte: as fotos que chegaram e o texto
// exato do grupo de repasse, sem nenhum tratamento.
// ---------------------------------------------------------------------------

interface Props {
  veiculo: Vehicle | null;
  indice: number;
  aoTrocarIndice: (i: number) => void;
  aoFechar: () => void;
}

export function DialogoGaleria({ veiculo, indice, aoTrocarIndice, aoFechar }: Props) {
  const fotos = veiculo ? parseArray(veiculo.photos) : [];
  const temMarca = !!veiculo?.brand && !veiculo.model.toUpperCase().startsWith(veiculo.brand.toUpperCase());

  return (
    <Dialog open={!!veiculo} onOpenChange={(open) => !open && aoFechar()}>
      <DialogContent showCloseButton={false} className="inset-0 translate-x-0 translate-y-0 max-w-none rounded-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-2xl sm:rounded-xl p-0 overflow-hidden bg-[#0A0A0C] ring-1 ring-white/10 h-full sm:h-auto">
        {veiculo && (
          <div className="flex flex-col max-h-[90vh]">
            <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {temMarca ? `${veiculo.brand} ` : ""}{veiculo.model}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {veiculo.year} &middot; {formatKm(veiculo.km)}
                  {veiculo.sourceGroup && ` · ${veiculo.sourceGroup.name}`}
                </p>
              </div>
              <button onClick={aoFechar} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {fotos.length > 0 && (
              <div className="relative bg-black">
                <img
                  src={fotos[indice]}
                  alt={`Foto ${indice + 1}`}
                  className="w-full h-52 sm:h-80 object-contain"
                />
                {fotos.length > 1 && (
                  <>
                    <button
                      onClick={() => aoTrocarIndice((indice - 1 + fotos.length) % fotos.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white/80 hover:text-white hover:bg-black/80 transition-all"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => aoTrocarIndice((indice + 1) % fotos.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white/80 hover:text-white hover:bg-black/80 transition-all"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {fotos.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => aoTrocarIndice(i)}
                          className={cn(
                            "h-1.5 rounded-full transition-all",
                            i === indice ? "w-4 bg-brand-gold" : "w-1.5 bg-white/40 hover:bg-white/60"
                          )}
                        />
                      ))}
                    </div>
                    <div className="absolute top-3 right-3 bg-black/60 rounded-full px-2.5 py-0.5 text-[11px] text-white font-medium">
                      {indice + 1}/{fotos.length}
                    </div>
                  </>
                )}
                {fotos.length > 1 && (
                  <div className="flex gap-1 p-2 bg-black/80 overflow-x-auto">
                    {fotos.map((foto, i) => (
                      <button
                        key={i}
                        onClick={() => aoTrocarIndice(i)}
                        className={cn(
                          "h-12 w-16 shrink-0 rounded overflow-hidden border-2 transition-all",
                          i === indice ? "border-brand-gold" : "border-transparent opacity-50 hover:opacity-80"
                        )}
                      >
                        <img src={foto} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              <div className="bg-[#1F2C34] px-4 py-2 flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-[#2A3942] flex items-center justify-center">
                  <Users className="h-3 w-3 text-[#8696A0]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-[#E9EDEF] truncate">
                    {veiculo.sourceGroup?.name || "Grupo de Repasse"}
                  </p>
                  <p className="text-[9px] text-[#8696A0]">Mensagem original do WhatsApp</p>
                </div>
                <Badge className="text-[9px] bg-[#00A884]/10 text-[#00A884] border-[#00A884]/20">
                  Original
                </Badge>
              </div>
              <BolhaRecebida
                text={veiculo.rawDescription || "Sem descrição original disponível"}
                capturedAt={veiculo.capturedAt}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
