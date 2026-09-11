import { pgTable, text, boolean, index } from "drizzle-orm/pg-core";
import { colunasAuditoria, novoId } from "./_shared";
import { usuarios } from "./users";

export const gruposWhatsapp = pgTable(
  "whatsapp_groups",
  {
    id: text("id").primaryKey().$defaultFn(novoId),
    /** JID do WhatsApp. Chave de negocio, referenciada por vehicles e post_history. */
    groupId: text("group_id").notNull().unique(),
    name: text("name").notNull(),
    /** Quando true, o nome foi editado a mao e o sync NUNCA sobrescreve. */
    nameLocked: boolean("name_locked").notNull().default(false),
    role: text("role").notNull(),
    active: boolean("active").notNull().default(true),
    filters: text("filters"),
    photoUrl: text("photo_url"),
    region: text("region"),
    isCommunity: boolean("is_community").notNull().default(false),
    isAnnounce: boolean("is_announce").notNull().default(false),
    /** DM 1-1 (JID @s.whatsapp.net), nao grupo. */
    isContact: boolean("is_contact").notNull().default(false),
    /** Override manual do tipo: grupo | canal | comunidade | lista | contato */
    kindOverride: text("kind_override"),
    ownerPhone: text("owner_phone"),
    ...colunasAuditoria,
    modifiedBy: text("modified_by").references(() => usuarios.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("whatsapp_groups_role_active_idx").on(t.role, t.active),
    index("whatsapp_groups_is_deleted_idx").on(t.isDeleted),
  ]
);

export type GrupoWhatsapp = typeof gruposWhatsapp.$inferSelect;
export type NovoGrupoWhatsapp = typeof gruposWhatsapp.$inferInsert;
