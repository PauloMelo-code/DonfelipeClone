"use client";

import { cn } from "@/lib/utils";
import { caixaNaTela } from "./geometria";
import type { Borda, Rect } from "./tipos";

// ---------------------------------------------------------------------------
// A moldura de recorte, no estilo do WhatsApp.
//
// Nao e desenhada no canvas: sao divs por cima. Isso mantem o canvas com a
// imagem limpa enquanto o operador ajusta, e o corte so acontece ao confirmar.
//
// As alcas tem area de toque de 44px -- o desenho branco e pequeno, mas o dedo
// pega num alvo grande. Sem isso nao da pra recortar no celular.
// ---------------------------------------------------------------------------

const CANTOS = [
  { borda: "top-left" as const,     pos: "-top-6 -left-6",     visual: "top-4 left-4 border-t-[3px] border-l-[3px] rounded-tl",       cursor: "cursor-nwse-resize" },
  { borda: "top-right" as const,    pos: "-top-6 -right-6",    visual: "top-4 right-4 border-t-[3px] border-r-[3px] rounded-tr",      cursor: "cursor-nesw-resize" },
  { borda: "bottom-left" as const,  pos: "-bottom-6 -left-6",  visual: "bottom-4 left-4 border-b-[3px] border-l-[3px] rounded-bl",    cursor: "cursor-nesw-resize" },
  { borda: "bottom-right" as const, pos: "-bottom-6 -right-6", visual: "bottom-4 right-4 border-b-[3px] border-r-[3px] rounded-br",   cursor: "cursor-nwse-resize" },
];

const LADOS = [
  { borda: "top" as const,    pos: "-top-6 left-1/2 -translate-x-1/2 w-16 h-10",    cursor: "cursor-ns-resize", barra: "w-10 h-1.5" },
  { borda: "bottom" as const, pos: "-bottom-6 left-1/2 -translate-x-1/2 w-16 h-10", cursor: "cursor-ns-resize", barra: "w-10 h-1.5" },
  { borda: "left" as const,   pos: "top-1/2 -left-6 -translate-y-1/2 h-16 w-10",    cursor: "cursor-ew-resize", barra: "h-10 w-1.5" },
  { borda: "right" as const,  pos: "top-1/2 -right-6 -translate-y-1/2 h-16 w-10",   cursor: "cursor-ew-resize", barra: "h-10 w-1.5" },
];

interface Props {
  caixa: Rect;
  tamanhoDoCanvas: { width: number; height: number };
  tamanhoNaTela: { width: number; height: number };
  aoArrastar: (e: React.PointerEvent, borda: Borda) => void;
}

export function SobreposicaoDeCorte({ caixa, tamanhoDoCanvas, tamanhoNaTela, aoArrastar }: Props) {
  const { x, y, w, h } = caixaNaTela(caixa, tamanhoDoCanvas, tamanhoNaTela);

  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      {/* Escurece tudo que ficara de fora do corte */}
      <div className="absolute bg-black/60" style={{ top: 0, left: 0, right: 0, height: y }} />
      <div className="absolute bg-black/60" style={{ top: y + h, left: 0, right: 0, bottom: 0 }} />
      <div className="absolute bg-black/60" style={{ top: y, left: 0, width: x, height: h }} />
      <div className="absolute bg-black/60" style={{ top: y, left: x + w, right: 0, height: h }} />

      <div
        className="absolute border-2 border-white cursor-move"
        style={{ top: y, left: x, width: w, height: h, pointerEvents: "auto", touchAction: "none" }}
        onPointerDown={(e) => {
          // Arrastar o meio move a caixa; nas alcas quem manda e a alca.
          if ((e.target as HTMLElement).dataset.handle) return;
          aoArrastar(e, "move");
        }}
      >
        {CANTOS.map((c) => (
          <div
            key={c.borda}
            data-handle="1"
            className={cn("absolute w-11 h-11", c.pos, c.cursor)}
            style={{ touchAction: "none" }}
            onPointerDown={(e) => aoArrastar(e, c.borda)}
          >
            <span aria-hidden className={cn("absolute w-5 h-5 border-white", c.visual)} />
          </div>
        ))}

        {LADOS.map((l) => (
          <div
            key={l.borda}
            data-handle="1"
            className={cn("absolute flex items-center justify-center", l.pos, l.cursor)}
            style={{ touchAction: "none" }}
            onPointerDown={(e) => aoArrastar(e, l.borda)}
          >
            <span aria-hidden className={cn("bg-white/90 rounded", l.barra)} />
          </div>
        ))}
      </div>
    </div>
  );
}
