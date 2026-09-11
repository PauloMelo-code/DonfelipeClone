"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { parseArray, type Vehicle } from "../_componentes/tipos";

// ---------------------------------------------------------------------------
// A fila de veiculos: o que esta na tela, como chegou ali e como sai.
//
// A busca e a paginacao sao do servidor; os filtros de chip (estado, faixa de
// preco, cambio) sao locais e rodam sobre a pagina carregada. Misturar os dois
// confundia a paginacao, por isso a busca NAO refiltra no cliente.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

export interface Filtros {
  states: string[];
  priceRange: string;
  transmission: string;
}

export function useFila() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("PENDING");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filtros>({ states: [], priceRange: "", transmission: "" });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filtro de estado vindo da URL (?state=SC) -- o dashboard linka pra ca ao
  // clicar numa UF no card "Capturas por estado".
  const searchParams = useSearchParams();
  useEffect(() => {
    const stateParam = searchParams.get("state");
    if (stateParam) {
      const upper = stateParam.toUpperCase();
      setFilters((f) => f.states.includes(upper) ? f : { ...f, states: [...f.states, upper] });
    }
    // roda uma vez, com a URL de entrada
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buscar = useCallback(async () => {
    try {
      // "PREPARED" e uma aba virtual: status=APPROVED + prepared=true.
      // A aba APPROVED real exclui os preparados (prepared=false).
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (activeTab === "PREPARED") {
        params.set("status", "APPROVED");
        params.set("prepared", "true");
      } else if (activeTab === "APPROVED") {
        params.set("status", "APPROVED");
        params.set("prepared", "false");
      } else {
        params.set("status", activeTab);
      }
      // Busca no servidor -- procura em model/brand/plate/rawDescription no
      // banco inteiro, nao so na pagina atual.
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());

      const res = await fetch(`/api/vehicles?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setVehicles(data.vehicles || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalCount(data.pagination?.total || 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, debouncedSearch]);

  // Debounce da busca (300ms) -- evita uma requisicao por tecla.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedSearch]);

  useEffect(() => {
    setLoading(true);
    buscar();
  }, [buscar]);

  const filtrados = useMemo(() => {
    let result = vehicles;
    if (filters.states.length > 0) {
      // Estado em ordem de confianca: o que a IA extraiu, depois a tag manual
      // da regiao do grupo, e por ultimo a UF no nome do grupo.
      const wantedStates = filters.states.map(s => s.toUpperCase());
      result = result.filter(v => {
        const vState = (v.state || v.sourceGroup?.region || "").toUpperCase();
        if (vState && wantedStates.includes(vState)) return true;
        const groupName = v.sourceGroup?.name?.toUpperCase() || "";
        return wantedStates.some(s => groupName.includes(s));
      });
    }
    if (filters.priceRange) {
      const [min, max] = filters.priceRange.split("-").map(Number);
      result = result.filter(v => v.price >= min && (max ? v.price <= max : true));
    }
    if (filters.transmission) {
      result = result.filter(v => v.transmission === filters.transmission);
    }
    return result;
  }, [vehicles, filters]);

  /** Tira o veiculo da tela na hora, antes do servidor confirmar. */
  const removerDaLista = useCallback((id: string) => {
    setVehicles((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const swipeVehicles = useMemo(() =>
    filtrados.map((v) => ({
      ...v,
      features: parseArray(v.features),
      photos: parseArray(v.photos),
    })),
    [filtrados]
  );

  /** Aprova ou publica. Rejeitar abre o dialogo de motivo, entao sai por `aoRejeitar`. */
  const executarAcao = useCallback(async (
    id: string,
    action: "approve" | "reject" | "publish",
    aoRejeitar: (id: string) => void,
  ) => {
    if (action === "reject") {
      aoRejeitar(id);
      return;
    }
    setActionLoading(id);
    try {
      const res = await fetch(`/api/vehicles/${id}/${action}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.status === "APPROVED" || action === "approve") {
          toast.success("Veículo aprovado!", {
            action: {
              label: "Desfazer",
              onClick: async () => {
                const r = await fetch(`/api/vehicles/${id}/undo`, { method: "POST" });
                if (r.ok) {
                  toast.success("Ação desfeita");
                  buscar();
                } else {
                  const err = await r.json().catch(() => ({}));
                  toast.error(err.error || "Erro ao desfazer");
                }
              },
            },
            duration: 10000,
          });
        } else {
          toast.success("Publicação iniciada!");
        }
        removerDaLista(id);
      } else {
        const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        toast.error(err.error || `Erro ao ${action === "approve" ? "aprovar" : "publicar"}`);
        buscar();
      }
    } catch {
      toast.error("Erro de conexão");
      buscar();
    } finally {
      setActionLoading(null);
    }
  }, [buscar, removerDaLista]);

  /** Edicao inline de um campo. A resposta do servidor e a fonte da verdade. */
  const atualizarCampo = useCallback(async (id: string, field: string, value: string | number) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`/api/vehicles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.details?.[0]?.message || err?.error || "Erro ao salvar");
      }
      const updated = await res.json().catch(() => null);
      setVehicles((prev) => prev.map((v) => {
        if (v.id !== id) return v;
        if (updated && typeof updated === "object" && updated.id) return { ...v, ...updated };
        return { ...v, [field]: value };
      }));
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  /** Confirma a rejeicao com motivo. Sai da fila na hora, com 10s pra desfazer. */
  const rejeitar = useCallback(async (id: string, motivo: string, etiquetas: string[]) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/vehicles/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rejectionReason: motivo.trim() || undefined,
          rejectionTags: etiquetas.length > 0 ? etiquetas : undefined,
        }),
      });
      if (res.ok) {
        toast.success("Veículo rejeitado.", {
          action: {
            label: "Desfazer",
            onClick: async () => {
              const r = await fetch(`/api/vehicles/${id}/undo`, { method: "POST" });
              if (r.ok) {
                toast.success("Ação desfeita");
                buscar();
              } else {
                const err = await r.json().catch(() => ({}));
                toast.error(err.error || "Erro ao desfazer");
              }
            },
          },
          duration: 10000,
        });
        removerDaLista(id);
        return true;
      }
      const err = await res.json();
      toast.error(err.error || "Erro ao rejeitar");
      return false;
    } catch {
      toast.error("Erro de conexão");
      return false;
    } finally {
      setActionLoading(null);
    }
  }, [buscar, removerDaLista]);

  /** Remove uma foto do anuncio. A lista e reconsultada porque os indices mudam. */
  const excluirFoto = useCallback(async (id: string, indice: number) => {
    try {
      const res = await fetch(`/api/vehicles/${id}/delete-photo?index=${indice}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Foto excluída");
        buscar();
      } else {
        toast.error("Erro ao excluir foto");
      }
    } catch {
      toast.error("Erro de conexão");
    }
  }, [buscar]);

  /** Promove a foto escolhida a capa -- e a unica que aparece no card do grupo. */
  const definirFotoPrincipal = useCallback(async (id: string, indice: number) => {
    const alvo = vehicles.find((x) => x.id === id);
    if (!alvo) return;
    const fotos = parseArray(alvo.photos);
    if (indice <= 0 || indice >= fotos.length) return;
    const reordenadas = [fotos[indice], ...fotos.filter((_, i) => i !== indice)];

    setVehicles((prev) => prev.map((v) => v.id === id ? { ...v, photos: reordenadas } : v));
    try {
      const res = await fetch(`/api/vehicles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: reordenadas }),
      });
      if (!res.ok) {
        toast.error("Erro ao definir foto principal");
        buscar();
      }
    } catch {
      toast.error("Erro de conexão");
      buscar();
    }
  }, [vehicles, buscar]);

  return {
    vehicles, setVehicles,
    loading,
    activeTab, setActiveTab,
    search, setSearch,
    actionLoading, setActionLoading,
    filters, setFilters,
    page, setPage, totalPages, totalCount,
    filtrados, swipeVehicles,
    isPending: activeTab === "PENDING",
    buscar, removerDaLista, executarAcao, atualizarCampo, rejeitar,
    excluirFoto, definirFotoPrincipal,
  };
}

export type Fila = ReturnType<typeof useFila>;
