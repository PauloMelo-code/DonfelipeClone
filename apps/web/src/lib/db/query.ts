import { eq, and, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Soft delete e controle de colisao — os dois padroes que TODA rota usa.
//
// Estao aqui para que a regra tenha uma implementacao so. Copiar
// `eq(t.isDeleted, false)` a mao em 200 consultas garante que a proxima
// correcao chegue em 199.
// ---------------------------------------------------------------------------

/** Tabela que segue a regra da casa (tem as colunas de auditoria). */
interface TabelaAuditavel {
  isDeleted: PgColumn;
  updatedAt: PgColumn;
}

/**
 * Filtro padrao de toda consulta: so linhas vivas.
 *
 *   db.select().from(veiculos).where(and(vivos(veiculos), eq(veiculos.id, id)))
 */
export function vivos(tabela: TabelaAuditavel): SQL {
  return eq(tabela.isDeleted, false);
}

/**
 * Combina o filtro de vivos com as demais condicoes.
 *
 *   .where(vivosE(veiculos, eq(veiculos.status, "PENDING")))
 */
export function vivosE(tabela: TabelaAuditavel, ...condicoes: (SQL | undefined)[]): SQL {
  return and(vivos(tabela), ...condicoes) as SQL;
}

/**
 * Campos de toda gravacao: carimba quem alterou e quando.
 * `modified_by` aceita null para acao do sistema (webhook, cron).
 */
export function carimboDeEdicao(userId: string | null) {
  return { updatedAt: new Date(), modifiedBy: userId };
}

/**
 * Campos do delete LOGICO. Nunca existe delete fisico nesta base.
 *
 *   await db.update(veiculos).set(marcaDeExclusao(userId)).where(eq(veiculos.id, id))
 */
export function marcaDeExclusao(userId: string | null) {
  return {
    isDeleted: true,
    deletedAt: new Date(),
    updatedAt: new Date(),
    modifiedBy: userId,
  };
}

/**
 * Lancado quando o UPDATE com trava de colisao nao encontrou a linha: ou
 * outro usuario gravou antes, ou o registro foi excluido no meio do caminho.
 * As rotas traduzem para HTTP 409.
 */
export class ConflitoDeEdicao extends Error {
  constructor(
    mensagem = "Registro alterado por outro usuario. Recarregue a tela e tente novamente."
  ) {
    super(mensagem);
    this.name = "ConflitoDeEdicao";
  }
}

/**
 * Condicao do UPDATE com trava de colisao (optimistic locking).
 *
 * O `updatedAt` que o cliente leu entra no WHERE. Se alguem gravou nesse
 * meio-tempo, o valor mudou, o WHERE nao casa e o UPDATE devolve zero linhas
 * — a segunda gravacao e rejeitada em vez de sobrescrever a primeira.
 *
 *   const [linha] = await db.update(veiculos)
 *     .set({ ...dados, ...carimboDeEdicao(userId) })
 *     .where(travaDeColisao(veiculos, id, updatedAtOriginal))
 *     .returning();
 *   if (!linha) throw new ConflitoDeEdicao();
 *
 * `updatedAtOriginal` ausente = cliente antigo que ainda nao manda o carimbo:
 * a trava e pulada, mas o filtro de vivos continua valendo.
 */
export function travaDeColisao(
  tabela: TabelaAuditavel & { id: PgColumn },
  id: string,
  updatedAtOriginal?: Date | string | null
): SQL {
  const condicoes: (SQL | undefined)[] = [eq(tabela.id, id), vivos(tabela)];
  if (updatedAtOriginal) {
    const carimbo =
      updatedAtOriginal instanceof Date ? updatedAtOriginal : new Date(updatedAtOriginal);
    if (!Number.isNaN(carimbo.getTime())) {
      condicoes.push(eq(tabela.updatedAt, carimbo));
    }
  }
  return and(...condicoes) as SQL;
}
