"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { anuncioParaExibir } from "@/lib/vehicle-formatter";
import { parseArray, textoDoAnuncio, type Vehicle, type WhatsAppGroup } from "../_componentes/tipos";

// ---------------------------------------------------------------------------
// O modal de publicar: foto, texto, margem e grupos de um veiculo so.
//
// Duas regras que ja custaram caro e estao presas aqui:
//
//   1. O texto salvo no banco tem prioridade sobre o gerado. Antes o sistema
//      sempre regerava do zero e jogava fora a edicao do operador.
//   2. As fotos editadas vao no corpo do POST, nao so no PUT. Sem isso a
//      publicacao em segundo plano lia o banco antes do PUT terminar e
//      mandava a foto original.
// ---------------------------------------------------------------------------

const CHAVE_SECAO_GRUPOS = "donfelipe_groups_section_open";

interface Opcoes {
  grupos: WhatsAppGroup[];
  carregarGrupos: () => Promise<WhatsAppGroup[]>;
  setGruposSelecionados: React.Dispatch<React.SetStateAction<string[]>>;
  gruposSelecionados: string[];
  setRegioesAbertas: React.Dispatch<React.SetStateAction<Set<string>>>;
  removerDaLista: (id: string) => void;
  buscar: () => void;
}

export function usePublicacao({
  grupos,
  carregarGrupos,
  setGruposSelecionados,
  gruposSelecionados,
  setRegioesAbertas,
  removerDaLista,
  buscar,
}: Opcoes) {
  const [veiculo, setVeiculo] = useState<Vehicle | null>(null);
  const [modoReenvio, setModoReenvio] = useState(false);
  const [texto, setTexto] = useState("");
  const [regerando, setRegerando] = useState(false);
  const [aba, setAba] = useState<"photo" | "edit" | "preview">("edit");
  const [editorTelaCheia, setEditorTelaCheia] = useState(false);
  const [fotosEditadas, setFotosEditadas] = useState<Record<number, string>>({});
  const [modoPreview, setModoPreview] = useState<"before" | "after">("after");
  const [margem, setMargem] = useState(10);

  // Marca sozinho os grupos da regiao do veiculo. Sem regiao detectada, nada
  // fica marcado -- o operador precisa escolher de proposito.
  useEffect(() => {
    if (!veiculo || grupos.length === 0) return;
    const regiao = veiculo.state || veiculo.sourceGroup?.region || null;

    // A secao "Enviar para" lembra se ficou aberta. O padrao e fechada, pra
    // foto e preview aparecerem na tela pequena.
    let secaoAberta = false;
    try {
      secaoAberta = localStorage.getItem(CHAVE_SECAO_GRUPOS) === "1";
    } catch { /* storage indisponivel */ }

    if (regiao) {
      setGruposSelecionados(grupos.filter((g) => g.region === regiao).map((g) => g.groupId));
      const next = new Set([regiao]);
      if (secaoAberta) next.add("__groups_section");
      setRegioesAbertas(next);
    } else {
      setGruposSelecionados([]);
      const next = new Set<string>();
      if (secaoAberta) next.add("__groups_section");
      setRegioesAbertas(next);
    }
  }, [veiculo?.id, veiculo?.state, veiculo?.sourceGroup?.region, grupos]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Abre e fecha a secao de grupos, lembrando a escolha entre sessoes. */
  const alternarSecaoGrupos = useCallback(() => {
    setRegioesAbertas((prev) => {
      const n = new Set(prev);
      if (n.has("__groups_section")) n.delete("__groups_section");
      else n.add("__groups_section");
      try {
        localStorage.setItem(CHAVE_SECAO_GRUPOS, n.has("__groups_section") ? "1" : "0");
      } catch { /* storage indisponivel */ }
      return n;
    });
  }, [setRegioesAbertas]);

  const abrirParaPublicar = useCallback(async (v: Vehicle, abaInicial: "photo" | "edit" = "photo") => {
    setModoReenvio(false);
    setVeiculo(v);
    setFotosEditadas({});
    setAba(abaInicial);
    setGruposSelecionados([]);
    carregarGrupos();

    let m = 10;
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        m = data.profit_margin_percent ? parseFloat(data.profit_margin_percent) : 10;
      }
    } catch { /* mantem o padrao 10 */ }
    setMargem(m);

    // O salvo vale, com o titulo no padrao atual se ninguem editou.
    setTexto(anuncioParaExibir(v) ?? textoDoAnuncio(v, m));
  }, [carregarGrupos, setGruposSelecionados]);

  const abrirParaReenviar = useCallback(async (v: Vehicle) => {
    setModoReenvio(true);
    setVeiculo(v);
    setFotosEditadas({});
    setAba("edit");
    setTexto(v.formattedAd || "");
    // Reenvio herda a margem que ja foi praticada na primeira publicacao.
    setMargem(
      v.sellingPrice && v.price ? Math.round(((v.sellingPrice / v.price) - 1) * 100) : 10
    );
    setGruposSelecionados([]);
    carregarGrupos();
  }, [carregarGrupos, setGruposSelecionados]);

  /** Mexer na margem regera o texto inteiro -- ajuste a margem ANTES de editar. */
  const mudarMargem = useCallback((nova: number) => {
    setMargem(nova);
    if (veiculo) setTexto(textoDoAnuncio(veiculo, nova));
  }, [veiculo]);

  const regerarComIa = useCallback(async () => {
    if (!veiculo) return;
    setRegerando(true);
    try {
      const res = await fetch(`/api/vehicles/${veiculo.id}/regenerate-ad`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ margin: margem, save: true }),
      });
      const data = await res.json();
      if (res.ok && data.formattedAd) {
        setTexto(data.formattedAd);
        if (data.modelChanged || data.dataChanged) {
          setVeiculo((prev) => prev ? {
            ...prev,
            ...(data.modelChanged ? { model: data.model, brand: data.brand } : {}),
            ...(data.dataChanged ? { km: data.km, year: data.year, fipePrice: data.fipePrice } : {}),
            formattedAd: data.formattedAd,
          } : prev);
          const msgs: string[] = [];
          if (data.modelChanged) msgs.push(`Modelo: ${data.model}`);
          if (data.dataChanged) msgs.push("dados corrigidos");
          toast.success(msgs.join(" · "), { duration: 5000 });
        } else {
          toast.success("Texto regerado com IA");
        }
        buscar();
      } else {
        toast.error(data.error || "Erro ao regerar");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setRegerando(false);
    }
  }, [veiculo, margem, buscar]);

  /** Mistura as fotos editadas com as originais que o operador nao tocou. */
  const fotosFinais = useCallback((v: Vehicle): string[] | undefined => {
    if (Object.keys(fotosEditadas).length === 0) return undefined;
    return parseArray(v.photos).map((p, i) => fotosEditadas[i] || p);
  }, [fotosEditadas]);

  const limpar = useCallback(() => {
    setVeiculo(null);
    setTexto("");
    setFotosEditadas({});
  }, []);

  /** Guarda texto, fotos e grupos pra publicar depois, em massa por estado. */
  const salvarComoPronto = useCallback(async () => {
    if (!veiculo) return;
    if (gruposSelecionados.length === 0) {
      toast.error("Selecione pelo menos um grupo destino antes de preparar");
      return;
    }
    const id = veiculo.id;
    const precoVenda = veiculo.price * (1 + margem / 100);
    const fotos = fotosFinais(veiculo);

    removerDaLista(id);
    limpar();
    toast.loading("Salvando como pronto...", { id: `prepare-${id}` });

    try {
      const res = await fetch(`/api/vehicles/${id}/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formattedAd: texto,
          sellingPrice: precoVenda,
          targetGroupIds: gruposSelecionados,
          ...(fotos ? { photos: fotos } : {}),
        }),
      });
      if (res.ok) {
        toast.success(`Pronto pra postar depois (${gruposSelecionados.length} grupos)`, {
          id: `prepare-${id}`,
          duration: 5000,
        });
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Erro ao preparar", { id: `prepare-${id}` });
        buscar();
      }
    } catch (e) {
      toast.error(`Erro: ${e instanceof Error ? e.message : String(e)}`, { id: `prepare-${id}` });
      buscar();
    }
  }, [veiculo, gruposSelecionados, margem, texto, fotosFinais, removerDaLista, limpar, buscar]);

  const publicar = useCallback(async () => {
    if (!veiculo) return;
    if (gruposSelecionados.length === 0) {
      toast.error("Selecione pelo menos um grupo destino");
      return;
    }

    // Guarda tudo que importa antes de fechar o modal.
    const id = veiculo.id;
    const status = veiculo.status;
    const precoVenda = veiculo.price * (1 + margem / 100);
    const fotos = fotosFinais(veiculo);

    const corpoPut: Record<string, unknown> = { formattedAd: texto, sellingPrice: precoVenda };
    if (fotos) corpoPut.photos = fotos;

    let endpoint: string;
    if (modoReenvio) {
      endpoint = `/api/vehicles/${id}/republish`;
    } else if (status === "PENDING") {
      endpoint = `/api/vehicles/${id}/publish-direct`;
    } else {
      endpoint = `/api/vehicles/${id}/publish`;
    }

    // Fecha o modal e some da lista na hora; as duas requisicoes correm atras.
    if (!modoReenvio) removerDaLista(id);
    limpar();
    toast.loading("Publicando...", { id: `publish-${id}` });

    // O PUT virou redundante -- o endpoint de publicar ja persiste as fotos de
    // forma sincrona antes de enfileirar. Fica por compatibilidade.
    void fetch(`/api/vehicles/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpoPut),
    }).catch(() => null);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetGroupIds: gruposSelecionados,
          formattedAd: texto,
          sellingPrice: precoVenda,
          ...(fotos ? { photos: fotos } : {}),
        }),
      });
      if (res.ok) {
        toast.success(modoReenvio ? "Reenvio iniciado!" : "Publicação iniciada!", { id: `publish-${id}` });
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Erro ao publicar", { id: `publish-${id}` });
        // So reconsulta no erro, pra o carro reaparecer com o estado certo.
        buscar();
      }
    } catch {
      toast.error("Erro de conexão", { id: `publish-${id}` });
      buscar();
    }
  }, [veiculo, gruposSelecionados, margem, texto, modoReenvio, fotosFinais, removerDaLista, limpar, buscar]);

  /** Fechar sem publicar nao perde a edicao: salva texto e fotos antes de sair. */
  const fechar = useCallback(async () => {
    if (!veiculo) return;
    const mudouTexto = !!texto && texto !== (veiculo.formattedAd || "");
    const mudouFoto = Object.keys(fotosEditadas).length > 0;
    if (mudouTexto || mudouFoto) {
      try {
        const corpo: Record<string, unknown> = {};
        if (mudouTexto) corpo.formattedAd = texto;
        if (mudouFoto) corpo.photos = fotosFinais(veiculo);
        await fetch(`/api/vehicles/${veiculo.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        });
        toast.success("Edições salvas");
      } catch {
        toast.error("Erro ao salvar edições");
      }
    }
    limpar();
  }, [veiculo, texto, fotosEditadas, fotosFinais, limpar]);

  /** Marca a foto editada; passar `undefined` desfaz a edicao daquela posicao. */
  const editarFoto = useCallback((indice: number, dataUrl?: string) => {
    setFotosEditadas((prev) => {
      if (dataUrl === undefined) {
        const next = { ...prev };
        delete next[indice];
        return next;
      }
      return { ...prev, [indice]: dataUrl };
    });
  }, []);

  return {
    veiculo, setVeiculo,
    modoReenvio,
    texto, setTexto,
    regerando,
    aba, setAba,
    editorTelaCheia, setEditorTelaCheia,
    fotosEditadas, editarFoto,
    modoPreview, setModoPreview,
    margem, mudarMargem,
    abrirParaPublicar, abrirParaReenviar,
    regerarComIa, salvarComoPronto, publicar, fechar,
    alternarSecaoGrupos,
  };
}

export type Publicacao = ReturnType<typeof usePublicacao>;
