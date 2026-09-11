"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CHAVES_GRAVAVEIS, type Settings } from "../_componentes/tipos";

// ---------------------------------------------------------------------------
// Os parametros de negocio: margem, regiao atendida, ritmo anti-ban, filtros
// de captura e palavras-chave.
//
// Tudo e texto no banco, uma linha por chave. Os valores abaixo sao o que vale
// enquanto a consulta nao volta -- e tambem o que fica se a chave nunca foi
// gravada.
// ---------------------------------------------------------------------------

const PADROES: Settings = {
  profit_margin_percent: "10",
  min_fipe_discount: "10",
  served_states: "RS,SC,PR,SP",
  delay_min_seconds: "3",
  delay_max_seconds: "8",
  filter_min_year: "2018",
  filter_min_price: "30000",
  filter_max_km: "300000",
  blocklist_keywords: "",
  vip_keywords: "",
};

export function useConfiguracoes() {
  const [valores, setValores] = useState<Settings>(PADROES);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const buscar = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setValores((prev) => ({ ...prev, ...data }));
      }
    } catch {
      // ignore
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { buscar(); }, [buscar]);

  const alterar = useCallback((chave: keyof Settings, valor: string) => {
    setValores((prev) => ({ ...prev, [chave]: valor }));
  }, []);

  const salvar = useCallback(async () => {
    setSalvando(true);
    try {
      // Manda so as chaves desta tela: a resposta do GET pode trazer outras.
      const corpo: Record<string, string> = {};
      for (const k of CHAVES_GRAVAVEIS) corpo[k] = String(valores[k]);

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (res.ok) {
        toast.success("Configurações salvas!");
      } else {
        const err = await res.json().catch(() => ({ error: "Erro ao salvar" }));
        toast.error(err.error || "Erro ao salvar");
      }
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }, [valores]);

  return { valores, carregando, salvando, alterar, salvar };
}

export type Configuracoes = ReturnType<typeof useConfiguracoes>;
