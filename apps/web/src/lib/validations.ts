import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Vehicle
// ---------------------------------------------------------------------------

export const createVehicleSchema = z.object({
  model: z.string().min(1, "Modelo obrigatorio").max(200),
  brand: z.string().max(100).nullable().optional(),
  year: z.number().int().min(1990).max(new Date().getFullYear() + 2),
  yearModel: z
    .number()
    .int()
    .min(1990)
    .max(new Date().getFullYear() + 2)
    .nullable()
    .optional(),
  km: z.number().int().min(0).max(999999),
  price: z.number().positive("Preco deve ser positivo").max(9999999),
  sellingPrice: z.number().positive().nullable().optional(),
  fipePrice: z.number().positive().nullable().optional(),
  transmission: z
    .enum(["AUTOMATICO", "MANUAL", "CVT"])
    .nullable()
    .optional(),
  fuel: z
    .enum(["FLEX", "GASOLINA", "ETANOL", "DIESEL", "HIBRIDO", "ELETRICO"])
    .nullable()
    .optional(),
  color: z.string().max(50).nullable().optional(),
  plate: z.string().max(10).nullable().optional(),
  features: z.array(z.string().max(100)).max(30).optional(),
  photos: z.array(z.string()).max(20).optional(),
  rawDescription: z.string().max(5000).nullable().optional(),
  sourceGroupId: z.string().nullable().optional(),
  sourceMessageId: z.string().nullable().optional(),
  sellerPhone: z.string().max(20).nullable().optional(),
});

export const updateVehicleSchema = createVehicleSchema.partial().extend({
  formattedAd: z.string().max(5000).nullable().optional(),
  status: z
    .enum(["PENDING", "APPROVED", "REJECTED", "PUBLISHED"])
    .optional(),
});

// ---------------------------------------------------------------------------
// Group
// ---------------------------------------------------------------------------

export const createGroupSchema = z.object({
  groupId: z.string().min(1, "groupId obrigatorio").max(100),
  name: z.string().min(1, "Nome obrigatorio").max(200),
  role: z.enum(["SOURCE", "TARGET"]),
  active: z.boolean().optional().default(true),
  filters: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  region: z.string().max(50).nullable().optional(),
});

export const updateGroupSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  role: z.enum(["SOURCE", "TARGET"]).optional(),
  active: z.boolean().optional(),
  filters: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  region: z.string().max(50).nullable().optional(),
});

// ---------------------------------------------------------------------------
// Settings (whitelist de keys permitidas)
// ---------------------------------------------------------------------------

export const ALLOWED_SETTING_KEYS = [
  "profit_margin",
  "profit_margin_percent",
  "delay_min_seconds",
  "delay_max_seconds",
  "filter_min_year",
  "filter_max_price",
  "filter_max_km",
] as const;

export const updateSettingsSchema = z
  .record(z.string(), z.string().max(500))
  .refine(
    (val) =>
      Object.keys(val).every((k) =>
        (ALLOWED_SETTING_KEYS as readonly string[]).includes(k)
      ),
    {
      message:
        "Chave de configuracao invalida. Permitidas: " +
        ALLOWED_SETTING_KEYS.join(", "),
    }
  );

// ---------------------------------------------------------------------------
// Reject
// ---------------------------------------------------------------------------

export const rejectVehicleSchema = z
  .object({
    rejectionReason: z.string().max(1000).optional(),
  })
  .optional();

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

export const publishVehicleSchema = z
  .object({
    targetGroupIds: z.array(z.string()).optional(),
    formattedAd: z.string().max(5000).optional(),
    sellingPrice: z.number().positive().optional(),
  })
  .optional();
