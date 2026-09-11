"use client";

import { useEffect, useState } from "react";
import { SectionCard } from "@/components/ui/section-card";
import { Button } from "@/components/ui/button";
import { Check, Copy, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { PedirCodigo } from "./pedir-codigo";

// ---------------------------------------------------------------------------
// O aplicativo autenticador e os codigos de resgate.
//
// Nao ha botao de desligar o segundo fator, e nao e esquecimento: e a porta
// que o atacante usa depois de tomar a sessao. Trocar de aparelho GIRA a
// semente e mantem o piso.
//
// A tela mostra QUANTOS codigos de resgate restam, nunca os codigos. Eles
// aparecem uma vez, quando sao gerados; uma tela que os reexibe a cada
// carregamento transforma uma sessao aberta na mesa em conta perdida.
// ---------------------------------------------------------------------------

interface Estado {
  ativo: boolean;
  desde: string | null;
  codigosRestantes: number;
}

export function CartaoDoFator() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [pedindo, setPedindo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [novos, setNovos] = useState<string[] | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    fetch("/api/me/2fa")
      .then((r) => (r.ok ? r.json() : null))
      .then(setEstado)
      .catch(() => setEstado(null));
  }, []);

  const gerar = async (codigo: string) => {
    setErro("");
    setOcupado(true);
    try {
      const r = await fetch("/api/me/2fa/codigos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
      const corpo = await r.json();
      if (!r.ok) throw new Error(corpo?.error ?? "Código inválido.");
      setNovos(corpo.codigos);
      setPedindo(false);
      setEstado((e) => (e ? { ...e, codigosRestantes: corpo.codigos.length } : e));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const copiar = async () => {
    if (!novos) return;
    await navigator.clipboard.writeText(novos.join("\n"));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const poucos = (estado?.codigosRestantes ?? 0) <= 3;

  return (
    <SectionCard
      icon={<ShieldCheck className="h-4 w-4" />}
      title="Aplicativo autenticador"
      description="O piso obrigatório da conta. Não existe desligar; trocar de aparelho gira a semente."
    >
      <div className="space-y-4">
        {!estado && (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </p>
        )}

        {estado?.ativo && (
          <p className="text-[13px] text-muted-foreground/70">
            Ativo desde{" "}
            {estado.desde ? new Date(estado.desde).toLocaleDateString("pt-BR") : "—"}.
          </p>
        )}

        {novos ? (
          <div className="space-y-3">
            <p className="text-[13px] text-muted-foreground/70">
              Guarde agora. Valem uma vez cada, e esta lista não volta.
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              {novos.map((c) => (
                <code key={c} className="font-mono text-[13px] text-foreground/85">
                  {c}
                </code>
              ))}
            </div>
            <Button type="button" variant="outline" onClick={copiar} className="h-10 w-full">
              {copiado ? (
                <span className="flex items-center gap-2">
                  <Check className="h-4 w-4" /> Copiado
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Copy className="h-4 w-4" /> Copiar os códigos
                </span>
              )}
            </Button>
          </div>
        ) : (
          <>
            {estado && (
              <p className={`text-[13px] ${poucos ? "text-amber-400" : "text-muted-foreground/60"}`}>
                {estado.codigosRestantes} códigos de resgate restantes.
                {poucos ? " Gere um conjunto novo antes que acabem." : ""}
              </p>
            )}

            {pedindo ? (
              <PedirCodigo
                rotulo="Gerar códigos novos invalida os atuais. Confirme com o código do fator."
                ocupado={ocupado}
                erro={erro}
                onConfirmar={gerar}
                onCancelar={() => setPedindo(false)}
              />
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setErro("");
                  setPedindo(true);
                }}
                className="h-11"
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Gerar códigos de resgate novos
              </Button>
            )}
          </>
        )}
      </div>
    </SectionCard>
  );
}
