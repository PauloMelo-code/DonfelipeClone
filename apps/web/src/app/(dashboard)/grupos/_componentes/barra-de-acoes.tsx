"use client";

import { Loader2, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Manutencao } from "../_ganchos/use-manutencao";

// ---------------------------------------------------------------------------
// As acoes que valem pra lista inteira.
//
// "Limpar orfaos" tem dois estagios de proposito: o clique simples so desativa,
// e so o clique duplo (com confirmacao) apaga de vez.
// ---------------------------------------------------------------------------

export function BarraDeAcoes({ manutencao }: { manutencao: Manutencao }) {
  const m = manutencao;
  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
      <Button variant="outline" onClick={m.abrirAdicionar} className="gap-2 border-border">
        <Plus className="h-4 w-4" />
        Adicionar manual
      </Button>

      <Button
        variant="outline"
        onClick={m.verificarAcesso}
        disabled={m.verificando}
        className="gap-2 border-border"
        title="Verifica se a instância de envio é membro de cada grupo destino"
      >
        {m.verificando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        Verificar acesso
      </Button>

      <Button
        variant="outline"
        onClick={m.repararNomes}
        disabled={m.reparando}
        className="gap-2 border-border"
        title="Tenta resolver nomes de grupos que ficaram só com o JID"
      >
        {m.reparando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Reparar nomes
      </Button>

      <Button
        variant="outline"
        onClick={() => m.limparOrfaos(false)}
        onDoubleClick={() => m.limparOrfaos(true)}
        disabled={m.limpandoOrfaos}
        className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
        title="Desativa grupos onde nenhuma instância UAZAPI participa mais. Click duplo (com confirmação) pra apagar."
      >
        {m.limpandoOrfaos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        Limpar órfãos
      </Button>

      <Button
        onClick={() => m.setModalSync(true)}
        disabled={m.sincronizando}
        className="gap-2 gradient-gold text-white"
      >
        {m.sincronizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Sincronizar UAZAPI
      </Button>
    </div>
  );
}
