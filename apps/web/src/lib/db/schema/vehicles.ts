import {
  pgTable,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { colunasAuditoria, novoId } from "./_shared";
import { usuarios } from "./users";
import { gruposWhatsapp } from "./whatsapp-groups";

/**
 * Dinheiro em `numeric(12,2)`, nunca em ponto flutuante.
 *
 * `double precision` acumulava erro de centavo em margem e preco de venda.
 * O `mode: "number"` mantem o valor como number em TypeScript, entao a
 * aritmetica de `vehicle-formatter` e `publisher` continua igual.
 */
const dinheiro = (nome: string) => numeric(nome, { precision: 12, scale: 2, mode: "number" });

export const veiculos = pgTable(
  "vehicles",
  {
    id: text("id").primaryKey().$defaultFn(novoId),

    // ── Identificacao ────────────────────────────────────────────────
    model: text("model").notNull(),
    brand: text("brand"),
    year: integer("year").notNull(),
    yearModel: integer("year_model"),
    km: integer("km").notNull(),
    transmission: text("transmission"),
    fuel: text("fuel"),
    color: text("color"),
    plate: text("plate"),
    location: text("location"),
    state: text("state"),

    // ── Valores ──────────────────────────────────────────────────────
    price: dinheiro("price").notNull(),
    sellingPrice: dinheiro("selling_price"),
    fipePrice: dinheiro("fipe_price"),
    soldPrice: dinheiro("sold_price"),

    // ── Conteudo ─────────────────────────────────────────────────────
    // ponytail: features/photos/photoCategories/preparedTargetGroupIds sao
    // JSON dentro de text, herdado do schema Prisma. Virar jsonb tocaria as
    // 31 chamadas de JSON.parse espalhadas pelas rotas e componentes, sem
    // ganho de seguranca. Migrar quando a consulta por conteudo do array
    // aparecer.
    features: text("features").notNull().default("[]"),
    photos: text("photos").notNull().default("[]"),
    photoCategories: text("photo_categories"),
    rawDescription: text("raw_description"),
    formattedAd: text("formatted_ad"),
    internalNotes: text("internal_notes"),

    // ── Origem ───────────────────────────────────────────────────────
    sourceGroupId: text("source_group_id").references(() => gruposWhatsapp.groupId, {
      onDelete: "restrict",
    }),
    sourceMessageId: text("source_message_id").unique(),
    sourceSenderJid: text("source_sender_jid"),
    sellerPhone: text("seller_phone"),

    // ── Deduplicacao ─────────────────────────────────────────────────
    vehicleHash: text("vehicle_hash").notNull(),
    identityHash: text("identity_hash"),
    photoHash: text("photo_hash"),

    // ── Ciclo de vida ────────────────────────────────────────────────
    status: text("status").notNull().default("PENDING"),
    rejectionReason: text("rejection_reason"),
    rejectionTags: text("rejection_tags"),
    autoRejectedReason: text("auto_rejected_reason"),
    qualityScore: integer("quality_score"),
    isVip: boolean("is_vip").notNull().default(false),
    soldNotes: text("sold_notes"),
    preparedTargetGroupIds: text("prepared_target_group_ids"),

    publishingLockedAt: timestamp("publishing_locked_at", { withTimezone: true, precision: 3 }),
    capturedAt: timestamp("captured_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true, precision: 3 }),
    publishedAt: timestamp("published_at", { withTimezone: true, precision: 3 }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true, precision: 3 }),
    preparedAt: timestamp("prepared_at", { withTimezone: true, precision: 3 }),
    /** O operador editou o texto do anuncio: aprovar e publicar nao regeram. */
    adEditedAt: timestamp("ad_edited_at", { withTimezone: true, precision: 3 }),
    soldAt: timestamp("sold_at", { withTimezone: true, precision: 3 }),

    ...colunasAuditoria,
    modifiedBy: text("modified_by").references(() => usuarios.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("vehicles_status_idx").on(t.status),
    index("vehicles_vehicle_hash_idx").on(t.vehicleHash),
    index("vehicles_captured_at_idx").on(t.capturedAt),
    index("vehicles_source_message_id_idx").on(t.sourceMessageId),
    index("vehicles_source_group_id_idx").on(t.sourceGroupId),
    index("vehicles_state_idx").on(t.state),
    index("vehicles_photo_hash_idx").on(t.photoHash),
    index("vehicles_prepared_at_idx").on(t.preparedAt),
    index("vehicles_source_sender_jid_idx").on(t.sourceSenderJid),
    index("vehicles_identity_hash_idx").on(t.identityHash),
    // Soft delete: quase toda consulta filtra por is_deleted = false.
    index("vehicles_is_deleted_idx").on(t.isDeleted),
  ]
);

export type Veiculo = typeof veiculos.$inferSelect;
export type NovoVeiculo = typeof veiculos.$inferInsert;
