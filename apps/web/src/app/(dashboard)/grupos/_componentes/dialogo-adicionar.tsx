"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Manutencao } from "../_ganchos/use-manutencao";

// ---------------------------------------------------------------------------
// Cadastro manual de um destino que o sync nao trouxe.
//
// Serve pro caso comum de mandar pro proprio numero pra testar, e pra colar um
// JID que a UAZAPI devolveu mas nao entrou na lista.
// ---------------------------------------------------------------------------

const FORMAS = [
  { id: "individual" as const, label: "Número direto", hint: "DM (s.whatsapp.net)" },
  { id: "broadcast" as const, label: "Lista transmissão", hint: "@broadcast" },
];

const PAPEIS = [
  { id: "SOURCE" as const, label: "Fonte (captura)" },
  { id: "TARGET" as const, label: "Destino (publica)" },
];

const ESCOLHA = "flex-1 rounded-lg py-2 font-medium border transition-all";
const ESCOLHA_ATIVA = "bg-brand-gold/10 text-brand-gold border-brand-gold/30";
const ESCOLHA_INATIVA = "bg-card text-muted-foreground border-border hover:border-white/20";

export function DialogoAdicionar({ manutencao }: { manutencao: Manutencao }) {
  const { formulario, setFormulario, adicionando, adicionar, modalAdicionar, fecharAdicionar } = manutencao;

  return (
    <Dialog open={modalAdicionar} onOpenChange={fecharAdicionar}>
      <DialogContent className="sm:max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle>Adicionar número manualmente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Número (somente dígitos)</label>
            <Input
              placeholder="5511999999999"
              value={formulario.phone}
              onChange={(e) => setFormulario((f) => ({ ...f, phone: e.target.value }))}
              className="bg-background border-border"
            />
            <p className="text-[11px] text-muted-foreground/60 mt-1">
              Ex: 5511999999999 → enviado direto pra esse número (DM).
              Cole um JID completo (@g.us, @broadcast, @newsletter) pra usar como-está.
            </p>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Nome do grupo/lista</label>
            <Input
              placeholder="Teste — meu número"
              value={formulario.name}
              onChange={(e) => setFormulario((f) => ({ ...f, name: e.target.value }))}
              className="bg-background border-border"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Forma de envio</label>
            <div className="flex gap-2">
              {FORMAS.map((k) => (
                <button
                  key={k.id}
                  onClick={() => setFormulario((f) => ({ ...f, kind: k.id }))}
                  className={cn(ESCOLHA, "text-xs", formulario.kind === k.id ? ESCOLHA_ATIVA : ESCOLHA_INATIVA)}
                >
                  <div>{k.label}</div>
                  <div className="text-[10px] opacity-60 mt-0.5">{k.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Tipo</label>
            <div className="flex gap-2">
              {PAPEIS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setFormulario((f) => ({ ...f, role: r.id }))}
                  className={cn(ESCOLHA, "text-sm", formulario.role === r.id ? ESCOLHA_ATIVA : ESCOLHA_INATIVA)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={adicionar} disabled={adicionando} className="w-full gradient-gold text-black border-0">
            {adicionando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
