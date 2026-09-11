"use client";

import { useEffect, useState } from "react";
import { SectionCard } from "@/components/ui/section-card";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, Monitor, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Onde a conta esta aberta.
//
// E a unica reacao possivel a "esqueci logado no computador da loja" e a "acho
// que alguem entrou": ver e cortar. Enquanto a sessao vivia so dentro do
// token, nao existia nem a lista nem o botao -- um cookie copiado valia por 24
// horas e ninguem conseguia encerra-lo.
//
// A lista mostra origem e datas. O identificador da linha vem junto porque a
// tela precisa dele para marcar qual e a sua e para encerrar as outras; ele
// nao e credencial, e sem o cookie assinado nao abre nada.
// ---------------------------------------------------------------------------

interface Sessao {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  atual: boolean;
}

/** Transforma o `User-Agent` em algo que uma pessoa reconhece. */
function descrever(userAgent: string | null): string {
  if (!userAgent) return "Aparelho desconhecido";
  const navegador =
    /edg\//i.test(userAgent) ? "Edge"
    : /chrome|crios/i.test(userAgent) ? "Chrome"
    : /firefox|fxios/i.test(userAgent) ? "Firefox"
    : /safari/i.test(userAgent) ? "Safari"
    : "Navegador";
  const sistema =
    /windows/i.test(userAgent) ? "Windows"
    : /android/i.test(userAgent) ? "Android"
    : /iphone|ipad|ios/i.test(userAgent) ? "iPhone ou iPad"
    : /mac os/i.test(userAgent) ? "Mac"
    : /linux/i.test(userAgent) ? "Linux"
    : "sistema desconhecido";
  return `${navegador} no ${sistema}`;
}

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function CartaoDeSessoes() {
  const [lista, setLista] = useState<Sessao[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const recarregar = () =>
    fetch("/api/me/sessions")
      .then((r) => (r.ok ? r.json() : { sessoes: [] }))
      .then((d) => setLista(d.sessoes ?? []))
      .catch(() => setLista([]));

  useEffect(() => {
    void recarregar();
  }, []);

  const encerrar = async (id: string) => {
    setErro("");
    setOcupado(true);
    try {
      const r = await fetch(`/api/me/sessions/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Não foi possível encerrar.");
      await recarregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const encerrarOutras = async () => {
    setErro("");
    setOcupado(true);
    try {
      const r = await fetch("/api/me/sessions", { method: "DELETE" });
      if (!r.ok) throw new Error("Não foi possível encerrar.");
      await recarregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const outras = (lista ?? []).filter((s) => !s.atual).length;

  return (
    <SectionCard
      icon={<Monitor className="h-4 w-4" />}
      title="Onde você está conectado"
      description="Sessão parada por uma hora cai sozinha, e nenhuma passa de 24 horas."
    >
      <div className="space-y-3">
        {lista === null && (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </p>
        )}

        {lista?.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-[14px] text-foreground">
                {descrever(s.userAgent)}
                {s.atual && (
                  <span className="ml-2 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-emerald-400">
                    esta sessão
                  </span>
                )}
              </p>
              <p className="truncate text-[11px] text-muted-foreground/45">
                {s.ipAddress ?? "origem desconhecida"} · vista em {quando(s.lastSeenAt)}
              </p>
            </div>
            {!s.atual && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={ocupado}
                onClick={() => encerrar(s.id)}
                className="shrink-0 text-muted-foreground/60 hover:text-destructive"
                aria-label="Encerrar esta sessão"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}

        {erro && <p className="text-[13px] text-destructive">{erro}</p>}

        {outras > 0 && (
          <Button
            type="button"
            variant="outline"
            disabled={ocupado}
            onClick={encerrarOutras}
            className="h-11 w-full"
          >
            <LogOut className="mr-2 h-4 w-4" />
            {outras === 1 ? "Encerrar a outra sessão" : `Encerrar as outras ${outras} sessões`}
          </Button>
        )}
      </div>
    </SectionCard>
  );
}
