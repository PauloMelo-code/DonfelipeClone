"use client";

import { Clock, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { estadoDoVeiculo, type Vehicle } from "./tipos";

// ---------------------------------------------------------------------------
// Banner da aba Prontos: os carros ja preparados, agrupados por estado.
//
// Preparar e publicar sao dois momentos: o operador monta os anuncios com
// calma e depois solta um estado inteiro de uma vez, no horario que der mais
// movimento no grupo.
// ---------------------------------------------------------------------------

interface Props {
  veiculos: Vehicle[];
  publicando: boolean;
  aoPublicar: (estado?: string) => void;
}

export function BannerProntos({ veiculos, publicando, aoPublicar }: Props) {
  const porEstado = new Map<string, number>();
  for (const v of veiculos) {
    const s = (estadoDoVeiculo(v) || "?").toUpperCase();
    porEstado.set(s, (porEstado.get(s) ?? 0) + 1);
  }
  const estados = Array.from(porEstado.entries()).sort((a, b) => b[1] - a[1]);
  const plural = veiculos.length !== 1 ? "s" : "";

  return (
    <div className="glass rounded-2xl p-4 border border-info/20">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-info" />
            <h3 className="text-sm font-semibold">Prontos pra postar</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {veiculos.length} veículo{plural} preparado{plural} - publique todos de uma vez por estado
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => aoPublicar()}
          className="gap-1.5 gradient-gold text-white border-0 shrink-0"
          disabled={publicando}
        >
          {publicando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Publicar todos ({veiculos.length})
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {estados.map(([estado, quantidade]) => (
          <button
            key={estado}
            onClick={() => aoPublicar(estado)}
            disabled={publicando}
            className="rounded-lg px-3 py-1.5 text-xs font-medium border border-info/30 bg-info/5 text-info hover:bg-info/15 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <Send className="h-3 w-3" />
            {estado} ({quantidade})
          </button>
        ))}
      </div>
    </div>
  );
}
