import { pgTable, text, index } from "drizzle-orm/pg-core";
import { colunasAuditoria, novoId } from "./_shared";
import { usuarios } from "./users";
import { veiculos } from "./vehicles";

/**
 * Trilha de auditoria — APPEND-ONLY.
 *
 * Esta tabela nao aceita UPDATE nem DELETE. Duas rotas faziam
 * `auditLog.deleteMany()` e apagavam a prova junto com o veiculo; isso foi
 * removido, e as linhas orfas passam a ter `vehicle_id` nulo em vez de sumir.
 *
 * As colunas de auditoria existem para cumprir a regra da casa e o
 * check-compliance, mas devem permanecer NO DEFAULT: um registro de trilha
 * nunca e alterado nem deletado, nem logicamente. A garantia final e o GRANT
 * do Postgres — a conta da aplicacao nao deve ter DELETE aqui.
 */
export const trilhaAuditoria = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey().$defaultFn(novoId),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    details: text("details"),
    userId: text("user_id").references(() => usuarios.id, { onDelete: "restrict" }),
    /** Fica nulo quando o veiculo e removido: a linha da trilha permanece. */
    vehicleId: text("vehicle_id").references(() => veiculos.id, { onDelete: "set null" }),
    /** IP do cliente, pela leitura canonica de request-meta. */
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...colunasAuditoria,
    modifiedBy: text("modified_by").references(() => usuarios.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("audit_logs_action_idx").on(t.action),
    index("audit_logs_created_at_idx").on(t.createdAt),
    index("audit_logs_vehicle_id_idx").on(t.vehicleId),
    index("audit_logs_user_id_idx").on(t.userId),
  ]
);

export type LinhaTrilha = typeof trilhaAuditoria.$inferSelect;
export type NovaLinhaTrilha = typeof trilhaAuditoria.$inferInsert;
