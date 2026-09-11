"use client";

import { Loader2, Send, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Grupos } from "../_ganchos/use-grupos";
import { SeletorDeGrupos } from "./seletor-de-grupos";

// ---------------------------------------------------------------------------
// Envio em lote dos aprovados que o operador marcou na grade.
//
// Os grupos sao escolhidos uma vez e valem pra todos os carros marcados. O
// envio em si e do servidor, com fila e ritmo proprio -- aqui so se decide o
// destino.
// ---------------------------------------------------------------------------

interface Props {
  aberto: boolean;
  quantidade: number;
  grupos: Grupos;
  publicando: boolean;
  aoFechar: () => void;
  aoConfirmar: () => void;
}

export function DialogoLote({ aberto, quantidade, grupos, publicando, aoFechar, aoConfirmar }: Props) {
  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && aoFechar()}>
      <DialogContent showCloseButton={false} className="inset-0 translate-x-0 translate-y-0 max-w-none rounded-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-2xl sm:rounded-xl p-0 overflow-hidden bg-[#0D0D0D] ring-1 ring-white/10 h-full sm:h-auto">
        <div className="flex flex-col h-full sm:max-h-[95vh]">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">Publicar em lote</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {quantidade} veículo{quantidade !== 1 ? "s" : ""} selecionado{quantidade !== 1 ? "s" : ""}
              </p>
            </div>
            <button onClick={aoFechar} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {publicando ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-brand-gold" />
                <p className="text-sm text-muted-foreground">Publicando veículos...</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Enviar para:</span>
                </div>
                {grupos.grupos.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60">Nenhum grupo destino configurado</p>
                ) : (
                  <SeletorDeGrupos
                    gruposPorRegiao={grupos.gruposPorRegiao}
                    selecionados={grupos.selecionados}
                    regioesAbertas={grupos.regioesAbertas}
                    aoAlternarRegiao={grupos.alternarRegiao}
                    aoAlternarGrupo={grupos.alternarGrupo}
                    aoAbrirRegiao={grupos.alternarAbertura}
                  />
                )}
              </div>
            )}
          </div>

          {!publicando && (
            <div className="px-5 py-4 border-t border-white/10 flex gap-3">
              <Button variant="outline" className="flex-1 border-border" onClick={aoFechar}>
                Cancelar
              </Button>
              <Button
                className="flex-1 gradient-gold text-white border-0 gap-1.5"
                onClick={aoConfirmar}
                disabled={grupos.selecionados.length === 0}
              >
                <Send className="h-4 w-4" />
                Confirmar e publicar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
