"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Copy, Loader2, ShieldCheck, Smartphone } from "lucide-react";

// ---------------------------------------------------------------------------
// Cadastro do segundo fator.
//
// Fica fora do painel de proposito: a conta que chega aqui esta barrada em
// todo o resto, e o painel so renderizaria uma tela cheia de 403.
//
// A tela nao tem botao de "pular" nem de "desligar". A unica saida daqui e
// cadastrar o autenticador -- e o que faz "obrigatorio" significar
// obrigatorio.
// ---------------------------------------------------------------------------

interface Cadastro {
  uri: string;
  qr: string;
  chave: string;
}

export default function CadastroDoSegundoFator() {
  const [cadastro, setCadastro] = useState<Cadastro | null>(null);
  const [codigo, setCodigo] = useState("");
  const [codigosDeResgate, setCodigosDeResgate] = useState<string[] | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const estado = await fetch("/api/me/2fa").then((r) => (r.ok ? r.json() : null));
        if (!vivo) return;
        if (estado?.ativo) {
          // Ja cadastrado: nao ha o que fazer aqui.
          // Navegacao DURA de proposito: a arvore atual pertence a uma
          // sessao que pode ja estar morta. Um `push` guardaria estado velho.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = "/";
          return;
        }
        const inicio = await fetch("/api/me/2fa/iniciar", { method: "POST" });
        const corpo = await inicio.json();
        if (!vivo) return;
        if (!inicio.ok) throw new Error(corpo?.error ?? "Não foi possível iniciar o cadastro.");
        setCadastro(corpo);
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "Erro ao iniciar o cadastro.");
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const ativar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const resposta = await fetch("/api/me/2fa/ativar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo?.error ?? "Código inválido.");
      setCodigosDeResgate(corpo.codigos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao ativar.");
      setCodigo("");
    } finally {
      setEnviando(false);
    }
  };

  const copiar = async () => {
    if (!codigosDeResgate) return;
    await navigator.clipboard.writeText(codigosDeResgate.join("\n"));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070709] px-6 py-12">
      <div className="w-full max-w-[460px]">
        <div className="mb-8 flex flex-col items-center">
          <div className="relative mb-5 h-16 w-44">
            <Image
              src="/logo-don-felipe.png"
              alt="Don Felipe Repasses"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>

        <div className="glass-strong space-y-5 rounded-2xl p-7">
          {codigosDeResgate ? (
            <ListaDeResgate
              codigos={codigosDeResgate}
              copiado={copiado}
              onCopiar={copiar}
            />
          ) : (
            <>
              <div className="space-y-1">
                <h1 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-foreground">
                  <ShieldCheck className="h-5 w-5 text-brand-gold" />
                  Cadastre o segundo fator
                </h1>
                <p className="text-[13px] leading-relaxed text-muted-foreground/60">
                  A senha sozinha não abre mais o sistema. Escaneie o código
                  abaixo no seu aplicativo autenticador e confirme com o número
                  que ele mostrar.
                </p>
              </div>

              {carregando && (
                <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-[13px]">Preparando...</span>
                </div>
              )}

              {cadastro && (
                <>
                  <div className="flex justify-center">
                    {/* O QR vem desenhado do servidor como `data:`. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cadastro.qr}
                      alt="QR do segundo fator"
                      className="h-48 w-48 rounded-lg bg-white p-2"
                    />
                  </div>

                  <div className="space-y-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                    <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-muted-foreground/50">
                      <Smartphone className="h-3 w-3" />
                      Sem câmera? Digite esta chave
                    </p>
                    <code className="block break-all font-mono text-[12px] leading-relaxed text-foreground/80">
                      {cadastro.chave}
                    </code>
                  </div>

                  <form onSubmit={ativar} className="space-y-3">
                    <Input
                      id="codigo"
                      type="text"
                      inputMode="numeric"
                      placeholder="000000"
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value)}
                      autoComplete="one-time-code"
                      maxLength={6}
                      required
                      className="h-12 text-center text-lg tracking-[0.4em] bg-white/[0.02] border-white/[0.06]"
                    />
                    {erro && (
                      <p className="rounded-lg border border-destructive/30 bg-destructive/[0.06] px-3 py-2 text-[13px] text-destructive">
                        {erro}
                      </p>
                    )}
                    <Button
                      type="submit"
                      disabled={enviando || codigo.length < 6}
                      className="h-12 w-full gradient-gold font-semibold text-white"
                    >
                      {enviando ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Conferindo...
                        </span>
                      ) : (
                        "Ativar segundo fator"
                      )}
                    </Button>
                  </form>
                </>
              )}

              {!cadastro && !carregando && erro && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/[0.06] px-3 py-2 text-[13px] text-destructive">
                  {erro}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Os codigos de resgate, uma unica vez.
 *
 * Eles nao voltam em leitura nenhuma depois desta tela -- e por isso que o
 * botao de continuar so aparece com a confirmacao marcada. Guardados no
 * banco, viram hash; aqui e o unico lugar onde existem em claro.
 */
function ListaDeResgate({
  codigos,
  copiado,
  onCopiar,
}: {
  codigos: string[];
  copiado: boolean;
  onCopiar: () => void;
}) {
  const [guardei, setGuardei] = useState(false);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] text-foreground">
          <Check className="h-5 w-5 text-emerald-400" />
          Segundo fator ativo
        </h1>
        <p className="text-[13px] leading-relaxed text-muted-foreground/60">
          Guarde estes códigos de resgate agora. Eles são a sua entrada se o
          celular sumir, valem uma vez cada, e esta tela não volta.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
        {codigos.map((codigo) => (
          <code key={codigo} className="font-mono text-[13px] text-foreground/85">
            {codigo}
          </code>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={onCopiar}
        className="h-10 w-full border-white/[0.08]"
      >
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

      <label className="flex cursor-pointer items-start gap-2 text-[13px] text-muted-foreground/70">
        <input
          type="checkbox"
          checked={guardei}
          onChange={(e) => setGuardei(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--brand-gold,#c9973d)]"
        />
        Guardei os códigos num lugar seguro.
      </label>

      <p className="text-[12px] leading-relaxed text-muted-foreground/45">
        Ligar o fator encerrou esta sessão. Entre de novo com a senha e o
        código do aplicativo: é assim que o ciclo fica provado.
      </p>

      <Button
        type="button"
        disabled={!guardei}
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="h-12 w-full gradient-gold font-semibold text-white"
      >
        Entrar de novo
      </Button>
    </div>
  );
}
