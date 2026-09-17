// ---------------------------------------------------------------------------
// O vocabulario da tela de grupos.
//
// "Grupo" aqui e qualquer destino do WhatsApp: grupo mesmo, comunidade, canal,
// lista de transmissao ou conversa com uma pessoa so. O que separa um do outro
// e o sufixo do JID -- e o operador pode discordar da leitura automatica.
// ---------------------------------------------------------------------------

import { Building2, Megaphone, Radio, User, Users, type LucideIcon } from "lucide-react";
import { tipoDaOrigem } from "@/lib/tipo-de-origem";

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
export const TIPOS: { id: string; label: string; key: keyof TypeStats; icone: LucideIcon | null }[] = [
  { id: "todos", label: "Todos", key: "todos", icone: null },
  { id: "grupo", label: "Grupos", key: "grupo", icone: Users },
  { id: "comunidade", label: "Comunidades", key: "comunidade", icone: Building2 },
  { id: "canal", label: "Canais", key: "canal", icone: Radio },
  { id: "lista", label: "Listas", key: "lista", icone: Megaphone },
  { id: "contato", label: "Contatos", key: "contato", icone: User },
];

/** As opcoes do menu de reclassificacao manual. */
export const TIPOS_RECLASSIFICAVEIS: { id: string; label: string; icone: LucideIcon }[] = [
  { id: "grupo", label: "Grupo", icone: Users },
  { id: "canal", label: "Canal", icone: Radio },
  { id: "comunidade", label: "Comunidade", icone: Building2 },
  { id: "lista", label: "Lista", icone: Megaphone },
  { id: "contato", label: "Contato", icone: User },
];

/** De que tipo e este destino. A regra mora em lib/tipo-de-origem. */
export const tipoDoGrupo = (g: Group): string => tipoDaOrigem(g);

/** O icone do tipo. Devolve o componente, nao um glifo -- quem renderiza
 *  escolhe o tamanho e a cor. */
export function iconeDoTipo(tipo: string): LucideIcon {
  switch (tipo) {
    case "canal": return Radio;
    case "comunidade": return Building2;
    case "lista": return Megaphone;
    case "contato": return User;
    default: return Users;
  }
}
