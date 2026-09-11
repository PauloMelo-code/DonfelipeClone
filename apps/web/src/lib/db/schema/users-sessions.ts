import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { colunasAuditoria, novoId } from "./_shared";
import { usuarios } from "./users";

/**
 * Sessoes abertas -- uma linha por entrada.
 *
 * O cookie continua sendo um JWT assinado, mas ele deixou de ser a AUTORIDADE:
 * agora carrega so o id desta linha, e quem decide se a sessao vale e a
 * consulta a esta tabela, em toda requisicao. Sem isso, um JWT de 24 h nao
 * pode ser revogado -- desligar alguem, trocar o fator ou perder o notebook
 * so passavam a valer quando o token vencesse sozinho.
 *
 * O id da linha NAO e um segredo, e por isso nao e hasheado. Ele viaja dentro
 * de um JWE que so o servidor consegue produzir: conhecer o id sem ter o
 * cookie nao autentica ninguem, e quem tem o `NEXTAUTH_SECRET` forjaria
 * qualquer cookie de qualquer jeito. Hashear aqui daria trabalho e nenhuma
 * garantia nova.
 */
export const sessoes = pgTable(
  "users_sessions",
  {
    id: text("id").primaryKey().$defaultFn(novoId),
    userId: text("user_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    /** De onde a sessao nasceu. E o que permite reconhecer o acesso estranho. */
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    /** Ultima requisicao. Base da expiracao por INATIVIDADE. */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    /** Teto ABSOLUTO de vida: chega aqui e acaba, por mais ativa que esteja. */
    expiresAt: timestamp("expires_at", { withTimezone: true, precision: 3 }).notNull(),
    /** Preenchido ao encerrar. Nao nulo = morta, e nunca volta. */
    revokedAt: timestamp("revoked_at", { withTimezone: true, precision: 3 }),
    /** Por que morreu: `logout`, `pelo-dono`, `fator-trocado`, `senha-trocada`. */
    revokedReason: text("revoked_reason"),
    ...colunasAuditoria,
    modifiedBy: text("modified_by").references(() => usuarios.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("users_sessions_user_id_idx").on(t.userId),
    // A limpeza periodica varre por vencimento.
    index("users_sessions_expires_at_idx").on(t.expiresAt),
  ]
);

export type Sessao = typeof sessoes.$inferSelect;
