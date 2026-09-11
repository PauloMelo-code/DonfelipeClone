import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { colunasAuditoria, novoId } from "./_shared";
import { usuarios } from "./users";

/**
 * Desafios de WebAuthn -- o numero aleatorio que o autenticador assina.
 *
 * Guardados no BANCO, e nao num cookie assinado, por um motivo so: uso unico
 * atomico. O consumo e um `UPDATE` condicional com `used_at IS NULL` no WHERE,
 * entao duas requisicoes com o mesmo desafio disputam a linha e so uma leva.
 * Com o desafio dentro de um cookie, as duas passariam.
 *
 * `user_id` fica NULO no desafio de login: a passkey e descoberta pelo proprio
 * autenticador, e por isso o login nao precisa saber de quem e a conta antes
 * de conferir a assinatura. E o que impede a lista de credenciais de virar
 * enumeracao de contas.
 */
export const desafiosWebauthn = pgTable(
  "webauthn_challenges",
  {
    id: text("id").primaryKey().$defaultFn(novoId),
    /** O desafio em base64url, como o navegador o devolve. */
    challenge: text("challenge").notNull(),
    /** `registro` ou `login`. Um nunca serve para o outro. */
    tipo: text("tipo").notNull(),
    /** So no registro: de quem e o cadastro em andamento. */
    userId: text("user_id").references(() => usuarios.id, { onDelete: "restrict" }),
    /**
     * Marca de que o dono ja provou o fator atual ao PEDIR este desafio.
     *
     * Cadastrar uma passkey exige provar quem e antes: sem isso, um cookie
     * roubado adicionaria o autenticador do atacante e garantiria a ele
     * entrada permanente, com aparencia de credencial legitima.
     */
    provaDoFator: text("prova_do_fator"),
    expiresAt: timestamp("expires_at", { withTimezone: true, precision: 3 }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, precision: 3 }),
    ...colunasAuditoria,
    modifiedBy: text("modified_by").references(() => usuarios.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("webauthn_challenges_challenge_idx").on(t.challenge),
    index("webauthn_challenges_expires_at_idx").on(t.expiresAt),
  ]
);

export type DesafioWebauthn = typeof desafiosWebauthn.$inferSelect;
