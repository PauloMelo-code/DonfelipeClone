import { pgTable, text, boolean, integer, timestamp, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { colunasAuditoria, novoId } from "./_shared";

/**
 * Papeis do sistema.
 *
 * O default do banco e OPERATOR, o MENOR privilegio. Antes era ADMIN: uma
 * linha inserida fora da rota de usuarios nascia administradora.
 *
 * Mantido como `text` com CHECK em vez de enum do Postgres: adicionar valor a
 * um enum exige ALTER TYPE fora de transacao, e o proximo papel (OWNER, da
 * Fase 4) entraria num CHECK sem esse atrito.
 */
export const PAPEIS = ["ADMIN", "OPERATOR"] as const;
export type Papel = (typeof PAPEIS)[number];

export const usuarios = pgTable(
  "users",
  {
    id: text("id").primaryKey().$defaultFn(novoId),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    password: text("password").notNull(),
    role: text("role").$type<Papel>().notNull().default("OPERATOR"),
    active: boolean("active").notNull().default(true),
    /**
     * Senha definida por outra pessoa e ainda nao trocada pelo dono.
     *
     * Um administrador nunca escolhe a senha DEFINITIVA de alguem: o que ele
     * define e temporaria, e enquanto esta marca estiver ligada a conta so
     * alcanca a rota de troca da propria senha. Sem isso, quem redefiniu
     * conhece a credencial permanente do outro.
     */
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    /**
     * Prazo da senha que um administrador definiu.
     *
     * A marca acima so age se o login acontecer; sem prazo, a conta
     * provisionada e nunca usada guarda para sempre uma senha que viajou por
     * mensagem. Nulo = senha do proprio dono, sem prazo.
     */
    tempPasswordExpiresAt: timestamp("temp_password_expires_at", {
      withTimezone: true,
      precision: 3,
    }),

    // ---- Bloqueio por conta (REQ-C1) ------------------------------------
    // O limitador por IP nao protege uma conta especifica: o atacante roda o
    // `X-Forwarded-For` e zera o contador. Foi medido na auditoria de
    // 2026-09-10 -- 12 tentativas contra a mesma conta e a senha certa entrou
    // na 13a. O contador que importa e este, por conta e persistido.
    failedAttempts: integer("failed_attempts").notNull().default(0),
    /** Quando a ultima falha aconteceu, para a janela deslizante. */
    lastFailedAt: timestamp("last_failed_at", { withTimezone: true, precision: 3 }),
    /** Enquanto for futuro, a conta esta travada. Nao e limpo ao expirar. */
    lockedUntil: timestamp("locked_until", { withTimezone: true, precision: 3 }),

    // ---- Segundo fator (REQ-D1) -----------------------------------------
    // Obrigatorio para todo mundo. A conta nasce sem semente; enquanto
    // `totpEnabledAt` for nulo a sessao so alcanca a propria tela de cadastro.
    /**
     * A semente TOTP CIFRADA (`lib/segredo-cifrado`), nunca em claro.
     *
     * Preenchida quando o cadastro comeca e `totpEnabledAt` ainda nulo: esse
     * par e o estado "escaneou o QR mas ainda nao confirmou".
     */
    totpSecret: text("totp_secret"),
    /** Quando o fator passou a valer. Nulo = a conta ainda precisa cadastrar. */
    totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true, precision: 3 }),
    /**
     * O ultimo passo TOTP aceito. Barra REUSO: o codigo lido por cima do ombro
     * nao entra de novo enquanto o passo nao virar.
     */
    totpLastStep: integer("totp_last_step"),
    ...colunasAuditoria,
    // Auto-referencia: quem alterou este usuario tambem e um usuario.
    modifiedBy: text("modified_by").references((): AnyPgColumn => usuarios.id, {
      onDelete: "restrict",
    }),
  },
  (t) => [
    index("users_is_deleted_idx").on(t.isDeleted),
    index("users_locked_until_idx").on(t.lockedUntil),
  ]
);

export type Usuario = typeof usuarios.$inferSelect;
export type NovoUsuario = typeof usuarios.$inferInsert;
