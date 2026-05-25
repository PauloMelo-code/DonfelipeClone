import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
    const vehicle = await prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) {
      return NextResponse.json({ error: "Veiculo nao encontrado" }, { status: 404 });
    }

    // Margem
    let margin = body.margin;
    if (typeof margin !== "number") {
      const setting = await prisma.setting.findUnique({
        where: { key: "profit_margin_percent" },
      });
      margin = setting ? parseFloat(setting.value) : 10;
    }

    // Re-extrai modelo SE o nome atual e chamada/loja e ha rawDescription.
    // Isso corrige carros capturados antes do extractor v2.
    let model = vehicle.model;
    let brand = vehicle.brand;
    let modelChanged = false;
    if (isBadModelName(vehicle.model) && vehicle.rawDescription) {
      const extracted = await extractVehicleFromTextNoCache(vehicle.rawDescription);
      if (extracted?.model && !isBadModelName(extracted.model) && extracted.model !== vehicle.model) {
        model = extracted.model;
        brand = extracted.brand ?? vehicle.brand;
        modelChanged = true;
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
        year: vehicle.year,
        yearModel: vehicle.yearModel,
        km: vehicle.km,
        price: vehicle.price,
        fipePrice: vehicle.fipePrice,
        transmission: vehicle.transmission,
        fuel: vehicle.fuel,
        features,
        rawDescription: cleanedDesc || vehicle.rawDescription,
      },
      { profitMarginPercent: margin }
    );

    if (body.save) {
      const sellingPrice = vehicle.price * (1 + margin / 100);
      await prisma.vehicle.update({
        where: { id },
        data: {
          formattedAd: newAd,
          sellingPrice,
          ...(modelChanged ? { model, brand } : {}),
        },
      });
    }

    return NextResponse.json({
      formattedAd: newAd,
      cleanedDescription: cleanedDesc,
      margin,
      model,
      brand,
      modelChanged,
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
