import { createHash } from "crypto";
import { eq, gte, lte, asc, desc } from "drizzle-orm";
import { db, veiculos, historicoPublicacao, vivosE } from "@/lib/db";
import { countBusinessDays } from "@/lib/business-days";

/**
 * Quanto o km pode variar e ainda ser o MESMO carro.
 *
 * O mesmo carro repostado em outro grupo traz o mesmo km, no maximo escrito
 * de outro jeito ("55 mil", "55.000", "54.870"). Ate 01/10/2026 a tolerancia
 * era 20% (minimo 5 mil): um HB20 Comfort 2024 com 55.000km foi descartado
 * como "duplicado" de OUTRO HB20, de outro fornecedor, com 48.000km -- e
 * carro popular sumia em massa ("muitos carros nao estao chegando").
 */
export function faixaDoMesmoKm(km: number): { min: number; max: number } {
  const folga = Math.max(1000, km * 0.03);
  return { min: Math.max(0, Math.floor(km - folga)), max: Math.ceil(km + folga) };
}

/**
 * Os dois modelos descrevem o mesmo carro? Igual depois de normalizar, ou um
 * contido no outro ("hb20 comfort" em "hyundai hb20 comfort"). Conter so vale
 * com DUAS palavras ou mais: "hb20" sozinho estava dentro de qualquer HB20.
 */
export function modelosCasam(a: string, b: string): boolean {
  const ka = normalizeModelKey(a);
  const kb = normalizeModelKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const [menor, maior] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  return menor.split(" ").length >= 2 && maior.includes(menor);
}

/**
 * Busca duplicata FUZZY na janela de 30 dias.
 * Usa quando o identityHash exato nao acha mas pode existir o "mesmo carro"
 * com variacao leve no modelo, ano ±1 ou km escrito de outro jeito.
 *
 * Estrategia:
 * 1. Filtra candidatos por year ±1 + km na faixa do mesmo km (±3%)
 * 2. Compara os modelos (modelosCasam)
 * 3. Retorna o de menor preco que casar
 */
