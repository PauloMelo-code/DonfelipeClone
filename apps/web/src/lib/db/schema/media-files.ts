import { pgTable, text, index } from "drizzle-orm/pg-core";
import { colunasAuditoria, novoId } from "./_shared";
import { usuarios } from "./users";

export const arquivosMidia = pgTable(
  "media_files",
  {
    id: text("id").primaryKey().$defaultFn(novoId),
    mimeType: text("mime_type").notNull().default("image/jpeg"),
    /** Conteudo em base64. Servido por /api/media/[id]. */
    data: text("data").notNull(),
    originalUrl: text("original_url"),
    ...colunasAuditoria,
    modifiedBy: text("modified_by").references(() => usuarios.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("media_files_created_at_idx").on(t.createdAt),
    index("media_files_is_deleted_idx").on(t.isDeleted),
  ]
);

export type ArquivoMidia = typeof arquivosMidia.$inferSelect;
export type NovoArquivoMidia = typeof arquivosMidia.$inferInsert;
