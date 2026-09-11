"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

/**
 * Pede o codigo do fator atual antes de uma acao sensivel.
 *
 * Existe porque TODA mudanca de credencial nesta tela exige provar quem e:
 * cadastrar passkey, remover passkey, gerar codigos de resgate novos. Sem essa
 * prova, um cookie roubado bastaria para pendurar o autenticador do atacante
 * na conta -- e uma credencial dessas sobrevive ate a troca de senha.
 *
 * O componente nao decide nada: quem chama e que sabe o que fazer com o
 * codigo. Aqui so mora a caixinha, para as tres telas pedirem igual.
 */
export function PedirCodigo({
  rotulo,
  ocupado,
  erro,
  onConfirmar,
  onCancelar,
}: {
  rotulo: string;
  ocupado?: boolean;
  erro?: string;
  onConfirmar: (codigo: string) => void;
  onCancelar: () => void;
}) {
  const [codigo, setCodigo] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onConfirmar(codigo);
      }}
      className="space-y-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"
    >
      <p className="text-[13px] text-muted-foreground/70">{rotulo}</p>
      <Input
        autoFocus
        type="text"
        inputMode="numeric"
        placeholder="000000"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        autoComplete="one-time-code"
        maxLength={12}
        className="h-11 text-center tracking-[0.35em]"
      />
      {erro && <p className="text-[13px] text-destructive">{erro}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={ocupado || codigo.length < 6} className="h-10 flex-1">
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancelar}
          disabled={ocupado}
          className="h-10"
        >
          Cancelar
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground/40">
        Serve o código do aplicativo ou um código de resgate.
      </p>
    </form>
  );
}
