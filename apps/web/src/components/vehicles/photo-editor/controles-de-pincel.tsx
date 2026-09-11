"use client";

import { cn } from "@/lib/utils";
import { PENCIL_COLORS } from "./tipos";
import type { EditorDeFoto } from "./use-editor-de-foto";

// ---------------------------------------------------------------------------
// Cor e tamanho do pincel. So aparece com lapis ou borracha na mao.
//
// A borracha e um lapis branco: pinta por cima do fundo em vez de recortar.
// Por isso ela usa o tamanho mas nao a cor.
// ---------------------------------------------------------------------------

export function ControlesDePincel({ editor }: { editor: EditorDeFoto }) {
  return (
    <div className="space-y-2">
      {editor.ferramenta === "pencil" && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">Cor:</span>
          <div className="flex gap-1.5">
            {PENCIL_COLORS.map((c) => (
              <button
                key={c.value}
                title={c.label}
                onClick={() => editor.setCorDoLapis(c.value)}
                className={cn(
                  "w-7 h-7 rounded-full border-2 transition-all",
                  editor.corDoLapis === c.value ? "border-brand-gold scale-110" : "border-white/20 hover:border-white/50"
                )}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">Tamanho:</span>
        <input
          type="range"
          min={8}
          max={80}
          value={editor.tamanhoDoPincel}
          onChange={(e) => editor.setTamanhoDoPincel(Number(e.target.value))}
          className="flex-1 h-2 accent-brand-gold"
        />
        <span className="text-[11px] text-muted-foreground w-6 text-right">{editor.tamanhoDoPincel}</span>
      </div>
    </div>
  );
}
