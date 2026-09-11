import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, veiculos, carimboDeEdicao, travaDeColisao, vivosE } from "@/lib/db";
import { lerConfiguracaoNumero } from "@/lib/settings";
import { requireAuth } from "@/lib/auth";
import { formatVehicleAd } from "@/lib/vehicle-formatter";
import { cleanAdDescription } from "@/lib/ad-cleaner";
import { extractVehicleFromTextNoCache } from "@/lib/ai";

// Detecta se o modelo no DB e uma chamada/loja (deve ser re-extraido)
const BAD_MODEL_PATTERNS: RegExp[] = [
  /menor\s*(valor|pre[çc]o)/i,
  /oportunidade|imperd[ií]vel|promo[çc][ãa]o/i,
  /\b(vaapty|caarpix|repassey)\b/i,
  /go\s*repasses|repasses?\s+(sul|brasil|porto\s*alegre)/i,
  /\bporto\s*alegre\b/i,
  /historico\s*premium|aval[ií]a[çc][aã]o\s*superficial/i,
  /baixou+|abaixo\s*da\s*(tabela|fipe)/i,
  /^exclusividade|edicao\s*(limitada|especial|exclusiva)|lan[çc]amento|reservad[ao]/i,
];
const isBadModelName = (n: string) => !n || n.trim().length < 3 || BAD_MODEL_PATTERNS.some((p) => p.test(n));

/**
 * POST /api/vehicles/:id/regenerate-ad
 *
 * Regera o anuncio formatado de UM veiculo passando o rawDescription pelo
 * GPT ad-cleaner + vehicle-formatter. Util pra carros capturados ANTES do
 * deploy do cleaner (ainda tem header de empresa, contatos, frases promo).
 *
 * Body opcional:
 *   - margin?: number  -- margem em % (default: setting profit_margin_percent)
 *   - save?: boolean   -- default false (apenas retorna texto novo, nao
 *                         persiste). true salva no formattedAd.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;

  let body: { margin?: number; save?: boolean } = {};
  try { body = await request.json(); } catch { /* sem body */ }

  try {
    const [vehicle] = await db
      .select()
      .from(veiculos)
      .where(vivosE(veiculos, eq(veiculos.id, id)))
      .limit(1);
    if (!vehicle) {
      return NextResponse.json({ error: "Veiculo nao encontrado" }, { status: 404 });
    }

    // Margem
    let margin = body.margin;
    if (typeof margin !== "number") {
      margin = await lerConfiguracaoNumero("profit_margin_percent", 10);
    }

    // Re-extrai modelo + km/year/price quando dados parecem suspeitos.
    let model = vehicle.model;
    let brand = vehicle.brand;
    let km = vehicle.km;
    let year = vehicle.year;
    let yearModel = vehicle.yearModel;
    let fipePrice = vehicle.fipePrice;
    let price = vehicle.price;
    let modelChanged = false;
    let dataChanged = false;

    // Heuristica: dados suspeitos.
    // Inclui: FIPE null + 2+ valores R$ no texto (caso BMW 220i:
    // R$ 94.673 + *R$ 79.990* sem rotulo 'Fipe' -- antes pegava 94.673
    // como price, agora reextrai pra detectar maior=FIPE / menor=venda).
    const moneyMatches = vehicle.rawDescription
      ? (vehicle.rawDescription.match(/r\$\s*[\d][\d.,]*/gi) || [])
      : [];
    const hasMultiplePrices = !vehicle.fipePrice && moneyMatches.length >= 2;

    const needsReExtract =
      isBadModelName(vehicle.model) ||
      vehicle.km < 1000 ||
      vehicle.year < 1990 ||
      vehicle.year > new Date().getFullYear() + 1 ||
      hasMultiplePrices;

    if (needsReExtract && vehicle.rawDescription) {
      const extracted = await extractVehicleFromTextNoCache(vehicle.rawDescription);
      if (extracted) {
        // Modelo: troca se atual e ruim e extraido e bom
        if (isBadModelName(vehicle.model) && extracted.model && !isBadModelName(extracted.model)) {
          model = extracted.model;
          brand = extracted.brand ?? vehicle.brand;
          modelChanged = true;
        }
        // KM: troca se atual e muito baixo e extraido e razoavel (>=1000)
        if (vehicle.km < 1000 && typeof extracted.km === "number" && extracted.km >= 1000) {
          km = extracted.km;
          dataChanged = true;
        }
        // Year: troca se fora da faixa
        if ((vehicle.year < 1990 || vehicle.year > new Date().getFullYear() + 1) &&
            extracted.year && extracted.year >= 1990 && extracted.year <= new Date().getFullYear() + 1) {
          year = extracted.year;
          yearModel = extracted.yearModel ?? year;
          dataChanged = true;
        }
        // Fipe: aceita se atual for null/zero e extraido for valido
        if ((!vehicle.fipePrice || vehicle.fipePrice <= 0) &&
            typeof extracted.fipePrice === "number" && extracted.fipePrice > 0) {
          fipePrice = extracted.fipePrice;
          dataChanged = true;
        }
        // PRICE: se extractor achou fipePrice + price diferentes E o atual
        // do DB e igual a fipe (era o caso onde sistema pegou fipe como preco),
        // atualiza pro price correto.
        if (extracted.fipePrice && extracted.price &&
            extracted.price !== extracted.fipePrice &&
            (vehicle.price === extracted.fipePrice || vehicle.price > extracted.price * 1.05)) {
          price = extracted.price;
          dataChanged = true;
          console.log(`[regenerate-ad] price corrigido: ${vehicle.price} -> ${price}`);
        }
      }
    }

    // Limpa com IA
    const cleanedDesc = vehicle.rawDescription
      ? await cleanAdDescription(vehicle.rawDescription)
      : null;

    let features: string[] = [];
    try { features = JSON.parse(vehicle.features || "[]"); } catch { /* ignore */ }

    const newAd = formatVehicleAd(
      {
        model,
        brand,
        year,
        yearModel,
        km,
        price,
        fipePrice,
        transmission: vehicle.transmission,
        fuel: vehicle.fuel,
        features,
        rawDescription: cleanedDesc || vehicle.rawDescription,
      },
      { profitMarginPercent: margin }
    );

    if (body.save) {
      const sellingPrice = price * (1 + margin / 100);
      // Sem carimbo de colisao: a regeracao chama IA e pode demorar; o
      // updatedAt lido no inicio ja estaria vencido. A trava mantem id + vivo.
      await db
        .update(veiculos)
        .set({
          formattedAd: newAd,
          sellingPrice,
          ...(modelChanged ? { model, brand } : {}),
          ...(dataChanged ? { km, year, yearModel, fipePrice, price } : {}),
          ...carimboDeEdicao(auth.user.id),
        })
        .where(travaDeColisao(veiculos, id));
    }

    return NextResponse.json({
      formattedAd: newAd,
      cleanedDescription: cleanedDesc,
      margin,
      model,
      brand,
      km,
      year,
      price,
      fipePrice,
      modelChanged,
      dataChanged,
      saved: !!body.save,
    });
  } catch (error) {
    console.error("[regenerate-ad] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado" },
      { status: 500 }
    );
  }
}
