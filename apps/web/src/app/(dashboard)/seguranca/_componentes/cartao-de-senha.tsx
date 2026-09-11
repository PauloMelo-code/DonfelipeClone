"use client";

import { useState } from "react";
import { SectionCard } from "@/components/ui/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Loader2, Lock } from "lucide-react";

/**
 * Troca da propria senha.
 *
 * A senha atual e obrigatoria. Sem ela, um cookie roubado troca a credencial e
 * o dono perde a conta -- e a sessao do atacante sobrevive porque foi ele quem
 * escolheu a senha nova.
 *
 * A rota por tras nao aceita `userId`: o alvo e sempre a sessao corrente.
 */
export function CartaoDeSenha() {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string[]>([]);
  const [pronto, setPronto] = useState(false);

  const trocar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro([]);
    setPronto(false);
    setOcupado(true);
    try {
      const r = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaAtual: atual, senhaNova: nova }),
      });
      const corpo = await r.json();
      if (!r.ok) {
        setErro(corpo?.details?.length ? corpo.details : [corpo?.error ?? "Não foi possível trocar."]);
        return;
      }
      setAtual("");
      setNova("");
      setPronto(true);
    } catch {
      setErro(["Erro ao falar com o servidor."]);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <SectionCard
      icon={<Lock className="h-4 w-4" />}
      title="Senha"
      description="Trocar exige a senha atual: sem isso, um cookie roubado tomaria a conta."
    >
      <form onSubmit={trocar} className="space-y-3">
        <Input
          type="password"
          placeholder="Senha atual"
          value={atual}
          onChange={(e) => setAtual(e.target.value)}
          autoComplete="current-password"
          required
          className="h-11"
        />
        <Input
          type="password"
          placeholder="Senha nova"
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          autoComplete="new-password"
          required
          className="h-11"
        />
        {erro.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/[0.06] px-3 py-2">
            {erro.map((linha) => (
              <li key={linha} className="text-[13px] text-destructive">
                {linha}
              </li>
            ))}
          </ul>
        )}
        {pronto && (
          <p className="flex items-center gap-2 text-[13px] text-emerald-400">
            <Check className="h-4 w-4" /> Senha trocada.
          </p>
        )}
        <Button type="submit" disabled={ocupado || !atual || !nova} className="h-11">
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : "Trocar a senha"}
        </Button>
      </form>
    </SectionCard>
  );
}
