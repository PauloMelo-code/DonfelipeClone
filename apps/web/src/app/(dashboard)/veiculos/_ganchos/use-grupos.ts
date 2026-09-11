"use client";

import { useCallback, useMemo, useState } from "react";
import type { WhatsAppGroup } from "../_componentes/tipos";

// ---------------------------------------------------------------------------
// Os grupos de destino e o que esta marcado pra receber a publicacao.
//
// Estado compartilhado por tres modais (publicar, lote e publicacao rapida),
// por isso mora fora deles. Toda selecao usa `groupId` (o JID do WhatsApp),
// que e a chave que o backend consulta -- usar o `id` do banco faz o publish
// nao achar grupo nenhum.
// ---------------------------------------------------------------------------

export function useGrupos() {
  const [grupos, setGrupos] = useState<WhatsAppGroup[]>([]);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [regioesAbertas, setRegioesAbertas] = useState<Set<string>>(new Set());

  const gruposPorRegiao = useMemo(() => {
    const map = new Map<string, WhatsAppGroup[]>();
    for (const g of grupos) {
      const r = g.region || "Outros";
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(g);
    }
    return map;
  }, [grupos]);

  /** Busca os grupos de destino ativos. Devolve a lista pra quem precisa pre-selecionar. */
  const carregar = useCallback(async (): Promise<WhatsAppGroup[]> => {
    try {
      const res = await fetch("/api/groups?role=TARGET&active=true&counts=false");
      if (!res.ok) throw new Error(String(res.status));
      const lista: WhatsAppGroup[] = await res.json();
      setGrupos(lista);
      return lista;
    } catch {
      setGrupos([]);
      return [];
    }
  }, []);

  /** Marca ou desmarca a regiao inteira. */
  const alternarRegiao = useCallback((regiao: string) => {
    const ids = (gruposPorRegiao.get(regiao) || []).map((g) => g.groupId);
    const todosMarcados = ids.every((id) => selecionados.includes(id));
    setSelecionados((prev) =>
      todosMarcados
        ? prev.filter((id) => !ids.includes(id))
        : [...new Set([...prev, ...ids])]
    );
  }, [gruposPorRegiao, selecionados]);

  const alternarGrupo = useCallback((groupId: string) => {
    setSelecionados((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  }, []);

  /** Abre ou fecha a sanfona. A mesma chave serve pras secoes especiais dos modais. */
  const alternarAbertura = useCallback((chave: string) => {
    setRegioesAbertas((prev) => {
      const n = new Set(prev);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });
  }, []);

  return {
    grupos,
    setGrupos,
    selecionados,
    setSelecionados,
    regioesAbertas,
    setRegioesAbertas,
    gruposPorRegiao,
    carregar,
    alternarRegiao,
    alternarGrupo,
    alternarAbertura,
  };
}

export type Grupos = ReturnType<typeof useGrupos>;
