import { inArray } from "drizzle-orm";
import { db, configuracoes, vivosE } from "@/lib/db";
import { CHAVE_DO_CRITERIO, CRITERIOS_PADRAO, criteriosDoScore, type CriteriosDoScore } from "@/lib/quality-score";

// ---------------------------------------------------------------------------
// As referencias da nota do carro, lidas das configuracoes.
//
// A conta da nota mora em `quality-score.ts`, que e puro -- a tela tambem o
// usa. Este arquivo e so a parte que fala com o banco, numa consulta so.
// ---------------------------------------------------------------------------

const CHAVES = Object.values(CHAVE_DO_CRITERIO);

export async function lerCriteriosDoScore(): Promise<CriteriosDoScore> {
  try {
    const linhas = await db
      .select({ key: configuracoes.key, value: configuracoes.value })
      .from(configuracoes)
      .where(vivosE(configuracoes, inArray(configuracoes.key, CHAVES)));
    return criteriosDoScore(Object.fromEntries(linhas.map((l) => [l.key, l.value])));
  } catch (erro) {
    // Nota errada e melhor que captura perdida: sem as configuracoes, vale o padrao.
    console.error("[score] nao consegui ler os criterios, usando o padrao:", erro);
    return CRITERIOS_PADRAO;
  }
}
