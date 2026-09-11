"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PAGE_SIZE, type PaginatedResponse, type Papel, type TypeStats } from "../_componentes/tipos";

// ---------------------------------------------------------------------------
// As duas listas da tela: os grupos de onde o anuncio vem e para onde ele vai.
//
// Fonte e destino sao consultados e paginados em separado, porque sao dois
// numeros de WhatsApp diferentes com volumes bem distintos.
//
// A divisao de trabalho do filtro tem motivo: busca, tipo e regiao unica vao
// ao servidor, pra paginacao contar certo. Duas ou mais regioes o servidor nao
// aceita, entao esse caso -- e so ele -- e resolvido no cliente.
// ---------------------------------------------------------------------------

export function useListaDeGrupos() {
  const [fonte, setFonte] = useState<PaginatedResponse | null>(null);
  const [destino, setDestino] = useState<PaginatedResponse | null>(null);
  const [paginaFonte, setPaginaFonte] = useState(1);
  const [paginaDestino, setPaginaDestino] = useState(1);
  const [carregando, setCarregando] = useState(true);

  const [busca, setBusca] = useState("");
  const [buscaAdiada, setBuscaAdiada] = useState("");
  const [regioes, setRegioes] = useState<string[]>([]);
  const [tipo, setTipo] = useState<string>("todos");

  const [statsFonte, setStatsFonte] = useState<TypeStats | null>(null);
  const [statsDestino, setStatsDestino] = useState<TypeStats | null>(null);

  // Espera 300ms de silencio antes de consultar -- evita uma ida ao servidor
  // por tecla digitada.
  const relogioDaBusca = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (relogioDaBusca.current) clearTimeout(relogioDaBusca.current);
    relogioDaBusca.current = setTimeout(() => setBuscaAdiada(busca), 300);
    return () => {
      if (relogioDaBusca.current) clearTimeout(relogioDaBusca.current);
    };
  }, [busca]);

  useEffect(() => {
    setPaginaFonte(1);
    setPaginaDestino(1);
  }, [buscaAdiada, regioes, tipo]);

  const montarUrl = useCallback(
    (papel: Papel, pagina: number) => {
      const params = new URLSearchParams({
        role: papel,
        page: String(pagina),
        limit: String(PAGE_SIZE),
      });
      if (buscaAdiada) params.set("search", buscaAdiada);
      // Uma regiao so o servidor filtra; duas ou mais ficam pro cliente.
      if (regioes.length === 1) params.set("region", regioes[0]);
      if (tipo !== "todos") params.set("type", tipo);
      return `/api/groups?${params.toString()}`;
    },
    [buscaAdiada, regioes, tipo]
  );

  /** Contagem por tipo, usada nas pastilhas do filtro. */
  const buscarStats = useCallback(async () => {
    try {
      const [f, d] = await Promise.all([
        fetch("/api/groups/stats?role=SOURCE"),
        fetch("/api/groups/stats?role=TARGET"),
      ]);
      if (f.ok) setStatsFonte(await f.json());
      if (d.ok) setStatsDestino(await d.json());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { buscarStats(); }, [buscarStats]);

  const buscar = useCallback(async () => {
    try {
      const [f, d] = await Promise.all([
        fetch(montarUrl("SOURCE", paginaFonte)),
        fetch(montarUrl("TARGET", paginaDestino)),
      ]);
      if (f.ok) setFonte(await f.json());
      if (d.ok) setDestino(await d.json());
      buscarStats();
    } catch {
      // ignore
    } finally {
      setCarregando(false);
    }
  }, [montarUrl, paginaFonte, paginaDestino, buscarStats]);

  useEffect(() => { buscar(); }, [buscar]);

  // Conserto retroativo, uma vez por sessao e em silencio: syncs antigos
  // marcavam como canal alguns grupos `@g.us` que so aceitam post de admin.
  // Sem efeito se a base ja estiver correta.
  useEffect(() => {
    const CHAVE = "groups-classification-fixed-v1";
    if (typeof window === "undefined" || sessionStorage.getItem(CHAVE)) return;
    sessionStorage.setItem(CHAVE, "1");
    fetch("/api/groups/fix-classification", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.fixed > 0) {
          toast.success(`${data.fixed} grupos reclassificados (Canal → Grupo)`);
          buscar();
          buscarStats();
        }
      })
      .catch(() => { /* ignore */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // O servidor ja aplicou papel, busca, regiao unica e tipo. Sobra pro cliente
  // so o caso de varias regioes marcadas ao mesmo tempo.
  const passaNoFiltroLocal = useCallback(
    (regiao: string | null) => regioes.length <= 1 || regioes.includes(regiao || ""),
    [regioes]
  );

  const gruposFonte = (fonte?.groups || []).filter((g) => passaNoFiltroLocal(g.region));
  const gruposDestino = (destino?.groups || []).filter((g) => passaNoFiltroLocal(g.region));
  const totalCarregado = (fonte?.pagination.total || 0) + (destino?.pagination.total || 0);

  return {
    fonte, destino,
    gruposFonte, gruposDestino,
    totalCarregado,
    paginaFonte, setPaginaFonte,
    paginaDestino, setPaginaDestino,
    carregando,
    busca, setBusca,
    regioes, setRegioes,
    tipo, setTipo,
    statsFonte, statsDestino,
    buscar, buscarStats,
  };
}

export type ListaDeGrupos = ReturnType<typeof useListaDeGrupos>;
