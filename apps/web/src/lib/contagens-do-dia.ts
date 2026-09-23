import { and, countDistinct, eq, gte, isNull, count } from "drizzle-orm";
import { db, veiculos, historicoPublicacao, vivos, vivosE } from "@/lib/db";
import { inicioDoDia } from "@/lib/dia";

// ---------------------------------------------------------------------------
// "Capturas hoje" e "Publicacoes hoje" do Dashboard.
//
// Os dois numeros vinham errados (cliente, 22/09/2026), cada um por um motivo:
//
//   - o corte do dia saia do fuso do processo, e o container roda em UTC: o
//     "hoje" comecava as 21h do dia anterior (ver lib/dia.ts);
//   - "Capturas" contava tambem o que a triagem automatica rejeitou, que o
//     operador nunca chega a ver na tela;
//   - "Publicacoes" contava LINHAS do historico, e o historico tem uma linha
//     por grupo de destino: um anuncio enviado a cinco grupos valia cinco.
//
// Ficam aqui, fora da rota, porque e conta de negocio e tem teste proprio.
// ---------------------------------------------------------------------------

export interface ContagensDoDia {
  capturas: number;
  publicacoes: number;
}

export async function contagensDoDia(inicio: Date = inicioDoDia()): Promise<ContagensDoDia> {
  const [capturas, publicacoes] = await Promise.all([
    db
      .select({ n: count() })
      .from(veiculos)
      .where(and(vivos(veiculos), gte(veiculos.capturedAt, inicio), isNull(veiculos.autoRejectedReason)))
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select({ n: countDistinct(historicoPublicacao.vehicleId) })
      .from(historicoPublicacao)
      .where(
        vivosE(historicoPublicacao, eq(historicoPublicacao.success, true), gte(historicoPublicacao.postedAt, inicio))
      )
      .then((r) => Number(r[0]?.n ?? 0)),
  ]);
  return { capturas, publicacoes };
}
