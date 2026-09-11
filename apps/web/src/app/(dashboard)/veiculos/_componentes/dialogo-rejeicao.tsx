"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { REJECTION_OPTIONS } from "./tipos";

// ---------------------------------------------------------------------------
// Motivo da rejeicao.
//
// Os motivos viram etiqueta no banco e alimentam o relatorio de por que a
// fila esta sendo descartada. O texto livre e complemento, nao substituto --
// por isso o botao exige ao menos um dos dois.
//
// O que o operador digitou nao interessa a mais ninguem, entao o estado mora
// aqui dentro e some quando o dialogo fecha.
// ---------------------------------------------------------------------------

interface Props {
  veiculoId: string | null;
  carregando: boolean;
  aoFechar: () => void;
  aoConfirmar: (motivo: string, etiquetas: string[]) => void;
}

export function DialogoRejeicao({ veiculoId, carregando, aoFechar, aoConfirmar }: Props) {
  const [motivo, setMotivo] = useState("");
  const [etiquetas, setEtiquetas] = useState<string[]>([]);

  // Cada veiculo comeca com a ficha em branco.
  useEffect(() => {
    setMotivo("");
    setEtiquetas([]);
  }, [veiculoId]);

  return (
    <Dialog open={!!veiculoId} onOpenChange={(open) => !open && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Rejeitar veículo
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <p className="text-xs text-muted-foreground">Selecione um ou mais motivos:</p>
          <div className="space-y-1">
            {REJECTION_OPTIONS.map((opt) => {
              const marcado = etiquetas.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  className={cn(
                    "flex items-start gap-3 cursor-pointer rounded-lg p-2.5 border transition-colors",
                    marcado ? "bg-destructive/5 border-destructive/30" : "border-border hover:bg-white/[0.03]"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={(e) => setEtiquetas((prev) =>
                      e.target.checked ? [...prev, opt.id] : prev.filter((t) => t !== opt.id)
                    )}
                    className="mt-0.5 accent-destructive shrink-0"
                  />
                  <span className="text-sm leading-snug">{opt.label}</span>
                </label>
              );
            })}
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Outros detalhes (opcional)</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: Carro de leilao suspeito..."
              rows={2}
              className="w-full rounded-lg bg-card border border-border p-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-destructive/50"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={aoFechar} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={() => aoConfirmar(motivo, etiquetas)}
              disabled={(etiquetas.length === 0 && !motivo.trim()) || carregando}
              className="flex-1 bg-destructive hover:bg-destructive/90 text-white border-0"
            >
              {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Rejeitar{etiquetas.length > 0 && ` (${etiquetas.length})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
