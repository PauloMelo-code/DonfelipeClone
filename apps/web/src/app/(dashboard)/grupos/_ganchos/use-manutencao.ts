"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { Group, Papel } from "../_componentes/tipos";

// ---------------------------------------------------------------------------
// As operacoes de manutencao da lista inteira, nao de um grupo so.
//
// Sincronizar com a UAZAPI, ligar ou desligar tudo de um papel, conferir se a
// instancia de envio realmente participa de cada destino, varrer os orfaos,
// resolver nomes que ficaram so com o JID e cadastrar um numero na mao.
//
// Sao acoes caras e algumas destrutivas, por isso vivem separadas do que o
// operador faz clicando num card.
// ---------------------------------------------------------------------------

export interface RelatorioDeAcesso {
  usingSeparateInstance: boolean;
  sendInstanceLabel: string;
  sendInstanceTotalGroups: number;
  totalTargetGroups: number;
  problemCount: number;
  groups: Array<{
    id: string;
    groupId: string;
    name: string;
    region: string | null;
    problem: string | null;
    inSendInstance: boolean;
    isDM: boolean;
  }>;
}

export interface Formulario {
  phone: string;
  name: string;
  role: Papel;
  kind: "individual" | "broadcast";
}

const FORMULARIO_VAZIO: Formulario = { phone: "", name: "", role: "SOURCE", kind: "individual" };

