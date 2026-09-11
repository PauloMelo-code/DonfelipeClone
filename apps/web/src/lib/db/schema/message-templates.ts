import { pgTable, text, index } from "drizzle-orm/pg-core";
import { colunasAuditoria, novoId } from "./_shared";
import { usuarios } from "./users";

export const modelosMensagem = pgTable(
  "message_templates",
  {
    id: text("id").primaryKey().$defaultFn(novoId),
    name: text("name").notNull(),
    content: text("content").notNull(),
    category: text("category"),
    shortcut: text("shortcut"),
    ...colunasAuditoria,
    modifiedBy: text("modified_by").references(() => usuarios.id, { onDelete: "restrict" }),
  },
  (t) => [index("message_templates_is_deleted_idx").on(t.isDeleted)]
);

export type ModeloMensagem = typeof modelosMensagem.$inferSelect;
export type NovoModeloMensagem = typeof modelosMensagem.$inferInsert;
