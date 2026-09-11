import { pgTable, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { colunasAuditoria, novoId } from "./_shared";
import { usuarios } from "./users";
import { veiculos } from "./vehicles";
import { gruposWhatsapp } from "./whatsapp-groups";

export const historicoPublicacao = pgTable(
  "post_history",
  {
    id: text("id").primaryKey().$defaultFn(novoId),
    vehicleId: text("vehicle_id")
      .notNull()
      .references(() => veiculos.id, { onDelete: "restrict" }),
    vehicleHash: text("vehicle_hash").notNull(),
    targetGroupId: text("target_group_id")
      .notNull()
      .references(() => gruposWhatsapp.groupId, { onDelete: "restrict" }),
    postedAt: timestamp("posted_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    messageId: text("message_id"),
    success: boolean("success").notNull().default(true),
    errorMessage: text("error_message"),
    /** Quem disparou a publicacao. Null = acao automatica do sistema. */
    userId: text("user_id").references(() => usuarios.id, { onDelete: "restrict" }),
    ...colunasAuditoria,
    modifiedBy: text("modified_by").references(() => usuarios.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("post_history_hash_target_posted_idx").on(t.vehicleHash, t.targetGroupId, t.postedAt),
    index("post_history_posted_at_idx").on(t.postedAt),
    index("post_history_vehicle_id_idx").on(t.vehicleId),
    index("post_history_is_deleted_idx").on(t.isDeleted),
  ]
);

export type PublicacaoHistorico = typeof historicoPublicacao.$inferSelect;
export type NovaPublicacaoHistorico = typeof historicoPublicacao.$inferInsert;
