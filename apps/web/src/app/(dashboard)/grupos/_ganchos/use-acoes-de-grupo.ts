"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { Group } from "../_componentes/tipos";

// ---------------------------------------------------------------------------
// O que se faz num grupo de cada vez, direto no card.
//
// Ligar e desligar, trocar de papel, marcar regiao, renomear, reclassificar,
// testar o envio e remover. Tudo grava na hora e reconsulta a lista -- nao ha
// botao "salvar" nesta tela.
// ---------------------------------------------------------------------------

interface Opcoes {
  buscar: () => void;
  buscarStats: () => void;
}

/** Posicao na tela do menu de reclassificacao, junto do grupo que o abriu. */
interface MenuDeTipo {
  id: string;
  x: number;
  y: number;
  group: Group;
}

export function useAcoesDeGrupo({ buscar, buscarStats }: Opcoes) {
  const [testandoId, setTestandoId] = useState<string | null>(null);
  const [renomeandoId, setRenomeandoId] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState("");
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [menuDeTipo, setMenuDeTipo] = useState<MenuDeTipo | null>(null);

  /** Toda alteracao de campo passa por aqui: um PUT e a lista recarrega. */
  const alterar = useCallback(async (group: Group, corpo: Record<string, unknown>, erro: string) => {
    try {
      const res = await fetch(`/api/groups/${group.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (res.ok) {
        buscar();
        return true;
      }
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || erro);
      return false;
    } catch {
      toast.error("Erro de conexão");
      return false;
    }
  }, [buscar]);

  const alternar = useCallback((group: Group, campo: "active" | "role") => {
    const corpo = campo === "active"
      ? { active: !group.active }
      : { role: group.role === "SOURCE" ? "TARGET" : "SOURCE" };
    return alterar(group, corpo, "Erro ao atualizar grupo");
  }, [alterar]);

  /** Clicar na regiao ja marcada desmarca. */
  const marcarRegiao = useCallback((group: Group, regiao: string) => {
    return alterar(group, { region: group.region === regiao ? null : regiao }, "Erro ao atualizar região");
  }, [alterar]);

  const remover = useCallback(async (group: Group) => {
    if (!confirm(`Remover "${group.name}"?`)) return;
    try {
      const res = await fetch(`/api/groups/${group.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Grupo removido");
        buscar();
      } else {
        const err = await res.json();
        toast.error(err.error || "Erro ao remover");
      }
    } catch {
      toast.error("Erro de conexão");
    }
  }, [buscar]);

  // ── Renomear ─────────────────────────────────────────────────────────
  const comecarRenome = useCallback((group: Group) => {
    setRenomeandoId(group.id);
    setNomeEditado(group.name);
  }, []);

  const cancelarRenome = useCallback(() => setRenomeandoId(null), []);

  const salvarNome = useCallback(async (group: Group) => {
    const novo = nomeEditado.trim();
    if (!novo || novo === group.name) {
      setRenomeandoId(null);
      return;
    }
    setSalvandoNome(true);
    // O nome digitado fica travado: o proximo sync nao sobrescreve.
    const ok = await alterar(group, { name: novo }, "Erro ao renomear");
    if (ok) {
      toast.success("Nome salvo — não será sobrescrito ao sincronizar");
      setRenomeandoId(null);
    }
    setSalvandoNome(false);
  }, [nomeEditado, alterar]);

  // ── Reclassificar ────────────────────────────────────────────────────
  const abrirMenuDeTipo = useCallback((e: React.MouseEvent<HTMLButtonElement>, group: Group) => {
    e.stopPropagation();
    e.preventDefault();
    // A medida do botao tem que sair AGORA: dentro do callback do setState o
    // React ja limpou o evento e `currentTarget` seria nulo.
    const r = e.currentTarget.getBoundingClientRect();
    setMenuDeTipo((atual) =>
      atual?.id === group.id ? null : { id: group.id, x: r.left, y: r.bottom + 4, group }
    );
  }, []);

  /** `kind` nulo remove o override e devolve o tipo a leitura automatica. */
  const reclassificar = useCallback(async (group: Group, kind: string | null) => {
    setMenuDeTipo(null);
    const ok = await alterar(group, { kindOverride: kind }, "Erro ao reclassificar");
    if (ok) {
      toast.success(kind ? `Reclassificado como ${kind}` : "Tipo restaurado para automático");
      buscarStats();
    }
  }, [alterar, buscarStats]);

  // Fecha o menu no clique fora ou no Escape. O setTimeout(0) impede que o
  // proprio clique que abriu o menu seja lido como "clique fora".
  useEffect(() => {
    if (!menuDeTipo) return;
    const aoClicar = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-kind-menu]")) return;
      setMenuDeTipo(null);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuDeTipo(null);
    };
    const t = setTimeout(() => {
      document.addEventListener("click", aoClicar);
      document.addEventListener("keydown", aoTeclar);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [menuDeTipo]);

  // ── Envio de teste ───────────────────────────────────────────────────
  const testarEnvio = useCallback(async (group: Group) => {
    setTestandoId(group.id);
    try {
      const res = await fetch(`/api/groups/${group.id}/test-send`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(`${group.name}: enviou em ${data.durationMs}ms`, { duration: 6000 });
      } else {
        toast.error(`${group.name}: ${data.error || "erro desconhecido"}`, { duration: 12000 });
      }
    } catch (e) {
      toast.error(`Erro de conexão: ${e instanceof Error ? e.message : String(e)}`, { duration: 8000 });
    } finally {
      setTestandoId(null);
    }
  }, []);

  /**
   * Conserta um cadastro que virou `telefone@broadcast` por engano.
   *
   * Lista de transmissao precisa ser um JID real devolvido pelo WhatsApp;
   * montar um a partir do numero nao funciona. Como o JID e unico, o conserto
   * e apagar e recriar como conversa direta.
   */
  const converterParaDM = useCallback(async (group: Group) => {
    const telefone = group.groupId.replace(/@broadcast$/, "");
    if (!/^\d+$/.test(telefone)) {
      toast.error("Esta entrada não parece um número de telefone");
      return;
    }
    try {
      const apagou = await fetch(`/api/groups/${group.id}`, { method: "DELETE" });
      if (!apagou.ok) throw new Error("delete failed");
      const criou = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: `${telefone}@s.whatsapp.net`,
          name: group.name,
          role: group.role,
          active: group.active,
          region: group.region,
        }),
      });
      if (!criou.ok) throw new Error("create failed");
      toast.success("JID corrigido para DM");
      buscar();
    } catch {
      toast.error("Erro ao corrigir JID");
    }
  }, [buscar]);

  return {
    testandoId,
    renomeandoId, nomeEditado, setNomeEditado, salvandoNome,
    comecarRenome, cancelarRenome, salvarNome,
    menuDeTipo, abrirMenuDeTipo, reclassificar,
    alternar, marcarRegiao, remover, testarEnvio, converterParaDM,
  };
}

export type AcoesDeGrupo = ReturnType<typeof useAcoesDeGrupo>;
