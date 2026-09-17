"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// As rotinas de manutencao da base, disparadas na mao.
//
// Tres delas -- corrigir modelos, corrigir valores inflados e zerar o
// sistema -- fazem uma passagem seca primeiro, mostram o que vao mudar e so
// aplicam se o operador confirmar. Sao mudancas em massa e irreversiveis; ver
// a amostra antes e o que separa um conserto de um estrago.
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
  const [zerando, setZerando] = useState(false);

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

  /**
   * Zera a operacao: todos os carros e o historico de publicacoes saem (delete
   * logico). Grupos, usuarios, configuracoes e a auditoria ficam.
   *
   * Simula antes e so executa com "ZERAR" digitado: e o botao mais destrutivo
   * da tela, e um confirm de clique unico seria facil demais de aceitar.
   */
  const zerarSistema = useCallback(async () => {
    setZerando(true);
    try {
      // Um minuto a frente cobre relogio do computador atrasado em relacao ao servidor.
      const pedir = (dryRun: boolean) => fetch("/api/admin/reset-vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, keepFrom: new Date(Date.now() + 60_000).toISOString() }),
      });

      const seco = await pedir(true);
      const previa = await seco.json().catch(() => ({}));
      if (!seco.ok) {
        toast.error(previa.error || "Erro ao verificar");
        return;
      }
      const carros: number = previa.wouldDelete?.vehicles ?? 0;
      const publicacoes: number = previa.wouldDelete?.postHistory ?? 0;
      if (carros === 0) {
        toast.success("Nada para zerar: não há carros no sistema");
        return;
      }

      const resposta = prompt(
        `Zerar o sistema apaga ${carros} carro(s) e ${publicacoes} publicação(ões), com as fotos. ` +
        `O painel e os Insights voltam a zero.\n\n` +
        `Grupos, usuários e configurações continuam como estão.\n\n` +
        `Para confirmar, digite ZERAR:`
      );
      if (resposta === null) return;
      if (resposta.trim().toUpperCase() !== "ZERAR") {
        toast.info("Nada foi apagado: a confirmação não bateu");
        return;
      }

      const res = await pedir(false);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(
          `Sistema zerado: ${data.deleted?.vehicles ?? 0} carros e ${data.deleted?.postHistory ?? 0} publicações removidos`,
          { duration: 8000 }
        );
      } else {
        toast.error(data.error || "Erro ao zerar");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro de conexão");
    } finally {
      setZerando(false);
    }
  }, []);

  return {
    atualizandoFipe, taggeando, limpando, corrigindoNomes, corrigindoPrecos, zerando,
    atualizarFipe, taggearRegioes, limpar, corrigirModelos, corrigirPrecos, zerarSistema,
  };
}

export type Ferramentas = ReturnType<typeof useFerramentas>;
