import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { formatVehicleAd } from "@/lib/vehicle-formatter";

/**
 * Extract FIPE price from rawDescription using regex patterns.
 */
function extractFipeFromText(text: string): number | null {
  const clean = text.replace(/[\u{1F000}-\u{1FFFF}]/gu, "").trim();

  const patterns = [
    /fipe\s*:?\s*r?\$?\s*([\d.,]+)\s*(mil|reais)?/i,
    /tabela\s+fipe\s*:?\s*r?\$?\s*([\d.,]+)\s*(mil|reais)?/i,
  ];

  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match) {
      let raw = match[1];
      const suffix = match[2]?.toLowerCase();

      if (suffix === "mil") {
        raw = raw.replace(",", ".");
        const num = parseFloat(raw);
        if (!isNaN(num)) return num * 1000;
      }

      raw = raw.replace(/\./g, "").replace(",", ".");
      const num = parseFloat(raw);
      if (!isNaN(num) && num >= 1000) return num;
    }
  }

  return null;
}

/**
 * POST /api/vehicles/backfill-fipe
 *
 * 1. Backfill fipePrice for vehicles where it's null (extract from rawDescription)
 * 2. Regenerate formattedAd for ALL approved vehicles (applies new Cugini format)
 */
export async function POST() {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    // --- Step 1: Backfill FIPE prices ---
    const noFipe = await prisma.vehicle.findMany({
      where: {
        fipePrice: null,
        rawDescription: { not: null },
      },
      select: { id: true, rawDescription: true },
    });

    let fipeUpdated = 0;
    for (const v of noFipe) {
      if (!v.rawDescription) continue;
      const fipe = extractFipeFromText(v.rawDescription);
      if (fipe) {
        await prisma.vehicle.update({
          where: { id: v.id },
          data: { fipePrice: fipe },
        });
        fipeUpdated++;
      }
    }

    // --- Step 2: Regenerate formattedAd for all APPROVED vehicles ---
    const marginSetting = await prisma.setting.findUnique({
      where: { key: "profit_margin_percent" },
    });
    const margin = marginSetting ? parseFloat(marginSetting.value) : 10;

    const approved = await prisma.vehicle.findMany({
      where: { status: "APPROVED" },
    });

    let adsRegenerated = 0;
    for (const v of approved) {
      const ad = formatVehicleAd(
        {
          model: v.model,
          year: v.year,
          yearModel: v.yearModel,
          km: v.km,
          price: v.price,
          fipePrice: v.fipePrice,
          transmission: v.transmission,
          fuel: v.fuel,
          features: v.features,
          rawDescription: v.rawDescription,
        },
        { profitMarginPercent: margin }
      );

      const sellingPrice = v.price * (1 + margin / 100);

      await prisma.vehicle.update({
        where: { id: v.id },
        data: { formattedAd: ad, sellingPrice },
      });
      adsRegenerated++;
    }

    return NextResponse.json({
      fipeBackfill: { total: noFipe.length, updated: fipeUpdated },
      adsRegenerated,
      message: `FIPE: ${fipeUpdated} atualizados. Anúncios: ${adsRegenerated} regenerados no formato Cugini.`,
    });
  } catch (error) {
    console.error("[backfill-fipe] Error:", error);
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}