export async function findFuzzyDuplicate(vehicle: {
  model: string;
  year: number;
  km: number;
}, daysWindow: number = 30): Promise<{ id: string; price: number; status: string } | null> {
  const targetKey = normalizeModelKey(vehicle.model);
  if (!targetKey) return null;

  const since = new Date(Date.now() - daysWindow * 24 * 60 * 60 * 1000);
  const { min: kmMin, max: kmMax } = faixaDoMesmoKm(vehicle.km);

  const candidates = await db
    .select({
      id: veiculos.id,
      model: veiculos.model,
      price: veiculos.price,
      status: veiculos.status,
    })
    .from(veiculos)
    .where(
      vivosE(
        veiculos,
        gte(veiculos.capturedAt, since),
        gte(veiculos.year, vehicle.year - 1),
        lte(veiculos.year, vehicle.year + 1),
        gte(veiculos.km, kmMin),
        lte(veiculos.km, kmMax)
      )
    )
    .orderBy(asc(veiculos.price)) // pega o mais barato que casar
    .limit(50);

  for (const c of candidates) {
    if (modelosCasam(c.model, vehicle.model)) {
      return { id: c.id, price: c.price, status: c.status };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Vehicle Hash Generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic MD5 hash from a vehicle's core identity fields.
 *
 * The hash is built from a normalised pipe-delimited string:
 *   `MODEL|YEAR|KM|PRICE`
 *
 * - Model is uppercased and trimmed.
 * - All values are coerced to their string representations.
 *
 * @returns A 32-character hex MD5 digest.
 */
export function generateVehicleHash(vehicle: {
  model: string;
  year: number;
  km: number;
  price: number;
}): string {
  const normalised = [
    vehicle.model.trim().toUpperCase(),
    String(vehicle.year),
    String(vehicle.km),
    String(vehicle.price),
  ].join("|");

  return createHash("md5").update(normalised).digest("hex");
}

/**
 * Normaliza o modelo do carro pra deteccao de duplicata "fuzzy".
 * - Lowercase, sem acentos, sem pontuacao
 * - Remove palavras genericas (FLEX, TURBO, AT, MT, MEC, AUT)
 * - Remove cilindradas/numeros decimais ("1.0", "2.4", "3.0")
 * - Remove sufixos comuns de versao
 * - Mantem so as palavras significativas
 *
 * Exemplos:
 *   "ONIX LT 1.0 FLEX 12V"    -> "onix lt"
 *   "Onix LT 1.0 Turbo Flex"  -> "onix lt"
 *   "ONIX LT"                 -> "onix lt"
 *   "Onix LTZ Turbo"          -> "onix ltz"
 *   "JEEP COMPASS LONGITUDE"  -> "compass longitude"
 *   "Compass Longitude 2.0"   -> "compass longitude"
 */
export function normalizeModelKey(model: string): string {
  const STOP_WORDS = new Set([
    "FLEX", "GASOLINA", "ETANOL", "DIESEL", "HIBRIDO", "HYBRID", "ELETRICO",
    "AUT", "AUTOMATICO", "MANUAL", "MEC", "MECANICO", "CVT", "AT", "MT",
    "TURBO", "TB", "T", "VVT", "TGI", "TSI", "TDI", "HDI",
    "4P", "5P", "2P", "4PORTAS", "5PORTAS",
    "12V", "16V", "20V", "24V", "8V",
    "4X4", "4X2", "AWD", "FWD", "RWD",
    "BLINDADO", "BLINDADA", "ARMADO",
  ]);
  return model
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // acentos
    .replace(/[^A-Z0-9\s]/g, " ") // pontuacao
    .replace(/\b\d+[.,]?\d*\s*L?\s*\b/g, " ") // cilindradas tipo "1.0", "2.4 L"
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w) && !/^\d+$/.test(w))
    .slice(0, 4) // limita a 4 palavras significativas
    .join(" ")
    .toLowerCase()
    .trim();
}

/**
 * Hash de IDENTIDADE do veiculo (sem o preco).
 *
 * Identifica "e o mesmo carro" mesmo se preco/km variarem ligeiramente.
 * Usado pra dedup de 30 dias com regra "fica o mais barato".
 *
 * Tolerancia:
 * - Modelo: normalizado via normalizeModelKey (remove FLEX/TURBO/cilindrada)
 * - KM: arredondado pro MIL mais proximo ("55 mil", "55.000" e "54.870" se
 *   encontram). Ate 01/10/2026 era a dezena de mil: 55.000 e 64.000 viravam o
 *   mesmo "60.000", e carros diferentes caiam como duplicados.
 * - Year: agrupado em pares (2022/2023 viram mesmo bucket)
 *
 * @returns 16-char hex MD5 digest.
 */
export function generateVehicleIdentityHash(vehicle: {
  model: string;
  year: number;
  km: number;
}): string {
  const modelKey = normalizeModelKey(vehicle.model);
  const kmBucket = Math.round(vehicle.km / 1000) * 1000;
  // Year exato ainda (year ±1 fica pra busca fuzzy)
  const normalised = [modelKey, String(vehicle.year), String(kmBucket)].join("|");
  return createHash("md5").update(normalised).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Deduplication Check
// ---------------------------------------------------------------------------

/**
 * Determine whether a vehicle (identified by its hash) can be posted to
 * a specific target group.
 *
 * Rules:
 *  1. If no successful post exists for this hash+group combination, allow.
 *  2. If the most recent successful post was >= 2 business days ago, allow.
 *  3. Otherwise deny (the vehicle must skip at least 1 full business day).
 *
 * @param vehicleHash   - MD5 hash of the vehicle identity.
 * @param targetGroupId - The WhatsApp group ID of the target group.
 * @returns true if posting is allowed; false otherwise.
 */
export async function canPostVehicle(
  vehicleHash: string,
  targetGroupId: string
): Promise<boolean> {
  const [lastPost] = await db
    .select({ postedAt: historicoPublicacao.postedAt })
    .from(historicoPublicacao)
    .where(
      vivosE(
        historicoPublicacao,
        eq(historicoPublicacao.vehicleHash, vehicleHash),
        eq(historicoPublicacao.targetGroupId, targetGroupId),
        eq(historicoPublicacao.success, true)
      )
    )
    .orderBy(desc(historicoPublicacao.postedAt))
    .limit(1);

  // No previous successful post -- allow
  if (!lastPost) {
    return true;
  }

  const now = new Date();
  const businessDaysSinceLast = countBusinessDays(lastPost.postedAt, now);

  // Must have passed at least 2 business days (i.e., skip >= 1 full business day)
  return businessDaysSinceLast >= 2;
}

// ---------------------------------------------------------------------------
// Record a Post
// ---------------------------------------------------------------------------

/**
 * Persist a post attempt (successful or not) in the PostHistory table.
 *
 * @param vehicleId     - The database ID of the Vehicle record.
 * @param vehicleHash   - MD5 hash of the vehicle identity.
 * @param targetGroupId - The WhatsApp group ID of the target group.
 * @param messageId     - The WhatsApp message ID returned by the API (optional).
 * @param success       - Whether the post was successful (defaults to true).
 * @param errorMessage  - Error details if the post failed (optional).
 */
export async function recordPost(
  vehicleId: string,
  vehicleHash: string,
  targetGroupId: string,
  messageId?: string,
  success: boolean = true,
  errorMessage?: string,
  userId?: string | null
): Promise<void> {
  await db.insert(historicoPublicacao).values({
    vehicleId,
    vehicleHash,
    targetGroupId,
    messageId: messageId ?? null,
    success,
    errorMessage: errorMessage ?? null,
    userId: userId ?? null,
    modifiedBy: userId ?? null,
  });
}
