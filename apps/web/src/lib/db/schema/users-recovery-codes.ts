import { pgTable, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { colunasAuditoria, novoId } from "./_shared";
import { usuarios } from "./users";

/**
 * Codigos de resgate do segundo fator.
 *
 * Existem porque o fator e OBRIGATORIO: sem uma saida, o celular perdido vira
 * conta perdida, e a pressa de recuperar acaba virando um botao de "desligar
 * o segundo fator" -- que a regua proibe justamente por ser a porta que o
 * atacante usa.
 *
 * Guardados como SHA-256 do codigo, nao em claro. Hash rapido e o certo aqui:
 * o codigo vem de CSPRNG com 50 bits, entao nao ha dicionario a defender, e a
 * busca pelo hash exato e o que torna o consumo uma unica operacao atomica.
 *
 * Uso e UNICO e por `UPDATE` condicional (`used_at IS NULL` no WHERE): duas
 * requisicoes simultaneas com o mesmo codigo, so uma leva a linha.
 */
export const codigosDeResgate = pgTable(
  "users_recovery_codes",
  {
    id: text("id").primaryKey().$defaultFn(novoId),
    userId: text("user_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    /** SHA-256 em hex do codigo. O codigo em claro so existe na tela, uma vez. */
    codeHash: text("code_hash").notNull(),
    /** Preenchido no consumo. Nao nulo = gasto, nunca reaproveitado. */
    usedAt: timestamp("used_at", { withTimezone: true, precision: 3 }),
    ...colunasAuditoria,
    modifiedBy: text("modified_by").references(() => usuarios.id, { onDelete: "restrict" }),
  },
  (t) => [
    // A busca do consumo e sempre por dono + hash.
    uniqueIndex("users_recovery_codes_user_hash_key").on(t.userId, t.codeHash),
    index("users_recovery_codes_user_id_idx").on(t.userId),
  ]
);

export type CodigoDeResgate = typeof codigosDeResgate.$inferSelect;
