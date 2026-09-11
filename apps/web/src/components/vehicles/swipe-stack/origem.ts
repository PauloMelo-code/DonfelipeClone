import { Building2, Megaphone, Radio, User, Users, type LucideIcon } from "lucide-react";
import type { SwipeVehicle } from "./tipos";

// ---------------------------------------------------------------------------
// De onde o carro veio.
//
// ATENCAO: esta leitura NAO e a mesma da tela de grupos
// (`app/(dashboard)/grupos/_componentes/tipos.ts`). Aqui um grupo com
// `isAnnounce` conta como Canal; la, um `@g.us` restrito a admins continua
// sendo Grupo. Alem disso, la o operador pode forcar o tipo na mao
// (`kindOverride`) e aqui esse ajuste e ignorado.
//
// O resultado pratico e que o mesmo grupo pode aparecer com nomes diferentes
// nas duas telas. Foi preservado como estava: unificar muda o que o operador
// ve na triagem, e isso e decisao de produto, nao de refatoracao.
// ---------------------------------------------------------------------------

type GrupoDeOrigem = NonNullable<SwipeVehicle["sourceGroup"]>;

export interface Origem {
  rotulo: string;
  icone: LucideIcon;
  /** Nome do grupo; caindo pro telefone do dono e depois pro JID sem sufixo. */
  nome: string;
}

export function lerOrigem(sg: GrupoDeOrigem): Origem {
  const jid = sg.groupId || "";

  const { rotulo, icone } =
    sg.isAnnounce || jid.endsWith("@newsletter") ? { rotulo: "Canal", icone: Radio }
    : sg.isCommunity                             ? { rotulo: "Comunidade", icone: Building2 }
    : jid.endsWith("@broadcast")                 ? { rotulo: "Lista de transmissão", icone: Megaphone }
    : jid.endsWith("@s.whatsapp.net")            ? { rotulo: "Contato", icone: User }
    :                                              { rotulo: "Grupo", icone: Users };

  // Lista de transmissao costuma chegar sem nome; o numero do dono identifica.
  const nome = sg.name || (sg.ownerPhone ? `+${sg.ownerPhone}` : jid.replace(/@.*/, ""));

  return { rotulo, icone, nome };
}

/**
 * O estado do veiculo e de onde ele saiu.
 *
 * O que a IA extraiu do anuncio vale mais que a regiao marcada no grupo. Quando
 * o valor vem do grupo, a tela avisa -- e um palpite, nao um dado do anuncio.
 */
export function lerEstado(v: SwipeVehicle): { uf: string | null; veioDoGrupo: boolean } {
  if (v.state) return { uf: v.state, veioDoGrupo: false };
  const doGrupo = v.sourceGroup?.region;
  return doGrupo ? { uf: doGrupo, veioDoGrupo: true } : { uf: null, veioDoGrupo: false };
}
