"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { estadoDoVeiculo, parseArray, type Vehicle, type WhatsAppGroup } from "../_componentes/tipos";

// ---------------------------------------------------------------------------
// "Publicar direto": o caminho curto da aba Pendentes.
//
// Texto e foto ja chegam editados do proprio card -- aqui o operador so
// confirma os grupos e vai. A selecao e propria, separada da do modal completo, porque os dois podem
// estar abertos em momentos diferentes sobre carros diferentes.
//
// As fotos vao explicitas no corpo da requisicao: se o operador editou alguma
// pelo card antes de clicar aqui, o PUT da edicao pode ainda estar em voo, e
// sem isso o servidor publicaria a foto antiga.
// ---------------------------------------------------------------------------

interface Opcoes {
  grupos: WhatsAppGroup[];
  carregarGrupos: () => Promise<WhatsAppGroup[]>;
  setRegioesAbertas: React.Dispatch<React.SetStateAction<Set<string>>>;
  removerDaLista: (id: string) => void;
  buscar: () => void;
}

export function usePublicacaoRapida({ grupos, carregarGrupos, setRegioesAbertas, removerDaLista, buscar }: Opcoes) {
  const [veiculo, setVeiculo] = useState<Vehicle | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [publicandoId, setPublicandoId] = useState<string | null>(null);

  const abrir = useCallback(async (v: Vehicle) => {
    const estado = estadoDoVeiculo(v);

    const preSelecionar = (lista: WhatsAppGroup[]) => {
      // Sem estado, marca TODOS os destinos -- e o mesmo que a rota faz quando
      // nao recebe grupo nenhum. Antes ficava zero marcado, o botao "Publicar
      // (0)" nascia desabilitado e o clique nao fazia nada, sem aviso. Isso
      // atingia anuncio de canal, que nasce sem regiao (o cliente, 22/09/2026).
      if (!estado) {
        setSelecionados(lista.map((g) => g.groupId));
        setRegioesAbertas((prev) => new Set([...prev, ...lista.map((g) => `__quick_${g.region || "Outros"}`)]));
        return;
      }
      setSelecionados(lista.filter((g) => g.region === estado).map((g) => g.groupId));
      setRegioesAbertas((prev) => new Set([...prev, `__quick_${estado}`]));
    };

    preSelecionar(grupos.length === 0 ? await carregarGrupos() : grupos);
    setVeiculo(v);
  }, [grupos, carregarGrupos, setRegioesAbertas]);

  const fechar = useCallback(() => {
    setVeiculo(null);
    setSelecionados([]);
  }, []);

  const confirmar = useCallback(async () => {
    if (!veiculo || selecionados.length === 0) return;
    const id = veiculo.id;
    setPublicandoId(id);
    try {
      const fotos = parseArray(veiculo.photos);
      const res = await fetch(`/api/vehicles/${id}/publish-direct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetGroupIds: selecionados,
          ...(fotos.length > 0 ? { photos: fotos } : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Publicado em ${data.destinationGroups || selecionados.length} grupos`);
        removerDaLista(id);
        fechar();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Erro ao publicar");
        buscar();
      }
    } catch {
      toast.error("Erro de conexão");
      buscar();
    } finally {
      setPublicandoId(null);
    }
  }, [veiculo, selecionados, removerDaLista, fechar, buscar]);

  return { veiculo, selecionados, setSelecionados, publicandoId, abrir, fechar, confirmar };
}

export type PublicacaoRapida = ReturnType<typeof usePublicacaoRapida>;