export function useManutencao(buscar: () => void) {
  const [sincronizando, setSincronizando] = useState(false);
  const [modalSync, setModalSync] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioDeAcesso | null>(null);
  const [modalAcesso, setModalAcesso] = useState(false);
  const [limpandoOrfaos, setLimpandoOrfaos] = useState(false);
  const [reparando, setReparando] = useState(false);
  const [modalAdicionar, setModalAdicionar] = useState(false);
  const [formulario, setFormulario] = useState<Formulario>(FORMULARIO_VAZIO);
  const [adicionando, setAdicionando] = useState(false);

  const ROTULOS: Record<string, string> = {
    capture: "fonte (captura)",
    send: "destino (envio)",
    both: "ambas instâncias",
  };

  const sincronizar = useCallback(async (instancia: "capture" | "send" | "both") => {
    setSincronizando(true);
    setModalSync(false);
    try {
      // POST porque a rota ESCREVE: ela insere e atualiza grupos.
      const res = await fetch(`/api/groups/sync?instance=${instancia}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        toast.success(`${data.synced} grupos sincronizados de ${ROTULOS[instancia]}`);
        buscar();
      } else {
        toast.error("Erro ao sincronizar");
      }
    } catch {
      toast.error("Erro ao sincronizar");
    } finally {
      setSincronizando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscar]);

  /**
   * Liga ou desliga todos os grupos de um papel.
   *
   * Busca a lista sem paginacao de proposito: o operador espera que "ativar
   * todos" valha pra base inteira, nao so pra pagina que esta vendo.
   */
  const ligarTodos = useCallback(async (papel: Papel, ativo: boolean) => {
    let alvos: Group[] = [];
    try {
      const res = await fetch(`/api/groups?${new URLSearchParams({ role: papel, counts: "false" })}`);
      if (res.ok) {
        const todos: Group[] = await res.json();
        alvos = todos.filter((g) => g.active !== ativo);
      }
    } catch {
      toast.error("Erro ao carregar grupos");
      return;
    }
    if (alvos.length === 0) return;

    try {
      await Promise.all(
        alvos.map((g) =>
          fetch(`/api/groups/${g.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: ativo }),
          })
        )
      );
      toast.success(`${alvos.length} grupos ${ativo ? "ativados" : "desativados"}`);
      buscar();
    } catch {
      toast.error("Erro ao atualizar grupos");
    }
  }, [buscar]);

  /** Confere se o numero que publica e mesmo membro de cada grupo destino. */
  const verificarAcesso = useCallback(async () => {
    setVerificando(true);
    try {
      const res = await fetch("/api/groups/verify-send-membership");
      if (res.ok) {
        setRelatorio(await res.json());
        setModalAcesso(true);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Erro ao verificar");
      }
    } catch (e) {
      toast.error(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setVerificando(false);
    }
  }, []);

  /**
   * Orfao e o grupo onde nenhuma instancia da UAZAPI participa mais.
   *
   * Em dois passos de proposito: o primeiro so desativa, o segundo apaga de
   * vez junto com o historico de publicacoes. Assim da pra conferir a lista
   * antes de perder dado.
   */
  const limparOrfaos = useCallback(async (apagar: boolean) => {
    if (apagar && !confirm("Apagar permanentemente os grupos órfãos (onde nenhuma instância UAZAPI participa)?\n\nIsso também limpa o histórico de publicações desses grupos.")) {
      return;
    }
    setLimpandoOrfaos(true);
    try {
      const res = await fetch(`/api/groups/cleanup-orphans${apagar ? "?delete=true" : ""}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao limpar órfãos");
      } else if (data.orphans === 0) {
        toast.success("Nenhum grupo órfão encontrado");
      } else {
        toast.success(
          apagar
            ? `${data.affected} grupos órfãos removidos do banco`
            : `${data.affected} grupos órfãos desativados — clique novamente em modo apagar pra remover de vez`,
          { duration: 10000 }
        );
        buscar();
      }
    } catch (e) {
      toast.error(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLimpandoOrfaos(false);
    }
  }, [buscar]);

  /** Resolve nomes que ficaram so com o JID. Grupos e contatos usam rotas diferentes. */
  const repararNomes = useCallback(async () => {
    setReparando(true);
    try {
      const [grupos, conversas] = await Promise.all([
        fetch("/api/groups/repair-names", { method: "POST" }).then((r) => r.json()).catch(() => null),
        fetch("/api/groups/resolve-names", { method: "POST" }).then((r) => r.json()).catch(() => null),
      ]);
      const deGrupos = grupos?.repaired || 0;
      const deConversas = conversas?.updated || 0;
      const total = deGrupos + deConversas;
      if (total > 0) {
        const partes: string[] = [];
        if (deGrupos > 0) partes.push(`${deGrupos} grupos`);
        if (deConversas > 0) partes.push(`${deConversas} contatos/listas`);
        toast.success(`${total} nomes resolvidos (${partes.join(" + ")})`, { duration: 6000 });
        buscar();
      } else {
        toast.success("Todos os nomes já estão resolvidos");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro de conexão");
    } finally {
      setReparando(false);
    }
  }, [buscar]);

  const fecharAdicionar = useCallback((aberto: boolean) => {
    setModalAdicionar(aberto);
    if (!aberto) setFormulario(FORMULARIO_VAZIO);
  }, []);

  /**
   * Cadastra um destino na mao.
   *
   * Se o operador colar um JID completo, vale como esta. Se digitar so os
   * digitos, o padrao e conversa direta (`@s.whatsapp.net`) -- montar um
   * `@broadcast` a partir de um telefone gera um JID que nao existe.
   */
  const adicionar = useCallback(async () => {
    const cru = formulario.phone.trim();
    const ehJid = ["@broadcast", "@g.us", "@newsletter", "@s.whatsapp.net"].some((s) => cru.endsWith(s));
    const telefone = ehJid ? cru : cru.replace(/\D/g, "");
    if (!telefone || telefone.length < 5 || !formulario.name.trim()) {
      toast.error("Preencha um número válido e nome");
      return;
    }
    const groupId = ehJid
      ? telefone
      : formulario.kind === "broadcast"
        ? `${telefone}@broadcast`
        : `${telefone}@s.whatsapp.net`;

    setAdicionando(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, name: formulario.name.trim(), role: formulario.role, active: true }),
      });
      if (res.ok) {
        toast.success("Grupo adicionado!");
        setModalAdicionar(false);
        setFormulario(FORMULARIO_VAZIO);
        buscar();
      } else {
        const err = await res.json();
        toast.error(err.error || "Erro ao adicionar");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setAdicionando(false);
    }
  }, [formulario, buscar]);

  return {
    sincronizando, modalSync, setModalSync, sincronizar,
    ligarTodos,
    verificando, relatorio, modalAcesso, setModalAcesso, verificarAcesso,
    limpandoOrfaos, limparOrfaos,
    reparando, repararNomes,
    modalAdicionar, fecharAdicionar, abrirAdicionar: () => setModalAdicionar(true),
    formulario, setFormulario, adicionando, adicionar,
  };
}

export type Manutencao = ReturnType<typeof useManutencao>;
