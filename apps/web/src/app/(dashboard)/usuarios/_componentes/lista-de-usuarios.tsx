"use client";

import { AnimatePresence, motion } from "framer-motion";
import { StatusBadge } from "@/components/ui/status-badge";
import { AcoesDoUsuario, SeloDePapel } from "./linha-de-usuario";
import { Paginacao } from "./paginacao";
import { formatDate, type User } from "./tipos";
import type { Usuarios } from "../_ganchos/use-usuarios";

// ---------------------------------------------------------------------------
// A lista, em duas formas.
//
// No celular cada usuario e um card; no desktop, uma linha de tabela com as
// colunas extras que so cabem numa tela larga (quantas acoes a pessoa ja fez e
// desde quando ela existe). Sao layouts diferentes de proposito, mas o selo do
// papel e os botoes sao os mesmos.
// ---------------------------------------------------------------------------

const CABECALHOS = ["Usuário", "Role", "Status", "Ações", "Criado em"];
const TH = "px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50";

/** Entrada escalonada: cada linha aparece um pouco depois da anterior. */
const entrada = (i: number) => ({
  initial: { opacity: 0, y: 5 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: i * 0.03 },
});

interface Props {
  lista: Usuarios;
  aoEditar: (u: User) => void;
}

export function ListaDeUsuarios({ lista, aoEditar }: Props) {
  const { naPagina, alternarAtivo } = lista;

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="md:hidden divide-y divide-white/[0.04]">
        <AnimatePresence>
          {naPagina.map((user, i) => (
            <motion.div key={user.id} {...entrada(i)} className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gold/[0.08] text-[13px] font-semibold text-brand-gold">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <SeloDePapel papel={user.role} compacto />
                  <StatusBadge kind={user.active ? "active" : "inactive"} size="xs" />
                </div>
              </div>
              <AcoesDoUsuario user={user} aoEditar={aoEditar} aoAlternar={alternarAtivo} compacto />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.04] text-left">
              {CABECALHOS.map((c) => <th key={c} className={TH}>{c}</th>)}
              <th className="px-5 py-3.5 w-20" />
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {naPagina.map((user, i) => (
                <motion.tr
                  key={user.id}
                  {...entrada(i)}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors duration-200"
                >
                  <td className="px-5 py-3.5">
                    <div>
                      <p className="font-medium text-foreground">{user.name}</p>
                      <p className="text-[11px] text-muted-foreground">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3.5"><SeloDePapel papel={user.role} /></td>
                  <td className="px-5 py-3.5"><StatusBadge kind={user.active ? "active" : "inactive"} /></td>
                  <td className="px-5 py-3.5 text-muted-foreground">{user._count.auditLogs} ações</td>
                  <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">{formatDate(user.createdAt)}</td>
                  <td className="px-5 py-3.5">
                    <AcoesDoUsuario user={user} aoEditar={aoEditar} aoAlternar={alternarAtivo} />
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      <Paginacao lista={lista} />
    </div>
  );
}
