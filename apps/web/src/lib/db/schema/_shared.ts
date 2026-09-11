import { boolean, timestamp } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Colunas obrigatorias de TODA tabela.
//
// Espalhe estas quatro em qualquer tabela nova com `...colunasAuditoria`. O
// `modified_by` fica de fora daqui de proposito: ele e uma FK para `users` e
// cada tabela declara a sua, com onDelete restrict (ver `fkModificadoPor`).
//
// Regra da casa: nenhuma tabela sem created_at, updated_at, deleted_at,
// is_deleted e modified_by.
// ---------------------------------------------------------------------------

export const colunasAuditoria = {
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  /** Instante do soft delete. Null = vivo. */
  deletedAt: timestamp("deleted_at", { withTimezone: true, precision: 3 }),
  /** Redundante com deletedAt de proposito: e o filtro barato e indexavel. */
  isDeleted: boolean("is_deleted").notNull().default(false),
};

/**
 * Gera id de linha nova. Os ids ja existentes sao cuid do Prisma; os novos sao
 * uuid v4. Ambos sao `text`, entao convivem sem migracao de dado.
 *
 * ponytail: `crypto.randomUUID` da biblioteca padrao, sem dependencia nova.
 */
export function novoId(): string {
  return globalThis.crypto.randomUUID();
}
