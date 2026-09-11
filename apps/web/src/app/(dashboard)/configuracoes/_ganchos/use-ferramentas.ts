"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// As rotinas de manutencao da base, disparadas na mao.
//
// Duas delas -- corrigir modelos e corrigir valores inflados -- fazem uma
// passagem seca primeiro, mostram exemplos do que vao mudar e so aplicam se o
// operador confirmar. Sao correcoes em massa e irreversiveis; ver a amostra
// antes e o que separa um conserto de um estrago.
// ---------------------------------------------------------------------------

const ROTULOS_DE_LIMPEZA: Record<string, string> = {
  no_photo: "sem foto",
  bad_margin: "com margem ruim (preço >= FIPE)",
  all: "sem foto + margem ruim",
};

export function useFerramentas() {
  const [atualizandoFipe, setAtualizandoFipe] = useState(false);
  const [taggeando, setTaggeando] = useState(false);
  const [limpando, setLimpando] = useState(false);
  const [corrigindoNomes, setCorrigindoNomes] = useState(false);
  const [corrigindoPrecos, setCorrigindoPrecos] = useState(false);

  const atualizarFipe = useCallback(async () => {
    setAtualizandoFipe(true);
    try {
      const res = await fetch("/api/vehicles/backfill-fipe", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message || `${data.updated} veículos atualizados`);
      } else {
        toast.error("Erro ao atualizar FIPE");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setAtualizandoFipe(false);
    }
  }, []);

  const taggearRegioes = useCallback(async () => {
    setTaggeando(true);
    try {
      const res = await fetch("/api/groups/auto-region", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message || `${data.tagged} grupos taggeados`);
      } else {
        toast.error("Erro ao taguear");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setTaggeando(false);
    }
  }, []);

  const limpar = useCallback(async (modo: string) => {
    if (!confirm(`Remover veículos ${ROTULOS_DE_LIMPEZA[modo]}? Esta ação não pode ser desfeita.`)) return;
    setLimpando(true);
    try {
      const res = await fetch(`/api/vehicles/cleanup?mode=${modo}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message || `${data.removed} veículos removidos`);
      } else {
        toast.error("Erro ao limpar");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setLimpando(false);
    }
  }, []);

  /**
   * Modelo que na verdade e a chamada da loja ("Menor valor Brasil",
   * "CAARPIX PORTO ALEGRE"). Re-extrai do texto original do anuncio.
   */
  const corrigirModelos = useCallback(async () => {
    setCorrigindoNomes(true);
    try {
      const seco = await fetch("/api/admin/fix-vehicle-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      const previa = await seco.json();
      if (!seco.ok) {
        toast.error(previa.error || "Erro ao verificar");
        return;
      }
      if (previa.fixed === 0) {
        toast.success(
          previa.candidates > 0
            ? `${previa.candidates} candidatos mas não foi possível re-extrair (texto original incompleto)`
            : "Nenhum modelo errado encontrado"
        );
        return;
      }
      const exemplos = (previa.samples || [])
        .slice(0, 3)
        .map((s: { oldModel: string; newModel: string }) => `  ${s.oldModel} → ${s.newModel}`)
        .join("\n");
      if (!confirm(
        `${previa.fixed} veículos terão o modelo corrigido.\n\n` +
        `Exemplos:\n${exemplos}\n\n` +
        `Aplicar correção?`
      )) return;

      const res = await fetch("/api/admin/fix-vehicle-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${data.fixed} modelos corrigidos`, { duration: 8000 });
      } else {
        toast.error(data.error || "Erro ao aplicar");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro de conexão");
    } finally {
      setCorrigindoNomes(false);
    }
  }, []);

  /**
   * Preco cem vezes maior que o real, do bug em que "78.200.00" virava
   * 7.820.000. Acima de R$ 2 milhoes, divide por 100.
   */
  const corrigirPrecos = useCallback(async () => {
    setCorrigindoPrecos(true);
    try {
      const seco = await fetch("/api/admin/fix-inflated-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      const previa = await seco.json();
      if (!seco.ok) {
        toast.error(previa.error || "Erro ao verificar");
        return;
      }
      if (previa.candidates === 0) {
        toast.success("Nenhum veículo com valor inflado");
        return;
      }
      const a = previa.samples?.[0];
      if (!confirm(
        `Encontrados ${previa.candidates} veículos com valor inflado (> R$ 2.000.000).\n\n` +
        `Eles serão DIVIDIDOS POR 100 (corrige o bug do '78.200.00').\n\n` +
        `Exemplo: ${a?.model} R$ ${a?.old?.price?.toLocaleString("pt-BR")} → R$ ${a?.new?.price?.toLocaleString("pt-BR")}\n\n` +
        `Aplicar correção?`
      )) return;

      const res = await fetch("/api/admin/fix-inflated-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${data.fixed} veículos corrigidos`, { duration: 8000 });
      } else {
        toast.error(data.error || "Erro ao aplicar correção");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro de conexão");
    } finally {
      setCorrigindoPrecos(false);
    }
  }, []);

  return {
    atualizandoFipe, taggeando, limpando, corrigindoNomes, corrigindoPrecos,
    atualizarFipe, taggearRegioes, limpar, corrigirModelos, corrigirPrecos,
  };
}

export type Ferramentas = ReturnType<typeof useFerramentas>;
