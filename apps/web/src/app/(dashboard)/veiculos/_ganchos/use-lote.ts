"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { estadoDoVeiculo, type Vehicle } from "../_componentes/tipos";

// ---------------------------------------------------------------------------
// Publicacao em lote: a selecao de varios carros e os dois caminhos de massa.
//
//   - "Publicar em lote": o operador marca os aprovados na mao e escolhe os
//     grupos no modal.
//   - "Publicar prontos": os que ja foram preparados antes, com texto, fotos e
//     grupos salvos; vao direto, opcionalmente filtrados por estado.
//
// Nos dois casos o servidor enfileira e publica em segundo plano; a tela so
// tira os carros da lista e reconsulta depois.
// ---------------------------------------------------------------------------

interface Opcoes {
  filtrados: Vehicle[];
  setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  buscar: () => void;
  gruposSelecionados: string[];
}

export function useLote({ filtrados, setVehicles, buscar, gruposSelecionados }: Opcoes) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [publicando, setPublicando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);

  // Trocar de aba, de pagina ou de busca zera a selecao -- `buscar` muda de
  // identidade exatamente nesses casos.
  useEffect(() => {
    setSelecionados(new Set());
  }, [buscar]);

  const alternar = useCallback((id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const marcarTodosAprovados = useCallback(() => {
    const ids = filtrados.filter((v) => v.status === "APPROVED").map((v) => v.id);
    setSelecionados((prev) => (prev.size === ids.length ? new Set() : new Set(ids)));
  }, [filtrados]);

  const publicar = useCallback(async () => {
    if (selecionados.size === 0 || gruposSelecionados.length === 0) return;
    setPublicando(true);
    try {
      const ids = Array.from(selecionados);
      const res = await fetch("/api/vehicles/batch-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleIds: ids, targetGroupIds: gruposSelecionados }),
      });
      if (res.ok) {
        const data = await res.json();
        const publishable = data.publishable ?? data.total;
        const skipped = data.skipped ?? 0;
        toast.success(
          skipped > 0
            ? `${publishable} enfileirados (${skipped} ignorados pois já foram publicados ou não estão aprovados)`
            : `${publishable} veículos enfileirados — publicando em background`,
          { duration: 8000 }
        );
        // Tira os enfileirados da tela na hora. O servidor publica em paralelo;
        // a reconsulta em 10s traz o estado real.
        const idSet = new Set(ids);
        setVehicles((prev) => prev.filter((v) => !idSet.has(v.id)));
        setSelecionados(new Set());
        setModalAberto(false);
        setTimeout(() => buscar(), 10_000);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Erro ao publicar em lote");
      }
    } catch {
      toast.error("Erro de conexao");
    } finally {
      setPublicando(false);
    }
  }, [selecionados, gruposSelecionados, setVehicles, buscar]);

  /** Publica todos os preparados. Com `estado`, so os daquela UF. */
  const publicarProntos = useCallback(async (estado?: string) => {
    const total = estado
      ? filtrados.filter((v) => estadoDoVeiculo(v)?.toUpperCase() === estado).length
      : filtrados.length;
    const pergunta = estado
      ? `Publicar ${total} veículos de ${estado}?`
      : `Publicar todos os ${total} prontos?`;
    if (!confirm(pergunta + "\n\nEles serão postados em background com delays anti-ban.")) return;

    setPublicando(true);
    try {
      const res = await fetch("/api/vehicles/batch-publish-prepared", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(estado ? { state: estado } : {}),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${data.queued} veículos enfileirados`, { duration: 6000 });
        setVehicles((prev) => estado
          ? prev.filter((v) => estadoDoVeiculo(v)?.toUpperCase() !== estado)
          : []
        );
      } else {
        toast.error(data.error || "Erro ao enfileirar");
      }
    } catch (e) {
      toast.error(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPublicando(false);
    }
  }, [filtrados, setVehicles]);

  return {
    selecionados, setSelecionados,
    publicando,
    modalAberto, setModalAberto,
    alternar, marcarTodosAprovados, publicar, publicarProntos,
  };
}

export type Lote = ReturnType<typeof useLote>;
