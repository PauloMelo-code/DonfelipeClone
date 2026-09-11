import { and, eq } from "drizzle-orm";
import { db, configuracoes, vivos } from "@/lib/db";

// ---------------------------------------------------------------------------
// Leitura de configuracao — uma implementacao.
//
// O webhook repetia o mesmo findUnique cinco vezes e o publisher tinha a
// propria copia. Cada copia era um lugar a mais para esquecer o filtro de
// registros excluidos.
// ---------------------------------------------------------------------------

export async function lerConfiguracao(chave: string): Promise<string | null> {
  const [linha] = await db
    .select({ value: configuracoes.value })
    .from(configuracoes)
    .where(and(eq(configuracoes.key, chave), vivos(configuracoes)))
    .limit(1);
  return linha?.value ?? null;
}

/** Le a configuracao como numero. Valor ausente ou invalido devolve o padrao. */
export async function lerConfiguracaoNumero(chave: string, padrao: number): Promise<number> {
  const bruto = await lerConfiguracao(chave);
  if (bruto === null) return padrao;
  const n = Number(bruto);
  return Number.isNaN(n) ? padrao : n;
}
