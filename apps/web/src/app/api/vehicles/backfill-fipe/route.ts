import { NextResponse } from "next/server";
import { eq, isNull, isNotNull } from "drizzle-orm";
import { db, veiculos, carimboDeEdicao, vivosE } from "@/lib/db";
import { lerConfiguracaoNumero } from "@/lib/settings";
import { extrairFipeDoTexto } from "@/lib/actions/veiculos";
import { requireAuth } from "@/lib/auth";
import { formatVehicleAd } from "@/lib/vehicle-formatter";
import { cleanAdDescription } from "@/lib/ad-cleaner";

/**
 * POST /api/vehicles/backfill-fipe
 *
 * 1. Backfill fipePrice for vehicles where it's null (extract from rawDescription)
 * 2. Regenerate formattedAd for ALL approved vehicles (applies new Don Felipe format)
 */
export async function POST() {
  const auth = await requireAuth("ADMIN");
  if (!auth.success) return auth.response;

  try {
    // --- Step 1: Backfill FIPE prices ---
    const noFipe = await db
      .select({ id: veiculos.id, rawDescription: veiculos.rawDescription })
      .from(veiculos)
      .where(
        vivosE(veiculos, isNull(veiculos.fipePrice), isNotNull(veiculos.rawDescription))
      );

    let fipeUpdated = 0;
    for (const v of noFipe) {
      if (!v.rawDescription) continue;
      const fipe = extrairFipeDoTexto(v.rawDescription);
      if (fipe) {
        await db
          .update(veiculos)
          .set({ fipePrice: fipe, ...carimboDeEdicao(auth.user.id) })
          .where(vivosE(veiculos, eq(veiculos.id, v.id)));
        fipeUpdated++;
      }
    }

    // --- Step 2: Regenerate formattedAd for all APPROVED vehicles ---
    const margin = await lerConfiguracaoNumero("profit_margin_percent", 10);

    const approved = await db
      .select()
      .from(veiculos)
      .where(vivosE(veiculos, eq(veiculos.status, "APPROVED")));

    let adsRegenerated = 0;
    for (const v of approved) {
      // Texto editado pelo operador fica como esta, preco da linha "Por:" incluso.
      if (v.adEditedAt && v.formattedAd?.trim()) continue;
      // Quem JA tem anuncio pronto tambem fica: re-limpar custa uma chamada de
      // IA por veiculo, e um clique nesta rota varre a base inteira. Com dois
      // mil aprovados isso e uma fatura de tres digitos sem nada em troca.
      if (v.formattedAd?.trim()) continue;

      const sellingPrice = v.price * (1 + margin / 100);
      const cleanedDesc = v.rawDescription
        ? await cleanAdDescription(v.rawDescription)
        : null;

      const ad = formatVehicleAd(
        {
          model: v.model,
          brand: v.brand,
          year: v.year,
          yearModel: v.yearModel,
          km: v.km,
          price: v.price,
          fipePrice: v.fipePrice,
          transmission: v.transmission,
          fuel: v.fuel,
          features: v.features,
          rawDescription: cleanedDesc || v.rawDescription,
        },
        { profitMarginPercent: margin }
      );

      await db
        .update(veiculos)
        .set({ formattedAd: ad, sellingPrice, ...carimboDeEdicao(auth.user.id) })
        .where(vivosE(veiculos, eq(veiculos.id, v.id)));
      adsRegenerated++;
    }

    return NextResponse.json({
      fipeBackfill: { total: noFipe.length, updated: fipeUpdated },
      adsRegenerated,
      message: `FIPE: ${fipeUpdated} atualizados. Anúncios: ${adsRegenerated} regenerados no formato Don Felipe.`,
    });
  } catch (error) {
    console.error("[backfill-fipe] Error:", error);
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}
