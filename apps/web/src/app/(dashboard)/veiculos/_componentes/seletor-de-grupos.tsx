"use client";

import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WhatsAppGroup } from "./tipos";

// ---------------------------------------------------------------------------
// Escolha dos grupos de destino, agrupada por regiao.
//
// Esta sanfona estava copiada no modal de publicar e no de lote, linha por
// linha. Pior: as duas funcoes de marcar a regiao inteira ("toggleRegion" e
// "toggleRegionById") tinham virado a MESMA funcao depois de um conserto
// aplicado nos dois lugares. Uma copia era divergencia esperando acontecer.
//
// A chave usada em toda selecao e `groupId` (o JID do WhatsApp), nunca o `id`
// do banco -- e por essa chave que o backend acha o grupo na hora de publicar.
// ---------------------------------------------------------------------------

interface Props {
  gruposPorRegiao: Map<string, WhatsAppGroup[]>;
  selecionados: string[];
  regioesAbertas: Set<string>;
  aoAlternarRegiao: (regiao: string) => void;
  aoAlternarGrupo: (groupId: string) => void;
  aoAbrirRegiao: (regiao: string) => void;
}

export function SeletorDeGrupos({
  gruposPorRegiao,
  selecionados,
  regioesAbertas,
  aoAlternarRegiao,
  aoAlternarGrupo,
  aoAbrirRegiao,
}: Props) {
  return (
    <div className="space-y-2">
      {Array.from(gruposPorRegiao.entries()).map(([region, groups]) => {
        const regionIds = groups.map(g => g.groupId);
        const selectedCount = regionIds.filter(id => selecionados.includes(id)).length;
        const allSelected = selectedCount === groups.length;
        const someSelected = selectedCount > 0 && !allSelected;
        const expanded = regioesAbertas.has(region);
        // Dentro da sanfona da regiao, o "(SC)" no nome do grupo vira ruido.
        const trimName = (name: string) =>
          name.replace(new RegExp(`\\s*[\\(\\[]${region}[\\)\\]]\\s*`, "i"), " ").replace(/\s+/g, " ").trim();
        return (
          <div key={region} className="border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => aoAlternarRegiao(region)}
              className="w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 hover:bg-white/[0.02] transition-colors min-h-[48px] sm:min-h-0"
            >
              <div className={cn(
                "h-5 w-5 sm:h-4 sm:w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                allSelected ? "bg-brand-gold border-brand-gold" : someSelected ? "bg-brand-gold/50 border-brand-gold" : "border-muted-foreground/30"
              )}>
                {(allSelected || someSelected) && <Check className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-white" />}
              </div>
              <span className="text-sm font-medium flex-1 text-left">{region}</span>
              <span className="text-xs text-muted-foreground">{selectedCount}/{groups.length}</span>
              <button
                onClick={(e) => { e.stopPropagation(); aoAbrirRegiao(region); }}
                className="p-2 sm:p-1 hover:bg-white/[0.05] rounded -mr-1"
                aria-label={expanded ? "Recolher" : "Expandir"}
              >
                <ChevronDown className={cn("h-4 w-4 sm:h-3.5 sm:w-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")} />
              </button>
            </button>
            {expanded && (
              <div className="px-3 sm:px-4 pb-3 flex flex-col sm:flex-row sm:flex-wrap gap-1 sm:gap-1.5">
                {groups.map(group => {
                  const selected = selecionados.includes(group.groupId);
                  return (
                    <button
                      key={group.id}
                      onClick={() => aoAlternarGrupo(group.groupId)}
                      className={cn(
                        "flex items-center gap-2 sm:gap-1.5 rounded-lg px-3 sm:px-2.5 py-2.5 sm:py-1 text-sm sm:text-xs border transition-all w-full sm:w-auto min-h-[44px] sm:min-h-0",
                        selected ? "bg-brand-gold/10 border-brand-gold/30 text-brand-gold" : "bg-card/50 border-border text-muted-foreground hover:border-white/20"
                      )}
                    >
                      <div className={cn("h-4 w-4 sm:h-3 sm:w-3 rounded border flex items-center justify-center shrink-0", selected ? "bg-brand-gold border-brand-gold" : "border-muted-foreground/30")}>
                        {selected && <Check className="h-2.5 w-2.5 sm:h-2 sm:w-2 text-white" />}
                      </div>
                      <span className="truncate text-left flex-1">{trimName(group.name)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
