import { and, eq } from "drizzle-orm";
import { db, configuracoes, vivos } from "@/lib/db";

const DEFAULT_VIP_PATTERNS = [
  "land rover", "defender", "discovery", "range rover",
  "porsche", "macan", "cayenne", "panamera", "911",
  "bmw m", "m3", "m4", "m5", "x6", "x7",
  "amg", "mercedes amg",
  "audi rs", "audi r8",
  "land cruiser", "fj cruiser",
  "ferrari", "lamborghini", "maserati",
  "tesla",
];

export async function isVipVehicle(model: string, brand?: string | null): Promise<boolean> {
  const text = `${brand || ""} ${model}`.toLowerCase();

  // Custom list from settings
  const [setting] = await db
    .select({ value: configuracoes.value })
    .from(configuracoes)
    .where(and(eq(configuracoes.key, "vip_keywords"), vivos(configuracoes)))
    .limit(1);

  const customPatterns = setting?.value
    ? setting.value.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean)
    : [];

  const allPatterns = [...DEFAULT_VIP_PATTERNS, ...customPatterns];
  return allPatterns.some((p) => text.includes(p));
}
