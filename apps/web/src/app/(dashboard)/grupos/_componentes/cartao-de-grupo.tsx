"use client";

import { Check, ChevronDown, Loader2, Pencil, Send, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { AcoesDeGrupo } from "../_ganchos/use-acoes-de-grupo";
import { REGIONS, iconeDoTipo, tipoDoGrupo, type Group } from "./tipos";

// ---------------------------------------------------------------------------
// O card de um grupo, com tudo que se faz nele sem sair da lista.
//
// O nome vira campo de texto ao clicar no lapis, e o icone do tipo abre o
// menu de reclassificacao. As regioes embaixo sao exclusivas na pratica:
// clicar na que ja esta marcada desmarca.
// ---------------------------------------------------------------------------

/** Cadastro feito errado no passado: telefone montado como lista de transmissao. */
const JID_DE_TELEFONE_COMO_LISTA = /^\d{8,15}@broadcast$/;

export function CartaoDeGrupo({ group, acoes }: { group: Group; acoes: AcoesDeGrupo }) {
  const renomeando = acoes.renomeandoId === group.id;
  const tipo = tipoDoGrupo(group);
  const menuAberto = acoes.menuDeTipo?.id === group.id;

  return (
    <div
      className={cn("glass rounded-xl p-3 sm:p-4 transition-all w-full", !group.active && "opacity-50")}
      style={{ maxWidth: "100%", overflow: "hidden" }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: "6px", alignItems: "center" }}>
        <div style={{ overflow: "hidden", minWidth: 0 }}>
          {renomeando ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={acoes.nomeEditado}
                onChange={(e) => acoes.setNomeEditado(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") acoes.salvarNome(group);
                  if (e.key === "Escape") acoes.cancelarRenome();
                }}
                disabled={acoes.salvandoNome}
                className="flex-1 min-w-0 bg-background border border-brand-gold/40 rounded px-1.5 py-0.5 text-[13px] outline-none focus:border-brand-gold"
              />
              <button
                onClick={() => acoes.salvarNome(group)}
                disabled={acoes.salvandoNome}
                className="p-1 rounded text-success hover:bg-success/10 shrink-0"
                title="Salvar"
              >
                {acoes.salvandoNome ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={acoes.cancelarRenome}
                className="p-1 rounded text-muted-foreground hover:bg-white/[0.05] shrink-0"
                title="Cancelar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <p
              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "13px", fontWeight: 500 }}
              className="flex items-center gap-1.5 group/name"
            >
              <button
                type="button"
                onClick={(e) => acoes.abrirMenuDeTipo(e, group)}
                className={cn(
                  "relative inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[12px] transition-all cursor-pointer shrink-0",
                  "border-white/[0.08] bg-white/[0.03] hover:bg-brand-gold/10 hover:border-brand-gold/40",
                  (group.kindOverride || menuAberto) && "border-brand-gold/40 bg-brand-gold/10"
                )}
                title={`Tipo: ${tipo}${group.kindOverride ? " (manual)" : ""} — clique para mudar`}
              >
                <span>{iconeDoTipo(tipo)}</span>
                <ChevronDown className="h-2.5 w-2.5 text-muted-foreground/60" />
                {group.kindOverride && (
                  <span
                    className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-brand-gold shadow-[0_0_4px_rgba(201,151,61,0.6)]"
                    title="Tipo definido manualmente"
                  />
                )}
              </button>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{group.name}</span>
              {group.nameLocked && (
                <span title="Nome fixado manualmente" className="text-[9px] text-brand-gold shrink-0">📌</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); acoes.comecarRenome(group); }}
                className="p-0.5 rounded text-muted-foreground/40 hover:text-brand-gold shrink-0 opacity-0 group-hover/name:opacity-100 transition-opacity"
                title="Renomear grupo"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </p>
          )}
          <p style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "10px", opacity: 0.5 }}>
            {group.groupId}
          </p>
          {JID_DE_TELEFONE_COMO_LISTA.test(group.groupId) && (
            <button
              onClick={(e) => { e.stopPropagation(); acoes.converterParaDM(group); }}
              className="text-[10px] text-brand-gold hover:underline mt-0.5"
              title="Converter para DM (@s.whatsapp.net)"
            >
              Corrigir → DM
            </button>
          )}
        </div>

        <Badge
          variant="outline"
          className="cursor-pointer border-border hover:border-brand-gold/30 text-[10px] shrink-0"
          onClick={() => acoes.alternar(group, "role")}
        >
          {group.role === "SOURCE" ? "Fonte" : "Destino"}
        </Badge>

        <Switch checked={group.active} onCheckedChange={() => acoes.alternar(group, "active")} />

        {group.role === "TARGET" && (
          <button
            onClick={() => acoes.testarEnvio(group)}
            disabled={acoes.testandoId === group.id}
            className="p-1 rounded text-muted-foreground/40 hover:text-brand-gold hover:bg-brand-gold/10 transition-colors disabled:opacity-40"
            title="Testar envio (manda mensagem curta pra esse destino)"
          >
            {acoes.testandoId === group.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        )}

        <button
          onClick={() => acoes.remover(group)}
          className="p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Remover grupo"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1 mt-2">
        {REGIONS.map((r) => (
          <button
            key={r}
            onClick={() => acoes.marcarRegiao(group, r)}
            className={cn(
              "rounded-md px-2 py-0.5 text-[11px] font-medium transition-all border",
              group.region === r
                ? "bg-brand-gold/10 text-brand-gold border-brand-gold/30"
                : "bg-card/50 text-muted-foreground border-border hover:text-foreground hover:border-white/20"
            )}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}
