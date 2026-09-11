"use client";

import { Radio, RefreshCw, Target } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Qual numero de WhatsApp sincronizar.
//
// Sao dois: um recebe os anuncios dos grupos de repasse, outro publica. Cada
// um enxerga grupos diferentes, entao sincronizar o errado nao traz nada.
// ---------------------------------------------------------------------------

const OPCOES = [
  {
    id: "capture" as const,
    titulo: "Apenas FONTE (captura)",
    detalhe: "Atualiza só os grupos do número que RECEBE os anúncios.",
    icone: Radio,
    corDoIcone: "text-success",
    destaque: false,
  },
  {
    id: "send" as const,
    titulo: "Apenas DESTINO (envio)",
    detalhe: "Atualiza só os grupos do número que PUBLICA os anúncios.",
    icone: Target,
    corDoIcone: "text-brand-gold",
    destaque: false,
  },
  {
    id: "both" as const,
    titulo: "Ambas (recomendado)",
    detalhe: "Sincroniza fonte e destino de uma vez. Mais lento mas completo.",
    icone: RefreshCw,
    corDoIcone: "text-brand-gold",
    destaque: true,
  },
];

interface Props {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  sincronizando: boolean;
  aoEscolher: (instancia: "capture" | "send" | "both") => void;
}

export function DialogoSincronizar({ aberto, aoMudar, sincronizando, aoEscolher }: Props) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle>Sincronizar UAZAPI</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <p className="text-xs text-muted-foreground">Escolha qual número WhatsApp sincronizar:</p>
          {OPCOES.map((o) => (
            <button
              key={o.id}
              onClick={() => aoEscolher(o.id)}
              disabled={sincronizando}
              className={cn(
                "w-full text-left rounded-lg p-3 transition-colors",
                o.destaque
                  ? "border-2 border-brand-gold/50 bg-brand-gold/5 hover:border-brand-gold/70"
                  : "border border-border hover:border-brand-gold/40 hover:bg-brand-gold/5"
              )}
            >
              <p className="text-sm font-semibold flex items-center gap-2">
                <o.icone className={`h-4 w-4 ${o.corDoIcone}`} />
                {o.titulo}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{o.detalhe}</p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
