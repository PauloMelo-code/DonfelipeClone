// ---------------------------------------------------------------------------
// O vocabulario da tela de grupos.
//
// "Grupo" aqui e qualquer destino do WhatsApp: grupo mesmo, comunidade, canal,
// lista de transmissao ou conversa com uma pessoa so. O que separa um do outro
// e o sufixo do JID -- e o operador pode discordar da leitura automatica.
// ---------------------------------------------------------------------------

export interface Group {
  id: string;
  groupId: string;
  name: string;
  nameLocked?: boolean;
  role: string;
  active: boolean;
  filters: string | null;
  region: string | null;
  isCommunity?: boolean;
  isAnnounce?: boolean;
  isContact?: boolean;
  kindOverride?: string | null;
  ownerPhone?: string | null;
}

export interface PaginatedResponse {
  groups: Group[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export type TypeStats = {
  todos: number;
  grupo: number;
  canal: number;
  comunidade: number;
  lista: number;
  contato: number;
};

export type Papel = "SOURCE" | "TARGET";

export const REGIONS = ["SC", "RS", "PR", "SP", "Nacional"] as const;

export const PAGE_SIZE = 20;

/** Os tipos que o filtro oferece, na ordem em que aparecem na tela. */
export const TIPOS = [
  { id: "todos", label: "Todos", key: "todos" as const },
  { id: "grupo", label: "👥 Grupos", key: "grupo" as const },
  { id: "comunidade", label: "🏘️ Comunidades", key: "comunidade" as const },
  { id: "canal", label: "📡 Canais", key: "canal" as const },
  { id: "lista", label: "📢 Listas", key: "lista" as const },
  { id: "contato", label: "👤 Contatos", key: "contato" as const },
];

/** As opcoes do menu de reclassificacao manual. */
export const TIPOS_RECLASSIFICAVEIS = [
  { id: "grupo", label: "👥 Grupo" },
  { id: "canal", label: "📡 Canal" },
  { id: "comunidade", label: "🏘️ Comunidade" },
  { id: "lista", label: "📢 Lista" },
  { id: "contato", label: "👤 Contato" },
];

/**
 * De que tipo e este destino.
 *
 * A escolha manual do operador (`kindOverride`) vence a leitura automatica --
 * assim da pra mover um contato pra "lista" sem mexer no JID real. Sem
 * override, o sufixo do JID decide. Cuidado com um caso que ja confundiu o
 * sistema: grupo `@g.us` restrito a admins continua sendo GRUPO, nao canal.
 */
export function tipoDoGrupo(g: Group): string {
  if (g.kindOverride) return g.kindOverride;
  if (g.isContact || g.groupId.endsWith("@s.whatsapp.net")) return "contato";
  if (g.groupId.endsWith("@newsletter")) return "canal";
  if (g.groupId.endsWith("@broadcast")) return "lista";
  if (g.isCommunity) return "comunidade";
  return "grupo";
}

export function iconeDoTipo(tipo: string): string {
  switch (tipo) {
    case "canal": return "📡";
    case "comunidade": return "🏘️";
    case "lista": return "📢";
    case "contato": return "👤";
    default: return "👥";
  }
}
