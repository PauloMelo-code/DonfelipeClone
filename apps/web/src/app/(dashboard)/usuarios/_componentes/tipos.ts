// ---------------------------------------------------------------------------
// O vocabulario da tela de usuarios.
//
// Sao as pessoas que entram no sistema. Cada uma tem um papel, que decide o
// que pode fazer, e uma chave de ligar/desligar -- ninguem e apagado, porque a
// trilha de auditoria aponta pra quem executou cada acao.
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
  _count: { auditLogs: number };
}

export type Papel = "ADMIN" | "OPERATOR";

export type FiltroDeStatus = "all" | "active" | "inactive";

export const PAGE_SIZE = 15;

export const FILTROS: { id: FiltroDeStatus; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "active", label: "Ativos" },
  { id: "inactive", label: "Inativos" },
];

export const PAPEIS: Papel[] = ["OPERATOR", "ADMIN"];

export const rotuloDoPapel = (papel: string) => (papel === "ADMIN" ? "Admin" : "Operador");

export const CORES_DO_PAPEL: Record<string, string> = {
  ADMIN: "bg-brand-gold/10 text-brand-gold border-brand-gold/20",
  OPERATOR: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

export const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

/**
 * A ordem da lista: ativos sempre no topo, depois por nome.
 *
 * Quem esta ativo e quem opera o sistema hoje; inativo e historico que so
 * continua ali porque a auditoria aponta pra ele. Por isso a lista nao ordena
 * so alfabeticamente.
 *
 * A busca varre nome e email, porque e por um dos dois que se procura alguem.
 */
export function ordenarEFiltrar(
  usuarios: User[],
  busca: string,
  status: FiltroDeStatus,
): User[] {
  const termo = busca.trim().toLowerCase();
  return usuarios
    .filter((u) => {
      if (status === "active" && !u.active) return false;
      if (status === "inactive" && u.active) return false;
      if (!termo) return true;
      return u.name.toLowerCase().includes(termo) || u.email.toLowerCase().includes(termo);
    })
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      // Colacao pt-BR pra acento nao jogar o nome pro fim da lista.
      return a.name.localeCompare(b.name, "pt-BR");
    });
}
