import { Building2, Megaphone, Radio, User, Users, type LucideIcon } from "lucide-react";
import { ROTULO_DA_ORIGEM, tipoDaOrigem, type TipoDeOrigem } from "@/lib/tipo-de-origem";
import type { SwipeVehicle } from "./tipos";

// ---------------------------------------------------------------------------
// De onde o carro veio.
//
// A regra do tipo e a MESMA da tela de Grupos (lib/tipo-de-origem): grupo
// restrito a admins e Grupo, canal e `@newsletter`. Eram duas leituras
// diferentes, e o card dizia "Canal" num grupo que a aba Canais nem contava.
// ---------------------------------------------------------------------------

type GrupoDeOrigem = NonNullable<SwipeVehicle["sourceGroup"]>;

export interface Origem {
  rotulo: string;
  icone: LucideIcon;
  /** Nome do grupo; caindo pro telefone do dono e depois pro JID sem sufixo. */
  nome: string;
}

const ICONE: Record<TipoDeOrigem, LucideIcon> = {
  grupo: Users,
  comunidade: Building2,
  canal: Radio,
  lista: Megaphone,
  contato: User,
};

export function lerOrigem(sg: GrupoDeOrigem): Origem {
  const tipo = tipoDaOrigem(sg);
  // Lista de transmissao costuma chegar sem nome; o numero do dono identifica.
  const nome = sg.name || (sg.ownerPhone ? `+${sg.ownerPhone}` : sg.groupId.replace(/@.*/, ""));
  return { rotulo: ROTULO_DA_ORIGEM[tipo], icone: ICONE[tipo], nome };
}

/**
 * O estado do veiculo e de onde ele saiu.
 *
 * O que a IA extraiu do anuncio vale mais que a regiao marcada no grupo. Quando
 * o valor vem do grupo, a tela avisa -- e um palpite, nao um dado do anuncio.
 */
export function lerEstado(
  // So os dois campos que ela le -- assim a grade de cards chama a MESMA
  // leitura, sem precisar ser um SwipeVehicle.
  v: { state?: string | null; sourceGroup?: { region?: string | null } | null }
): { uf: string | null; veioDoGrupo: boolean } {
  if (v.state) return { uf: v.state, veioDoGrupo: false };
  const doGrupo = v.sourceGroup?.region;
  return doGrupo ? { uf: doGrupo, veioDoGrupo: true } : { uf: null, veioDoGrupo: false };
}
