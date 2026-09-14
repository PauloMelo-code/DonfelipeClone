"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  PAGE_SIZE, ordenarEFiltrar,
  type FiltroDeStatus, type User,
} from "../_componentes/tipos";

// ---------------------------------------------------------------------------
// A lista de usuarios: busca, filtro, ordem e pagina.
//
// Tudo acontece no cliente porque a base de operadores e pequena -- sao as
// pessoas da empresa, nao os carros. Uma consulta so traz todos, e filtrar
// deixa de custar ida ao servidor.
// ---------------------------------------------------------------------------

export function useUsuarios() {
  const [usuarios, setUsuarios] = useState<User[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<FiltroDeStatus>("all");
  const [pagina, setPagina] = useState(1);

  const buscar = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) setUsuarios(await res.json());
    } catch {
      // ignore
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { buscar(); }, [buscar]);

  useEffect(() => { setPagina(1); }, [busca, status]);

  const filtrados = useMemo(
    () => ordenarEFiltrar(usuarios, busca, status),
    [usuarios, busca, status],
  );

  const totalDePaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  // Filtrar pode encurtar a lista abaixo da pagina em que o operador estava.
  const paginaAtual = Math.min(pagina, totalDePaginas);

  const naPagina = useMemo(
    () => filtrados.slice((paginaAtual - 1) * PAGE_SIZE, paginaAtual * PAGE_SIZE),
    [filtrados, paginaAtual],
  );

  const ativos = useMemo(() => usuarios.filter((u) => u.active).length, [usuarios]);

  /** Liga e desliga o acesso. Ninguem e apagado: a auditoria aponta pra ele. */
  const alternarAtivo = useCallback(async (user: User) => {
    // A API exige justificativa para mudar o acesso de alguem -- vai para a
    // trilha de auditoria. Sem ela este botao devolvia 400 toda vez.
    const motivo = window.prompt(
      `Motivo para ${user.active ? "desativar" : "reativar"} o acesso de ${user.name} ` +
        "(mínimo 8 caracteres, fica registrado na auditoria):"
    );
    if (motivo === null) return; // cancelou

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !user.active, motivo }),
      });
      if (res.ok) {
        toast.success(user.active ? "Usuário desativado" : "Usuário ativado");
        buscar();
      } else {
        const err = await res.json();
        toast.error(err.error || "Erro ao alterar status");
      }
    } catch {
      toast.error("Erro de conexão");
    }
  }, [buscar]);

  return {
    usuarios, carregando, buscar,
    busca, setBusca,
    status, setStatus,
    filtrados, naPagina,
    pagina: paginaAtual, setPagina, totalDePaginas,
    ativos, inativos: usuarios.length - ativos,
    alternarAtivo,
  };
}

export type Usuarios = ReturnType<typeof useUsuarios>;
