// ---------------------------------------------------------------------------
// De que tipo e a origem: grupo, comunidade, canal, lista ou contato.
//
// UMA regra, usada pela tela de Grupos e pelo card da triagem. Eram duas, e
// discordavam: o card chamava de "Canal" todo grupo restrito a admins
// (`isAnnounce`), enquanto a aba Canais so contava `@newsletter`. O cliente viu
// um carro com "Canal: REPASSEI VEICULOS #57" e a aba Canais zerada no mesmo
// dia, e concluiu que a captura de canal nao funcionava.
//
// Grupo `@g.us` restrito a admins e GRUPO. Canal e `@newsletter`.
// ---------------------------------------------------------------------------

export type TipoDeOrigem = "grupo" | "comunidade" | "canal" | "lista" | "contato";

export interface OrigemBruta {
  groupId: string;
  isCommunity?: boolean | null;
  isContact?: boolean | null;
  /** Escolha manual do operador; vence a leitura automatica. */
  kindOverride?: string | null;
}

export function tipoDaOrigem(g: OrigemBruta): TipoDeOrigem {
  if (g.kindOverride) return g.kindOverride as TipoDeOrigem;
  if (g.isContact || g.groupId.endsWith("@s.whatsapp.net")) return "contato";
  if (g.groupId.endsWith("@newsletter")) return "canal";
  if (g.groupId.endsWith("@broadcast")) return "lista";
  if (g.isCommunity) return "comunidade";
  return "grupo";
}

/** Como o tipo aparece no card do carro. */
export const ROTULO_DA_ORIGEM: Record<TipoDeOrigem, string> = {
  grupo: "Grupo",
  comunidade: "Comunidade",
  canal: "Canal",
  lista: "Lista de transmissão",
  contato: "Contato",
};
