"use client";

import { createPortal } from "react-dom";
import { Check, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AcoesDeGrupo } from "../_ganchos/use-acoes-de-grupo";
import { TIPOS_RECLASSIFICAVEIS, tipoDoGrupo } from "./tipos";

// ---------------------------------------------------------------------------
// Menu de reclassificacao manual do tipo do destino.
//
// Sai por um portal no body de proposito: dentro do card ele seria cortado
// pelo overflow escondido e ficaria embaixo dos cards vizinhos.
// ---------------------------------------------------------------------------

export function MenuDeTipo({ acoes }: { acoes: AcoesDeGrupo }) {
  const menu = acoes.menuDeTipo;
  if (!menu || typeof document === "undefined") return null;

  const atual = tipoDoGrupo(menu.group);

  return createPortal(
    <div
      data-kind-menu
      style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 100 }}
      className="min-w-[200px] rounded-lg border border-white/[0.08] bg-[#131316] shadow-[0_10px_40px_rgba(0,0,0,0.7)] py-1"
    >
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground/50 font-semibold border-b border-white/[0.04] mb-1">
        Reclassificar como
      </div>
      {TIPOS_RECLASSIFICAVEIS.map((opt) => {
        const ehAtual = atual === opt.id;
        const Icone = opt.icone;
        return (
          <button
            key={opt.id}
            onClick={() => acoes.reclassificar(menu.group, opt.id)}
            className={cn(
              "w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors",
              ehAtual ? "bg-brand-gold/10 text-brand-gold" : "text-foreground hover:bg-white/[0.04]"
            )}
          >
            <span className="inline-flex items-center gap-2">
              <Icone className="h-3.5 w-3.5 shrink-0" />
              {opt.label}
            </span>
            {ehAtual && <Check className="h-3 w-3" />}
          </button>
        );
      })}
      {menu.group.kindOverride && (
        <>
          <div className="border-t border-white/[0.04] my-1" />
          <button
            onClick={() => acoes.reclassificar(menu.group, null)}
            className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-white/[0.04] hover:text-foreground transition-colors"
          >
            <span className="inline-flex items-center gap-2">
              <Undo2 className="h-3.5 w-3.5" />
              Voltar automático
            </span>
          </button>
        </>
      )}
    </div>,
    document.body
  );
}
