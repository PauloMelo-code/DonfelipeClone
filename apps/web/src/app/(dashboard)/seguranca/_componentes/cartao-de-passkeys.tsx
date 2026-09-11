"use client";

import { useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { useSuporteAPasskey } from "@/lib/suporte-a-passkey";
import { SectionCard } from "@/components/ui/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Fingerprint, Loader2, Trash2, Cloud, Usb } from "lucide-react";
import { PedirCodigo } from "./pedir-codigo";

// ---------------------------------------------------------------------------
// As passkeys da conta.
//
// A passkey e o fator resistente a PHISHING: a assinatura e feita sobre o
// dominio de quem pediu, entao a que sai numa tela falsa nao serve no site
// verdadeiro. O codigo de seis digitos nao tem essa propriedade -- quem digita
// a senha numa copia do site digita o codigo nela tambem.
//
// Cadastrar e remover exigem o codigo do fator atual. Remover uma passkey nao
// deixa a conta sem fator: o aplicativo autenticador e o piso e continua ali.
// ---------------------------------------------------------------------------

interface Passkey {
  id: string;
  apelido: string;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

type Etapa = { tipo: "parado" } | { tipo: "codigo" } | { tipo: "removendo"; id: string };

export function CartaoDePasskeys() {
  const [lista, setLista] = useState<Passkey[] | null>(null);
  const [apelido, setApelido] = useState("");
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "parado" });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const suportado = useSuporteAPasskey();

  const recarregar = () =>
    fetch("/api/me/passkey")
      .then((r) => (r.ok ? r.json() : { passkeys: [] }))
      .then((d) => setLista(d.passkeys ?? []))
      .catch(() => setLista([]));

  useEffect(() => {
    void recarregar();
  }, []);

  /**
   * O cadastro em tres tempos: o servidor autoriza com o codigo, o
   * autenticador assina, o servidor confere e grava.
   */
  const cadastrar = async (codigo: string) => {
    setErro("");
    setOcupado(true);
    try {
      const desafio = await fetch("/api/me/passkey/desafio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
      const opcoes = await desafio.json();
      if (!desafio.ok) throw new Error(opcoes?.error ?? "Código inválido.");

      const resposta = await startRegistration({ optionsJSON: opcoes });

      const gravou = await fetch("/api/me/passkey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resposta, apelido: apelido || "Este aparelho" }),
      });
      const corpo = await gravou.json();
      if (!gravou.ok) throw new Error(corpo?.error ?? "Não foi possível cadastrar.");

      setApelido("");
      setEtapa({ tipo: "parado" });
      await recarregar();
    } catch (e) {
      const cancelou = e instanceof Error && /NotAllowed|abort/i.test(e.name + e.message);
      setErro(cancelou ? "Cadastro cancelado no aparelho." : (e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const remover = async (id: string, codigo: string) => {
    setErro("");
    setOcupado(true);
    try {
      const r = await fetch(`/api/me/passkey/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
      const corpo = await r.json();
      if (!r.ok) throw new Error(corpo?.error ?? "Não foi possível remover.");
      setEtapa({ tipo: "parado" });
      await recarregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <SectionCard
      icon={<Fingerprint className="h-4 w-4" />}
      title="Passkeys"
      description="Entram sem senha e não caem em tela falsa: a assinatura só vale no domínio certo."
    >
      <div className="space-y-4">
        {lista === null && (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </p>
        )}

        {lista?.length === 0 && (
          <p className="text-[13px] text-muted-foreground/60">
            Nenhuma cadastrada. Sem ela, a conta depende do código de seis
            dígitos, que uma tela falsa consegue repassar em tempo real.
          </p>
        )}

        {lista?.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-[14px] text-foreground">
                {p.deviceType === "multiDevice" ? (
                  <Cloud className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                ) : (
                  <Usb className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                )}
                {p.apelido}
              </p>
              <p className="text-[11px] text-muted-foreground/45">
                {p.lastUsedAt
                  ? `Usada em ${new Date(p.lastUsedAt).toLocaleDateString("pt-BR")}`
                  : "Ainda não usada"}
                {p.backedUp ? " · sincronizada" : ""}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setErro("");
                setEtapa({ tipo: "removendo", id: p.id });
              }}
              className="shrink-0 text-muted-foreground/60 hover:text-destructive"
              aria-label={`Remover ${p.apelido}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {etapa.tipo === "removendo" && (
          <PedirCodigo
            rotulo="Para remover esta passkey, confirme com o código do fator atual."
            ocupado={ocupado}
            erro={erro}
            onConfirmar={(codigo) => remover(etapa.id, codigo)}
            onCancelar={() => setEtapa({ tipo: "parado" })}
          />
        )}

        {etapa.tipo === "codigo" && (
          <PedirCodigo
            rotulo="Para cadastrar uma passkey, confirme com o código do fator atual."
            ocupado={ocupado}
            erro={erro}
            onConfirmar={cadastrar}
            onCancelar={() => setEtapa({ tipo: "parado" })}
          />
        )}

        {etapa.tipo === "parado" && suportado && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={apelido}
              onChange={(e) => setApelido(e.target.value)}
              placeholder="Nome do aparelho (ex.: notebook do trabalho)"
              maxLength={60}
              className="h-11"
            />
            <Button
              type="button"
              onClick={() => {
                setErro("");
                setEtapa({ tipo: "codigo" });
              }}
              className="h-11 shrink-0"
            >
              <Fingerprint className="mr-2 h-4 w-4" />
              Cadastrar passkey
            </Button>
          </div>
        )}

        {!suportado && (
          <p className="text-[13px] text-muted-foreground/50">
            Este navegador não trabalha com passkey. Abra a tela num aparelho
            com biometria ou PIN.
          </p>
        )}

        {erro && etapa.tipo === "parado" && (
          <p className="text-[13px] text-destructive">{erro}</p>
        )}
      </div>
    </SectionCard>
  );
}
