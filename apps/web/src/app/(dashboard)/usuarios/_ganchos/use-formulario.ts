"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { Papel, User } from "../_componentes/tipos";

// ---------------------------------------------------------------------------
// O formulario de criar e editar usuario.
//
// Duas diferencas entre os dois modos, e as duas tem motivo:
//
//   - O email nao muda na edicao. Ele e a identidade de quem entra no sistema
//     e aparece na trilha de auditoria; trocar seria reescrever o passado.
//   - A senha e obrigatoria ao criar e opcional ao editar. Campo vazio na
//     edicao significa "mantenha a que esta", nao "apague a senha".
// ---------------------------------------------------------------------------

interface Campos {
  nome: string;
  email: string;
  senha: string;
  papel: Papel;
}

const VAZIO: Campos = { nome: "", email: "", senha: "", papel: "OPERATOR" };

export function useFormulario(aoSalvar: () => void) {
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<User | null>(null);
  const [campos, setCampos] = useState<Campos>(VAZIO);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const alterar = useCallback(<K extends keyof Campos>(chave: K, valor: Campos[K]) => {
    setCampos((c) => ({ ...c, [chave]: valor }));
  }, []);

  const abrirNovo = useCallback(() => {
    setEditando(null);
    setCampos(VAZIO);
    setMostrarSenha(false);
    setAberto(true);
  }, []);

  const abrirEdicao = useCallback((user: User) => {
    setEditando(user);
    // Senha em branco: o campo vazio significa "mantenha a atual".
    setCampos({ nome: user.name, email: user.email, senha: "", papel: user.role as Papel });
    setMostrarSenha(false);
    setAberto(true);
  }, []);

  const salvar = useCallback(async () => {
    if (!campos.nome.trim() || !campos.email.trim()) {
      toast.error("Nome e email são obrigatórios");
      return;
    }
    if (!editando && !campos.senha.trim()) {
      toast.error("Senha é obrigatória para novos usuários");
      return;
    }

    setSalvando(true);
    try {
      const [rota, metodo, corpo] = editando
        ? [
            `/api/users/${editando.id}`,
            "PUT",
            {
              name: campos.nome,
              role: campos.papel,
              // So manda a senha se o operador digitou uma nova.
              ...(campos.senha.trim() ? { password: campos.senha } : {}),
            },
          ]
        : [
            "/api/users",
            "POST",
            { name: campos.nome, email: campos.email, password: campos.senha, role: campos.papel },
          ];

      const res = await fetch(rota as string, {
        method: metodo as string,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });

      if (res.ok) {
        toast.success(editando ? "Usuário atualizado!" : "Usuário criado!");
        setAberto(false);
        aoSalvar();
      } else {
        const err = await res.json();
        toast.error(err.error || (editando ? "Erro ao atualizar" : "Erro ao criar usuário"));
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setSalvando(false);
    }
  }, [campos, editando, aoSalvar]);

  return {
    aberto, setAberto,
    editando, campos, alterar,
    mostrarSenha, setMostrarSenha,
    salvando, abrirNovo, abrirEdicao, salvar,
  };
}

export type Formulario = ReturnType<typeof useFormulario>;
