import { pgTable, text, index } from "drizzle-orm/pg-core";
import { colunasAuditoria, novoId } from "./_shared";
import { usuarios } from "./users";

export const configuracoes = pgTable(
  "settings",
  {
    id: text("id").primaryKey().$defaultFn(novoId),
    key: text("key").notNull().unique(),
    value: text("value").notNull(),
    ...colunasAuditoria,
    modifiedBy: text("modified_by").references(() => usuarios.id, { onDelete: "restrict" }),
  },
  (t) => [index("settings_is_deleted_idx").on(t.isDeleted)]
);

export type Configuracao = typeof configuracoes.$inferSelect;
export type NovaConfiguracao = typeof configuracoes.$inferInsert;
