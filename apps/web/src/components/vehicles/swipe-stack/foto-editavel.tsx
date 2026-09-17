"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Droplets, ImageIcon, Paintbrush, Undo2, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { SobreposicaoDeCorte } from "../photo-editor/sobreposicao-de-corte";
import { PENCIL_COLORS, type Tool } from "../photo-editor/tipos";
import { useEditorDeFoto } from "../photo-editor/use-editor-de-foto";

// ---------------------------------------------------------------------------
// A foto principal do card, editavel ali mesmo.
//
// O cliente pediu edicao sem abrir outra tela: as bordas ja vem prontas pra
// puxar (soltar recorta), e Pincel e Blur ficam no canto. Cada edicao vai
// direto para a foto do carro, que e a que Aprovar e Publicar usam.
//
// A original fica guardada enquanto o card existe, pra "Original" desfazer
// tudo. Se outra miniatura virar a principal, o editor recomeca com ela.
//
// `data-sem-arrasto`: arrastar aqui edita a foto, nao decide o carro.
// Os botoes ficam numa faixa acima da foto e a dica vai embaixo: por cima da
// imagem eles cobririam os cantos do recorte.
// ---------------------------------------------------------------------------

const DICAS: Partial<Record<Tool, string>> = {
  crop: "Puxe as bordas para recortar",
  blur: "Arraste sobre o que quer borrar",
  pencil: "Pinte sobre o que quer cobrir",
};

const CAIXA = "relative h-48 sm:h-60 w-full shrink-0";
/** Mais alta que a foto estatica: a faixa dos botoes fica em cima dela. */
const CAIXA_EDITAVEL = "relative h-64 sm:h-72 w-full shrink-0";
const FUNDO_DO_BOTAO = "bg-black/60 text-white/85 hover:bg-black/80 hover:text-white";

function BotaoDaFoto({ ativo, titulo, aoClicar, children }: {
  ativo?: boolean;
  titulo: string;
  aoClicar: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-pressed={ativo}
      onClick={aoClicar}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
        ativo ? "bg-brand-gold text-black" : FUNDO_DO_BOTAO
      )}
    >
      {children}
    </button>
  );
}

interface Props {
  /** A foto principal como esta agora -- a original ou a ultima edicao. */
  foto: string;
  alt: string;
  aoEditar: (foto: string) => void;
  aoAmpliar?: () => void;
}

