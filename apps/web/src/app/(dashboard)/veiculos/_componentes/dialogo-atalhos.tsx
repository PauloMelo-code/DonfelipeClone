"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Ajuda dos atalhos da aba Pendentes. Abre com "?".
// ---------------------------------------------------------------------------

const ATALHOS = [
  { acao: "Rejeitar", tecla: "←" },
  { acao: "Aprovar", tecla: "→" },
  { acao: "Publicar direto", tecla: "↑" },
  { acao: "Mostrar ajuda", tecla: "?" },
];

export function DialogoAtalhos({ aberto, aoMudar }: { aberto: boolean; aoMudar: (v: boolean) => void }) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Atalhos de teclado</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2 text-sm">
          {ATALHOS.map(({ acao, tecla }) => (
            <div key={acao} className="flex items-center justify-between">
              <span className="text-muted-foreground">{acao}</span>
              <kbd className="rounded bg-card border border-border px-2 py-1 text-xs">{tecla}</kbd>
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
