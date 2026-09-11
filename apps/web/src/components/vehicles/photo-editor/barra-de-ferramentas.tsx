"use client";

import { ImageIcon, Maximize2, Minimize2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EditorDeFoto } from "./use-editor-de-foto";
import { FERRAMENTAS } from "./tipos";

// ---------------------------------------------------------------------------
// A barra de ferramentas: escolher o que fazer, desfazer, voltar ao original
// e alternar tela cheia.
//
// Os quatro botoes de ferramenta eram quatro blocos iguais. Viraram uma lista.
// ---------------------------------------------------------------------------

interface Props {
  editor: EditorDeFoto;
  /** Verdadeiro quando esta foto ja tem edicao salva -- so ai cabe "Original". */
  temEdicao: boolean;
}

export function BarraDeFerramentas({ editor, temEdicao }: Props) {
  const semDesfazer = editor.historico.length === 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {FERRAMENTAS.map((f) => {
        const ativa = editor.ferramenta === f.id;
        return (
          <Button
            key={f.id}
            size="sm"
            variant={ativa ? "default" : "outline"}
            onClick={() => editor.escolherFerramenta(f.id)}
            className={cn("gap-1.5 text-xs", ativa && "gradient-gold text-white border-0")}
          >
            <f.icone className="h-3.5 w-3.5" />
            {f.rotulo}
          </Button>
        );
      })}

      <div className="flex-1" />

      <button
        onClick={editor.desfazer}
        disabled={semDesfazer}
        className={cn(
          "rounded-lg border border-border p-1.5 text-muted-foreground transition-colors",
          semDesfazer ? "opacity-40 cursor-not-allowed" : "hover:text-foreground hover:bg-accent"
        )}
        title="Desfazer"
      >
        <Undo2 className="h-3.5 w-3.5" />
      </button>

      {temEdicao && (
        <Button size="sm" variant="outline" onClick={editor.voltarAoOriginal} className="gap-1.5 border-border text-xs">
          <ImageIcon className="h-3.5 w-3.5" />
          Original
        </Button>
      )}

      <button
        onClick={() => editor.setTelaCheia((v) => !v)}
        className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        title={editor.telaCheia ? "Sair de tela cheia" : "Expandir para pintar"}
      >
        {editor.telaCheia ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
