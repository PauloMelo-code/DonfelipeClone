"use client";

import { ArrowLeft, ArrowRight, ArrowUp, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Ajuda dos atalhos da aba Pendentes. Abre com "?".
// ---------------------------------------------------------------------------

const ATALHOS: { acao: string; tecla: string | null; icone: LucideIcon | null }[] = [
  { acao: "Rejeitar", tecla: null, icone: ArrowLeft },
  { acao: "Aprovar", tecla: null, icone: ArrowRight },
  { acao: "Publicar direto", tecla: null, icone: ArrowUp },
  { acao: "Mostrar ajuda", tecla: "?", icone: null },
];

export function DialogoAtalhos({ aberto, aoMudar }: { aberto: boolean; aoMudar: (v: boolean) => void }) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Atalhos de teclado</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2 text-sm">
          {ATALHOS.map(({ acao, tecla, icone: Icone }) => (
            <div key={acao} className="flex items-center justify-between">
              <span className="text-muted-foreground">{acao}</span>
              <kbd className="inline-flex items-center rounded bg-card border border-border px-2 py-1 text-xs">
                {Icone ? <Icone className="h-3.5 w-3.5" /> : tecla}
              </kbd>
            </div>
          ))}
          <p className="text-xs text-muted-foreground/60 pt-2 border-t border-border">
            Atalhos funcionam apenas na aba Pendentes, quando não há modais abertos e você não está digitando.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
