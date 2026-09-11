import { pgTable, text, integer, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { colunasAuditoria, novoId } from "./_shared";
import { usuarios } from "./users";

/**
 * Passkeys: o fator resistente a PHISHING.
 *
 * O codigo de seis digitos do aplicativo protege contra senha vazada, mas nao
 * contra uma tela falsa: quem digita a senha numa copia do site digita o
 * codigo nela tambem, e o atacante repassa os dois em tempo real. A passkey
 * fecha isso por construcao -- a assinatura e feita sobre o dominio de quem
 * pediu, entao a que sai numa tela falsa nao serve no site verdadeiro.
 *
 * O que fica guardado e a chave PUBLICA. A privada nunca sai do autenticador
 * (Windows Hello, Touch ID, YubiKey, gerenciador de senhas), e nem o servidor
 * nem um dump do banco a alcancam. E a diferenca em relacao a semente TOTP,
 * que precisa ser cifrada justamente porque o servidor tem que reve-la.
 */
export const passkeys = pgTable(
  "users_passkeys",
  {
    id: text("id").primaryKey().$defaultFn(novoId),
    userId: text("user_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    /** O id da credencial, em base64url. Unico no mundo. */
    credentialId: text("credential_id").notNull(),
    /** A chave publica em COSE, base64url. Publica: nao ha o que cifrar. */
    publicKey: text("public_key").notNull(),
    /**
     * Contador de uso do autenticador.
     *
     * Se voltar para tras, ha uma COPIA da credencial em circulacao. Muitos
     * autenticadores modernos sempre reportam 0 e a checagem nao se aplica;
     * quando o valor cresce, ele vale.
     */
    counter: integer("counter").notNull().default(0),
    /** `usb`, `internal`, `hybrid`... O navegador usa para sugerir o caminho. */
    transports: text("transports"),
    /** `singleDevice` (chave fisica) ou `multiDevice` (sincronizada). */
    deviceType: text("device_type"),
    /** Sincronizada com a nuvem do fabricante. */
    backedUp: boolean("backed_up").notNull().default(false),
    /** Nome que o dono deu, para saber qual remover. */
    apelido: text("apelido").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, precision: 3 }),
    ...colunasAuditoria,
    modifiedBy: text("modified_by").references(() => usuarios.id, { onDelete: "restrict" }),
  },
  (t) => [
    // O login descobre a conta PELA credencial, entao esta busca e a quente.
    uniqueIndex("users_passkeys_credential_id_key").on(t.credentialId),
    index("users_passkeys_user_id_idx").on(t.userId),
  ]
);

export type Passkey = typeof passkeys.$inferSelect;