export function FotoEditavel({ foto, alt, aoEditar, aoAmpliar }: Props) {
  const [origem, setOrigem] = useState<{ original: string; editada: string | null }>({ original: foto, editada: null });

  // A foto mudou por fora (outra miniatura virou a principal): recomeca.
  // Ajuste durante a renderizacao, como o React recomenda pra estado derivado.
  if (foto !== origem.original && foto !== origem.editada) {
    setOrigem({ original: foto, editada: null });
  }

  const fotos = useMemo(() => [origem.original], [origem.original]);
  const editadas = useMemo(
    () => (origem.editada ? { 0: origem.editada } : {}) as Record<number, string>,
    [origem.editada]
  );

  const aoEditarFoto = useCallback((_: number, dataUrl: string) => {
    setOrigem((o) => ({ ...o, editada: dataUrl }));
    aoEditar(dataUrl);
  }, [aoEditar]);

  const aoVoltarAoOriginal = useCallback(() => {
    setOrigem((o) => ({ ...o, editada: null }));
    aoEditar(origem.original);
  }, [aoEditar, origem.original]);

  const { canvasRef, ...editor } = useEditorDeFoto({
    photos: fotos,
    editedPhotos: editadas,
    onPhotoEdited: aoEditarFoto,
    onPhotoReset: aoVoltarAoOriginal,
    modoRapido: true,
  });

  const botaoAmpliar = aoAmpliar && (
    <BotaoDaFoto titulo="Ampliar a foto" aoClicar={aoAmpliar}>
      <ZoomIn className="h-3.5 w-3.5" />
    </BotaoDaFoto>
  );

  // Foto de outro dominio sem permissao de leitura nao entra no canvas: mostra
  // como imagem comum, sem edicao.
  if (editor.erro) {
    return (
      <div className={cn(CAIXA, "bg-card")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={foto} alt={alt} className="h-full w-full object-cover" draggable={false} />
        <div className="absolute top-3 right-3 z-30">{botaoAmpliar}</div>
      </div>
    );
  }

  const canvas = canvasRef.current;
  const mostrarCorte = editor.ferramenta === "crop" && editor.caixaDeCorte && canvas && editor.carregada;
  const alternar = (ferramenta: Tool) =>
    editor.escolherFerramenta(editor.ferramenta === ferramenta ? "crop" : ferramenta);

  return (
    <>
      <div data-sem-arrasto className={cn(CAIXA_EDITAVEL, "flex cursor-default flex-col bg-black/40")}>
        {/* Faixa propria pros botoes: por cima da foto eles cobririam o canto do recorte. */}
        <div className="flex items-center justify-between gap-1.5 px-3 pt-2.5">
          <div className="flex gap-1.5">
            {editor.historico.length > 0 && (
              <BotaoDaFoto titulo="Desfazer a última edição" aoClicar={editor.desfazer}>
                <Undo2 className="h-3.5 w-3.5" />
              </BotaoDaFoto>
            )}
            {origem.editada && (
              <BotaoDaFoto titulo="Voltar para a foto original" aoClicar={editor.voltarAoOriginal}>
                <ImageIcon className="h-3.5 w-3.5" />
              </BotaoDaFoto>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {editor.ferramenta === "pencil" && PENCIL_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={`Pincel ${c.label.toLowerCase()}`}
                aria-pressed={editor.corDoLapis === c.value}
                onClick={() => editor.setCorDoLapis(c.value)}
                className={cn(
                  "h-5 w-5 rounded-full border-2",
                  editor.corDoLapis === c.value ? "border-brand-gold" : "border-white/30"
                )}
                style={{ backgroundColor: c.value }}
              />
            ))}
            <BotaoDaFoto titulo="Pincel" ativo={editor.ferramenta === "pencil"} aoClicar={() => alternar("pencil")}>
              <Paintbrush className="h-3.5 w-3.5" /> Pincel
            </BotaoDaFoto>
            <BotaoDaFoto titulo="Blur" ativo={editor.ferramenta === "blur"} aoClicar={() => alternar("blur")}>
              <Droplets className="h-3.5 w-3.5" /> Blur
            </BotaoDaFoto>
            {botaoAmpliar}
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          {!editor.carregada && (
            <div className="absolute animate-pulse text-xs text-muted-foreground">Carregando foto...</div>
          )}

          {/* Folga em volta do canvas: as alcas do recorte ficam fora da foto. */}
          <div className="relative inline-block">
            <canvas
              ref={canvasRef}
              aria-label={alt}
              className={cn(
                "block max-h-40 sm:max-h-52 max-w-[calc(100vw-5rem)] sm:max-w-[20rem]",
                !editor.carregada && "invisible"
              )}
              style={{ cursor: editor.ferramenta === "crop" ? "default" : "crosshair", touchAction: "none" }}
              onMouseDown={(e) => editor.comecarTraco(editor.posicao(e.clientX, e.clientY))}
              onMouseMove={(e) => editor.moverTraco(editor.posicao(e.clientX, e.clientY))}
              onMouseUp={editor.terminarTraco}
              onMouseLeave={editor.terminarTraco}
            />
            {mostrarCorte && (
              <SobreposicaoDeCorte
                caixa={editor.caixaDeCorte!}
                tamanhoDoCanvas={canvas!}
                tamanhoNaTela={canvas!.getBoundingClientRect()}
                aoArrastar={editor.arrastarCorte}
              />
            )}
          </div>
        </div>
      </div>
      <p className="px-4 pt-2 text-[11px] text-muted-foreground">
        {editor.carregada ? DICAS[editor.ferramenta] : "\u00a0"}
      </p>
    </>
  );
}
