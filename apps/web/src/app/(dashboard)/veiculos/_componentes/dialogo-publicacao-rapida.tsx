"use client";

import { Check, ChevronDown, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { tituloDoAnuncio } from "@/lib/vehicle-formatter";
import type { Grupos } from "../_ganchos/use-grupos";
import type { PublicacaoRapida } from "../_ganchos/use-publicacao-rapida";
import { estadoDoVeiculo, formatPrice } from "./tipos";

// ---------------------------------------------------------------------------
// Confirmacao do "publicar direto".
//
// A lista de grupos aqui e mais compacta que a do modal completo -- linha por
// grupo, sem chips -- porque este dialogo cabe na largura de um celular e o
// operador esta no meio da triagem, com o dedo na tela.
//
// A chave da selecao e sempre `groupId` (o JID do WhatsApp), nunca o `id` do
// banco: e por ela que o servidor acha o grupo.
// ---------------------------------------------------------------------------

interface Props {
  rapida: PublicacaoRapida;
  grupos: Grupos;
}

export function DialogoPublicacaoRapida({ rapida, grupos }: Props) {
  const { veiculo, selecionados, setSelecionados, publicandoId, fechar, confirmar } = rapida;
  const estado = veiculo ? estadoDoVeiculo(veiculo) : null;

  return (
    <Dialog open={!!veiculo} onOpenChange={(open) => { if (!open && !publicandoId) fechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-success" />
            Publicar direto
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          {veiculo && (
            <div className="rounded-lg bg-card border border-border p-3">
              <p className="text-sm font-medium">{tituloDoAnuncio(veiculo)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {veiculo.year} • {veiculo.km.toLocaleString("pt-BR")} km • {formatPrice(veiculo.price)}
                {estado && <> • <span className="text-brand-gold font-semibold">{estado}</span></>}
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">Selecione os grupos para publicar:</p>

          <div className="max-h-[50vh] overflow-y-auto space-y-2">
            {Array.from(grupos.gruposPorRegiao.entries()).map(([regiao, lista]) => {
              const ids = lista.map((g) => g.groupId);
              const marcados = ids.filter((id) => selecionados.includes(id)).length;
              const todos = marcados === lista.length;
              const aberta = grupos.regioesAbertas.has(`__quick_${regiao}`);
              return (
                <div key={regiao} className="rounded-lg border border-border overflow-hidden">
                  <div className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
                    <button
                      onClick={() => setSelecionados((prev) =>
                        todos
                          ? prev.filter((id) => !ids.includes(id))
                          : [...new Set([...prev, ...ids])]
                      )}
                      className="flex items-center gap-3 flex-1 text-left"
                    >
                      <div className={cn(
                        "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                        todos ? "bg-brand-gold border-brand-gold" : marcados > 0 ? "bg-brand-gold/50 border-brand-gold" : "border-muted-foreground/30"
                      )}>
                        {(todos || marcados > 0) && <Check className="h-2.5 w-2.5 text-white" />}
                      </div>
                      <span className="text-sm font-medium">{regiao}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{marcados}/{lista.length}</span>
                    </button>
                    <button
                      onClick={() => grupos.alternarAbertura(`__quick_${regiao}`)}
                      className="p-1 rounded hover:bg-white/[0.05] shrink-0"
                      title={aberta ? "Recolher" : "Expandir"}
                    >
                      <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", aberta && "rotate-180")} />
                    </button>
                  </div>
                  {aberta && (
                    <div className="border-t border-border/50 bg-card/30 max-h-60 overflow-y-auto">
                      {lista.map((grupo) => (
                        <label
                          key={grupo.id}
                          className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-white/[0.03] transition-colors border-b border-border/30 last:border-0"
                        >
                          <input
                            type="checkbox"
                            checked={selecionados.includes(grupo.groupId)}
                            onChange={(e) => setSelecionados((prev) =>
                              e.target.checked
                                ? [...new Set([...prev, grupo.groupId])]
                                : prev.filter((id) => id !== grupo.groupId)
                            )}
                            className="accent-brand-gold shrink-0"
                          />
                          <span className="text-xs truncate flex-1">{grupo.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={fechar} disabled={!!publicandoId} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={confirmar}
              disabled={selecionados.length === 0 || !!publicandoId}
              className="flex-1 bg-success hover:bg-success/90 text-white border-0"
            >
              {publicandoId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Publicar ({selecionados.length})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
