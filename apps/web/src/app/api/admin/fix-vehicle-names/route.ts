import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { extractVehicleFromTextNoCache } from "@/lib/ai";
import { formatVehicleAd } from "@/lib/vehicle-formatter";
import { cleanAdDescription } from "@/lib/ad-cleaner";

/**
 * POST /api/admin/fix-vehicle-names
 *
 * Procura veiculos cujo modelo no DB e uma CHAMADA PROMOCIONAL (e.g.
 * "Menor valor Brasil", "CAARPIX PORTO ALEGRE") ao inves do modelo real.
 * Re-extrai do rawDescription usando o extractor v2 (com PROMO_PHRASES
 * filtradas) e atualiza model/brand. Tambem regera o formattedAd.
 *
 * Body:
 *   - dryRun (default true): conta sem alterar
 */

// Padroes que indicam modelo errado no DB (chamada/loja em vez do modelo real)
const BAD_MODEL_PATTERNS: RegExp[] = [
  /menor\s*(valor|pre[çc]o)\s*(do\s*)?(brasil|sul|pa[ií]s)?/i,
  /oportunidade/i,
  /imperd[ií]vel/i,
  /melhor\s*(oferta|pre[çc]o|valor|neg[oó]ci)/i,
  /^promo[çc][ãa]o/i,
  /\bvaapty/i,
  /\bcaarpix/i,
  /go\s*repasses/i,
  /repasses?\s+(sul|brasil|premium|vip|porto\s*alegre)/i,
  /\bporto\s*alegre\b/i, // muitos casos de "X PORTO ALEGRE" como modelo
  /historico\s*premium/i,
  /aval[ií]a[çc][aã]o\s*superficial/i,
  /para\s*seu\s*showroom/i,
  /baixou+/i,
  /^abaixo\s*da\s*(tabela|fipe)/i,
];

function isBadModelName(name: string): boolean {
  if (!name) return true;
  const n = name.trim();
  if (n.length < 3) return true;
  // Mais que 5 palavras sem nenhum termo automotivo? provavelmente nao e modelo
  return BAD_MODEL_PATTERNS.some((p) => p.test(n));
}

export async function POST(request: Request) {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  let body: { dryRun?: boolean } = { dryRun: true };
  try { body = await request.json(); } catch { /* sem body = dryRun */ }
  const dryRun = body.dryRun !== false;

  try {
    // Busca veiculos suspeitos: model que parece chamada promocional E
    // que tenham rawDescription pra re-extrair.
    const all = await prisma.vehicle.findMany({
      where: { rawDescription: { not: null } },
      select: {
        id: true,
        model: true,
        brand: true,
        formattedAd: true,
        rawDescription: true,
        price: true,
        fipePrice: true,
        sellingPrice: true,
        year: true,
        yearModel: true,
        km: true,
        transmission: true,
        fuel: true,
        features: true,
      },
    });

    const candidates = all.filter((v) => isBadModelName(v.model));

    // Margem global pra regenerar formattedAd
    const marginSetting = await prisma.setting.findUnique({
      where: { key: "profit_margin_percent" },
    });
    const margin = marginSetting ? parseFloat(marginSetting.value) : 10;

    let fixed = 0;
    let skipped = 0;
    const samples: Array<{
      id: string;
      oldModel: string;
      newModel: string | null;
      brand: string | null;
    }> = [];

    for (const v of candidates) {
      if (!v.rawDescription) {
        skipped++;
        continue;
      }
      const extracted = await extractVehicleFromTextNoCache(v.rawDescription);
      const newModel = extracted?.model?.trim();

      // Se nao conseguiu extrair ou continua dando "modelo ruim", desiste
      if (!newModel || isBadModelName(newModel) || newModel === v.model) {
        skipped++;
        continue;
      }

      // Re-roda cleaner + formatter pra gerar formattedAd novo
      let newFormattedAd: string | null = null;
      try {
        const cleanedDesc = await cleanAdDescription(v.rawDescription);
        let features: string[] = [];
        try { features = JSON.parse(v.features || "[]"); } catch { /* ignore */ }
        newFormattedAd = formatVehicleAd(
          {
            model: newModel,
            brand: (extracted?.brand ?? v.brand),
            year: v.year,
            yearModel: v.yearModel,
            km: v.km,
            price: v.price,
            fipePrice: v.fipePrice,
            transmission: v.transmission,
            fuel: v.fuel,
            features,
            rawDescription: cleanedDesc || v.rawDescription,
          },
          { profitMarginPercent: margin }
        );
      } catch { /* cleaner falhou, mas ainda atualiza modelo */ }

      if (samples.length < 20) {
        samples.push({
          id: v.id,
          oldModel: v.model,
          newModel,
          brand: (extracted?.brand ?? v.brand),
        });
      }

      if (!dryRun) {
        await prisma.vehicle.update({
          where: { id: v.id },
          data: {
            model: newModel,
            brand: (extracted?.brand ?? v.brand),
            ...(newFormattedAd ? { formattedAd: newFormattedAd } : {}),
          },
        });
      }
      fixed++;
    }

    return NextResponse.json({
      dryRun,
      total: all.length,
      candidates: candidates.length,
      fixed,
      skipped,
      samples,
      message: dryRun
        ? `[DRY RUN] ${candidates.length} candidatos, ${fixed} podem ser corrigidos. Mande dryRun:false pra aplicar.`
        : `${fixed} modelos corrigidos.`,
    });
  } catch (error) {
    console.error("[fix-vehicle-names] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado" },
      { status: 500 }
    );
  }
}
