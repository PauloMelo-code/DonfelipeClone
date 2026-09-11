"use client";

import { Layers, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Barra fixa no rodape com o que esta marcado na grade.
//
// So aparece na aba Aprovados e com algo marcado. Fica acima da navegacao do
// celular e respeita a area segura da tela.
// ---------------------------------------------------------------------------

interface Props {
  quantidade: number;
  aoLimpar: () => void;
  aoAbrir: () => void;
}

export function BarraDeLote({ quantidade, aoLimpar, aoAbrir }: Props) {
  const plural = quantidade > 1 ? "s" : "";
  return (
    <div className="fixed bottom-16 md:bottom-4 left-0 right-0 md:left-64 z-30 px-4 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-2xl mx-auto glass border border-brand-gold/20 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xl">
        <Layers className="h-5 w-5 text-brand-gold shrink-0" />
        <span className="text-sm font-medium flex-1">
          {quantidade} veículo{plural} selecionado{plural}
        </span>
        <button onClick={aoLimpar} className="text-xs text-muted-foreground hover:text-foreground">
          Limpar
        </button>
        <Button onClick={aoAbrir} size="sm" className="gap-1.5 gradient-gold text-black border-0 shrink-0">
          <Send className="h-3.5 w-3.5" />
          Publicar em lote
        </Button>
      </div>
    </div>
  );
}
