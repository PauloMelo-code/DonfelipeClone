"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { RelatorioDeAcesso } from "../_ganchos/use-manutencao";

// ---------------------------------------------------------------------------
// Relatorio de acesso da instancia de envio.
//
// A falha mais cara desta plataforma e silenciosa: o grupo esta cadastrado
// como destino, mas o numero que publica nao e membro dele. A publicacao sai
// como enviada e ninguem recebe. Esta tela existe pra achar isso antes.
// ---------------------------------------------------------------------------

interface Props {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  relatorio: RelatorioDeAcesso | null;
}

export function DialogoAcesso({ aberto, aoMudar, relatorio }: Props) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="sm:max-w-2xl bg-card border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Verificação de acesso · envio</DialogTitle>
        </DialogHeader>
        {relatorio && (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border border-border p-3 text-xs space-y-1">
              <p>
                Instância de envio: <span className="font-mono text-brand-gold">{relatorio.sendInstanceLabel}</span>
                {!relatorio.usingSeparateInstance && (
                  <span className="text-muted-foreground"> (usando fallback de captura)</span>
                )}
              </p>
              <p>
                Grupos visíveis pra instância de envio:{" "}
                <span className="font-medium">{relatorio.sendInstanceTotalGroups}</span>
              </p>
              <p>
                Grupos destino cadastrados: <span className="font-medium">{relatorio.totalTargetGroups}</span>
              </p>
              {relatorio.problemCount > 0 ? (
                <p className="text-destructive font-semibold flex items-center gap-1.5 pt-1">
                  <ShieldAlert className="h-4 w-4" />
                  {relatorio.problemCount} grupo(s) onde a instância de envio NÃO é membro
                </p>
              ) : (
                <p className="text-success font-semibold flex items-center gap-1.5 pt-1">
                  <ShieldCheck className="h-4 w-4" />
                  Tudo certo: instância de envio é membro de todos os destinos
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              {relatorio.groups.map((g) => (
                <div
                  key={g.id}
                  className={cn(
                    "rounded-lg border p-2.5 flex items-start gap-2",
                    g.problem ? "border-destructive/30 bg-destructive/5" : "border-border bg-card/50"
                  )}
                >
                  {g.problem ? (
                    <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 text-success shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {g.name}
                      {g.region && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-wide text-brand-gold">{g.region}</span>
                      )}
                      {g.isDM && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">DM</span>
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 truncate font-mono">{g.groupId}</p>
                    {g.problem && <p className="text-xs text-destructive mt-1">{g.problem}</p>}
                  </div>
                </div>
              ))}
            </div>

            {relatorio.problemCount > 0 && (
              <div className="rounded-lg border border-brand-gold/30 bg-brand-gold/5 p-3 text-xs space-y-2">
                <p className="font-semibold text-brand-gold">Como resolver:</p>
                <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
                  <li>Pegue o número da instância de envio (geralmente o WhatsApp Y configurado em UAZAPI_SEND).</li>
                  <li>Adicione esse número como participante em cada grupo listado acima dentro do WhatsApp.</li>
                  <li>Após adicionar, clique em &quot;Sincronizar UAZAPI&quot; e depois em &quot;Verificar acesso&quot; novamente.</li>
                </ol>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
