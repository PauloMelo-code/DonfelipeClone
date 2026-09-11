"use client";

import { ImageIcon, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BarraDeFerramentas } from "./barra-de-ferramentas";
import { ControlesDePincel } from "./controles-de-pincel";
import { cursorDePincel } from "./pintura";
import { SobreposicaoDeCorte } from "./sobreposicao-de-corte";
import { DICAS, type PhotoEditorProps } from "./tipos";
import { useEditorDeFoto } from "./use-editor-de-foto";

// ---------------------------------------------------------------------------
// Editor de foto do anuncio.
//
// A foto que chega do grupo de repasse quase sempre traz telefone, marca
// d'agua ou o nome da loja de origem. Aqui isso e borrado, apagado ou cortado
// antes de republicar.
//
// Um retorno so: a tela cheia troca classes de CSS no envolucro em vez de
// renderizar outra arvore. Se o canvas remontasse, o desenho iria junto.
// ---------------------------------------------------------------------------

/** Tamanho da area de blur abaixo do qual nao vale a pena oferecer o botao. */
const SELECAO_MINIMA = 10;

export function PhotoEditor(props: PhotoEditorProps) {
  const editor = useEditorDeFoto(props);
  const { photos, editedPhotos } = props;

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <ImageIcon className="h-10 w-10 opacity-30 mb-2" />
        <p className="text-sm">Nenhuma foto disponível</p>
      </div>
    );
  }

  const canvas = editor.canvasRef.current;
  const podeRecortar = editor.ferramenta === "crop" && editor.caixaDeCorte && canvas && editor.carregada;
  const podeBorrar =
    editor.ferramenta === "blur" &&
    editor.selecao &&
    editor.selecao.w > SELECAO_MINIMA &&
    editor.selecao.h > SELECAO_MINIMA;

  return (
    <div className={cn(editor.telaCheia && "fixed inset-0 z-[9999] bg-[#0D0D0F] flex flex-col")}>
      {editor.telaCheia && (
        <div className="flex items-center justify-between px-4 pt-safe pt-4 pb-2 border-b border-white/[0.06] flex-shrink-0">
          <span className="text-sm font-medium text-foreground">Editor de foto</span>
          <button
            onClick={() => editor.setTelaCheia(false)}
            className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className={cn("space-y-3 p-4", editor.telaCheia && "overflow-y-auto flex-1")}>
        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((foto, i) => (
              <button
                key={i}
                onClick={() => editor.setIndice(i)}
                className={cn(
                  "flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all",
                  editor.indice === i
                    ? "border-brand-gold ring-1 ring-brand-gold/30"
                    : editedPhotos[i]
                      ? "border-blue-500/50"
                      : "border-white/10 hover:border-white/30"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={editedPhotos[i] || foto} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <BarraDeFerramentas editor={editor} temEdicao={!!editedPhotos[editor.indice]} />

        {(editor.ferramenta === "erase" || editor.ferramenta === "pencil") && (
          <ControlesDePincel editor={editor} />
        )}

        <div className={cn(
          "relative bg-black/40 rounded-lg overflow-hidden flex items-center justify-center",
          editor.telaCheia ? "min-h-[50vh]" : "min-h-[220px]"
        )}>
          {editor.erro ? (
            <p className="text-sm text-muted-foreground">Erro ao carregar imagem (CORS)</p>
          ) : !editor.carregada ? (
            <div className="animate-pulse text-sm text-muted-foreground">Carregando...</div>
          ) : null}

          <div className="relative inline-block">
            <canvas
              ref={editor.canvasRef}
              className={cn(
                "max-w-full block",
                editor.telaCheia ? "max-h-[60vh]" : "max-h-[300px]",
                (!editor.carregada || editor.erro) && "hidden"
              )}
              style={{
                cursor: editor.ferramenta === "crop"
                  ? "default"
                  : editor.ferramenta === "erase"
                    ? cursorDePincel(editor.tamanhoDoPincel)
                    : "crosshair",
                touchAction: "none",
              }}
              onMouseDown={(e) => editor.comecarTraco(editor.posicao(e.clientX, e.clientY))}
              onMouseMove={(e) => editor.moverTraco(editor.posicao(e.clientX, e.clientY))}
              onMouseUp={editor.terminarTraco}
              onMouseLeave={editor.terminarTraco}
            />

            {podeRecortar && (
              <SobreposicaoDeCorte
                caixa={editor.caixaDeCorte!}
                tamanhoDoCanvas={canvas!}
                tamanhoNaTela={canvas!.getBoundingClientRect()}
                aoArrastar={editor.arrastarCorte}
              />
            )}
          </div>
        </div>

        {podeRecortar ? (
          <Button size="sm" onClick={editor.aplicarRecorte} className="w-full gradient-gold text-white border-0">
            Aplicar recorte
          </Button>
        ) : podeBorrar ? (
          <Button size="sm" onClick={editor.aplicarBlur} className="w-full gradient-gold text-white border-0">
            Aplicar blur
          </Button>
        ) : (
          <p className="text-[11px] text-center text-muted-foreground">{DICAS[editor.ferramenta]}</p>
        )}
      </div>
    </div>
  );
}
